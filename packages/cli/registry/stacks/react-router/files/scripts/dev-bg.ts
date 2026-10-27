#!/usr/bin/env bun
// `bun run dev:bg` / `bun run dev:stop`: the dev server for agents and scripts, which can't
// sit in a foreground terminal.
//
//   start  Reuse the dev server already running from this checkout (yours or someone
//          else's), or start scripts/dev.ts detached. Returns once /healthz answers, and
//          prints the URL. Exits 1 with the startup output if the server doesn't come up.
//   stop   Stop the dev server running from this checkout, however it was started (the same
//          as Ctrl-C in its terminal).
//
// Both find the server through logs/dev.pid, which scripts/dev.ts writes while it runs.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type DevServer, readPidFile, runningDevServer } from "./dev-pid";

process.chdir(join(import.meta.dirname, ".."));

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === "ESRCH") return false;
    // It exists but belongs to another user.
    if (code === "EPERM") return true;
    throw error;
  }
}

// Why /healthz didn't answer OK, or undefined when it did. Refused connections and timeouts are
// expected while the server boots; the reason goes into the message if polling gives up.
async function unhealthy(port: string): Promise<string | undefined> {
  try {
    const res = await fetch(`http://localhost:${port}/healthz`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return undefined;
    await res.body?.cancel();
    return `HTTP ${res.status}`;
  } catch (error) {
    const { code, message } = error as NodeJS.ErrnoException;
    return code ?? message;
  }
}

// logs/dev.pid names pid: dev.ts writes it once it owns the port and logs/.
function ours(pid: number): boolean {
  return readPidFile()?.pid === String(pid);
}

// Poll /healthz while the server process lives. Only once the pid file is ours, so a server on
// the same port from another checkout can't pass for this one. Returns undefined once healthy,
// otherwise why it gave up.
async function waitHealthy({ pid, port }: DevServer, seconds: number): Promise<string | undefined> {
  let reason = "logs/dev.pid never named the server";
  for (let i = 0; i < seconds * 2; i++) {
    if (!alive(pid)) return "the server process exited";
    if (ours(pid)) {
      const failure = await unhealthy(port);
      if (!failure) return undefined;
      reason = `last /healthz attempt: ${failure}`;
    }
    await sleep(500);
  }
  return reason;
}

async function waitExit(pid: number, seconds: number): Promise<void> {
  for (let i = 0; i < seconds * 2 && alive(pid); i++) await sleep(500);
}

function tail(file: string, lines: number): string {
  if (!existsSync(file)) return "";
  return `${readFileSync(file, "utf8").trimEnd().split("\n").slice(-lines).join("\n")}\n`;
}

function ready({ pid, port }: DevServer): void {
  console.log(`Dev server running: http://localhost:${port} (pid ${pid})`);
  console.log(
    "Logs: logs/server.jsonl (JSON lines), logs/dev.log (terminal). Stop: bun run dev:stop",
  );
}

async function start(): Promise<number> {
  const running = runningDevServer();
  if (running) {
    const failure = await waitHealthy(running, 60);
    if (!failure) {
      ready(running);
      return 0;
    }
    process.stderr.write(
      `A dev server is running (pid ${running.pid}, port ${running.port}) but /healthz doesn't answer (${failure}). Last lines of logs/dev.log:\n`,
    );
    process.stderr.write(tail("logs/dev.log", 30));
    return 1;
  }
  const port = process.env.PORT_WEB || "5173";
  // The terminal copy lands in logs/dev.log; this file keeps only dev.ts's own complaints
  // (a refusal to start), overwritten on every start.
  mkdirSync("logs", { recursive: true });
  const out = "logs/dev-bg.err";
  const err = openSync(out, "w");
  // detached: its own session and process group, so `stop` can signal all of it and closing
  // this terminal doesn't hang it up.
  const child = spawn(process.execPath, ["scripts/dev.ts"], {
    detached: true,
    stdio: ["ignore", "ignore", err],
  });
  closeSync(err);
  child.unref();
  // A failed spawn throws above under bun; this only narrows the type.
  const pid = child.pid;
  if (pid === undefined) throw new Error("spawn returned no pid for scripts/dev.ts");
  const failure = await waitHealthy({ pid, port }, 90);
  if (!failure) {
    ready({ pid, port });
    return 0;
  }
  process.stderr.write(`The dev server didn't come up on port ${port} (${failure}). Its output:\n`);
  process.stderr.write(readFileSync(out, "utf8"));
  // Only this attempt's log: dev.ts exits before writing one when it refuses to start.
  if (existsSync("logs/dev.log") && statSync("logs/dev.log").mtimeMs > statSync(out).mtimeMs) {
    process.stderr.write(tail("logs/dev.log", 30));
  }
  if (alive(pid)) await stop(true);
  return 1;
}

function pgidOf(pid: number): string {
  return spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
}

function signal(target: number, sig: NodeJS.Signals): void {
  try {
    process.kill(target, sig);
  } catch (error) {
    // Already gone between the check and the signal.
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

async function stop(quiet = false): Promise<number> {
  const say = quiet ? () => {} : console.log;
  const running = runningDevServer();
  if (!running) {
    say("No dev server is running from this checkout.");
    return 0;
  }
  const { pid, port } = running;
  const pgid = pgidOf(pid);
  const target = pgid && pgid !== pgidOf(process.pid) ? -Number(pgid) : pid;
  // SIGINT, like Ctrl-C: dev.ts lets the server shut down and finish writing logs/dev.log.
  signal(target, "SIGINT");
  await waitExit(pid, 10);
  if (alive(pid)) {
    signal(target, "SIGTERM");
    await waitExit(pid, 5);
  }
  if (alive(pid)) {
    console.error(
      `The dev server (pid ${pid}, process group ${pgid}) didn't exit; port ${port} may still be taken.`,
    );
    return 1;
  }
  say(`Stopped the dev server on port ${port} (pid ${pid}).`);
  return 0;
}

const command = process.argv[2];
if (command === "start") {
  process.exitCode = await start();
} else if (command === "stop") {
  process.exitCode = await stop();
} else {
  console.error("usage: scripts/dev-bg.ts start|stop");
  process.exitCode = 2;
}
