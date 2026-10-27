import { type ChildProcess, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, test, vi } from "vitest";
import {
  decide,
  foregroundCleared,
  SECOND_SIGNAL_MS,
  type SignalState,
} from "../src/platform/signals";
import { alive, tempDir } from "./helpers/cli";

const pkg = join(import.meta.dirname, "..");
const fixture = join(import.meta.dirname, "fixtures/signals.ts");

describe("the signal policy (A3)", () => {
  const idle: SignalState = {};
  test("without an interactive child, the first SIGINT, SIGTERM or SIGHUP interrupts", () => {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
      expect(decide(idle, signal, 1000, false)).toEqual({
        action: "interrupt",
        state: { interruptedAt: 1000 },
      });
  });
  test("a second signal within 1s is the same Ctrl+C; one 1s or more later forces the exit", () => {
    const after = { interruptedAt: 1000 };
    expect(decide(after, "SIGINT", 1000 + SECOND_SIGNAL_MS - 1, false).action).toBe("ignore");
    expect(decide(after, "SIGTERM", 1100, false).action).toBe("ignore");
    expect(decide(after, "SIGINT", 1000 + SECOND_SIGNAL_MS, false).action).toBe("force-exit");
  });
  test("with an interactive child, SIGINT and SIGQUIT are the child's; SIGTERM and SIGHUP are forwarded", () => {
    expect(decide(idle, "SIGINT", 500, true)).toEqual({
      action: "ignore",
      state: { ignoredAt: 500 },
    });
    expect(decide(idle, "SIGQUIT", 0, true)).toEqual({ action: "ignore", state: idle });
    expect(decide(idle, "SIGTERM", 0, true)).toEqual({
      action: "forward",
      state: { forwarded: true },
    });
    expect(decide(idle, "SIGHUP", 0, true)).toEqual({
      action: "forward",
      state: { forwarded: true },
    });
    expect(decide({ interruptedAt: 0 }, "SIGINT", 5000, true).action).toBe("ignore");
  });
  test("a SIGINT within 1s of one the child had is that same Ctrl+C, even after the child exits", () => {
    const after = decide(idle, "SIGINT", 500, true).state;
    expect(decide(after, "SIGINT", 500 + SECOND_SIGNAL_MS - 1, false)).toEqual({
      action: "ignore",
      state: after,
    });
    expect(decide(after, "SIGINT", 500 + SECOND_SIGNAL_MS, false)).toEqual({
      action: "interrupt",
      state: { ignoredAt: 500, interruptedAt: 500 + SECOND_SIGNAL_MS },
    });
  });
  test("once the child exits, a forwarded SIGTERM or SIGHUP interrupts the CLI", () => {
    expect(foregroundCleared({ forwarded: true }, 2000)).toEqual({
      action: "interrupt",
      state: { interruptedAt: 2000 },
    });
    expect(foregroundCleared({ ignoredAt: 500 }, 2000)).toEqual({
      action: "ignore",
      state: { ignoredAt: 500 },
    });
  });
  test("SIGQUIT without an interactive child keeps its default action", () => {
    expect(decide(idle, "SIGQUIT", 0, false)).toEqual({ action: "default", state: idle });
  });
});

const groupAlive = (pid: number) => alive(-pid);
/**
 * Starts `bun <args>` as the leader of its own process group, as a shell would start a job.
 * `ulimit -c 0` stops a SIGQUIT death writing a core dump: on CI runners a crash handler
 * collects it before the process exits, which outlasts the test timeout.
 */
function launch(args: string[], cwd: string, home: string) {
  const child = spawn("/bin/sh", ["-c", 'ulimit -c 0; exec bun "$@"', "sh", ...args], {
    cwd,
    detached: true,
    stdio: "ignore",
    env: { PATH: process.env.PATH, HOME: home },
  });
  const closed = new Promise<{ status: number | null; at: number }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, at: Date.now() }));
  });
  return { child, closed, pid: child.pid as number };
}
function cleanup(child: ChildProcess, dir: { path: string; cleanup: () => void }) {
  for (const pid of [child.pid, readPid(dir.path, "leader")])
    if (pid) {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {}
    }
  dir.cleanup();
}
function readPid(dir: string, file: string): number | undefined {
  const path = join(dir, file);
  return existsSync(path) ? Number(readFileSync(path, "utf8").trim()) : undefined;
}
const has = (dir: string, file: string) => existsSync(join(dir, file));
const waitFor = (dir: string, file: string) =>
  vi.waitFor(() => expect(has(dir, file)).toBe(true), { timeout: 5000 });

describe("signals reaching a real CLI process", () => {
  test("SIGINT to the process group belongs to the interactive child; the parent keeps running", async () => {
    const dir = tempDir();
    writeFileSync(join(dir.path, "release"), "");
    const cli = launch([fixture, "interactive", dir.path], pkg, dir.path);
    try {
      await waitFor(dir.path, "child-ready");
      process.kill(-cli.pid, "SIGINT");
      expect((await cli.closed).status).toBe(7);
      expect(has(dir.path, "child-SIGINT")).toBe(true);
      expect(readFileSync(join(dir.path, "parent-done"), "utf8")).toBe("7");
    } finally {
      cleanup(cli.child, dir);
    }
  }, 15000);

  test("a wrapper's late copy of the child's Ctrl+C, arriving after the child exits, is ignored", async () => {
    const dir = tempDir();
    const cli = launch([fixture, "interactive", dir.path], pkg, dir.path);
    try {
      await waitFor(dir.path, "child-ready");
      process.kill(-cli.pid, "SIGINT");
      await waitFor(dir.path, "parent-done");
      process.kill(cli.pid, "SIGINT");
      writeFileSync(join(dir.path, "release"), "");
      expect((await cli.closed).status).toBe(7);
    } finally {
      cleanup(cli.child, dir);
    }
  }, 15000);

  test("SIGINT to the parent's pid alone reaches neither; SIGTERM is forwarded to the child", async () => {
    const dir = tempDir();
    const cli = launch([fixture, "interactive", dir.path], pkg, dir.path);
    try {
      await waitFor(dir.path, "child-ready");
      // An agent or script signaling quickstacks's pid only: ignored, and the child never sees it.
      process.kill(cli.pid, "SIGINT");
      await delay(300);
      expect(cli.child.exitCode).toBeNull();
      expect(has(dir.path, "child-SIGINT")).toBe(false);
      process.kill(cli.pid, "SIGTERM");
      // The child handled the forwarded SIGTERM; then the CLI stops too.
      expect((await cli.closed).status).toBe(130);
      expect(has(dir.path, "child-SIGTERM")).toBe(true);
    } finally {
      cleanup(cli.child, dir);
    }
  }, 15000);

  test("SIGHUP to the parent is forwarded to the interactive child", async () => {
    const dir = tempDir();
    const cli = launch([fixture, "interactive", dir.path], pkg, dir.path);
    try {
      await waitFor(dir.path, "child-ready");
      process.kill(cli.pid, "SIGHUP");
      expect((await cli.closed).status).toBe(130);
      expect(has(dir.path, "child-SIGHUP")).toBe(true);
    } finally {
      cleanup(cli.child, dir);
    }
  }, 15000);

  test("without an interactive child, SIGINT exits 130 and the started group is gone", async () => {
    const dir = tempDir();
    const cli = launch([fixture, "start", dir.path], pkg, dir.path);
    try {
      await waitFor(dir.path, "ready");
      await waitFor(dir.path, "leader");
      const leader = readPid(dir.path, "leader") as number;
      expect(groupAlive(leader)).toBe(true);
      process.kill(cli.pid, "SIGINT");
      expect((await cli.closed).status).toBe(130);
      expect(groupAlive(leader)).toBe(false);
    } finally {
      cleanup(cli.child, dir);
    }
  }, 15000);

  test("SIGQUIT without an interactive child dies by SIGQUIT, and the started group is gone", async () => {
    const dir = tempDir();
    const cli = launch([fixture, "start", dir.path], pkg, dir.path);
    const signaled = new Promise<string | null>((resolve) =>
      cli.child.on("exit", (_code, signal) => resolve(signal)),
    );
    try {
      await waitFor(dir.path, "ready");
      await waitFor(dir.path, "leader");
      const leader = readPid(dir.path, "leader") as number;
      process.kill(cli.pid, "SIGQUIT");
      expect(await signaled).toBe("SIGQUIT");
      await vi.waitFor(() => expect(groupAlive(leader)).toBe(false), { timeout: 1000 });
    } finally {
      cleanup(cli.child, dir);
    }
  }, 15000);

  test("two SIGINTs 100 ms apart count as one: the slow finalizer completes, exit 130", async () => {
    const dir = tempDir();
    const cli = launch([fixture, "slow", dir.path], pkg, dir.path);
    try {
      await waitFor(dir.path, "ready");
      await waitFor(dir.path, "leader");
      const leader = readPid(dir.path, "leader") as number;
      process.kill(cli.pid, "SIGINT");
      await delay(100);
      process.kill(cli.pid, "SIGINT");
      expect((await cli.closed).status).toBe(130);
      expect(has(dir.path, "finalized")).toBe(true);
      expect(groupAlive(leader)).toBe(false);
    } finally {
      cleanup(cli.child, dir);
    }
  }, 15000);

  test("a second SIGINT 1.5 s later exits at once with 130 and kills the registered group", async () => {
    const dir = tempDir();
    const cli = launch([fixture, "slow", dir.path], pkg, dir.path);
    try {
      await waitFor(dir.path, "ready");
      await waitFor(dir.path, "leader");
      const leader = readPid(dir.path, "leader") as number;
      process.kill(cli.pid, "SIGINT");
      await delay(1500);
      const second = Date.now();
      process.kill(cli.pid, "SIGINT");
      const closed = await cli.closed;
      expect(closed.status).toBe(130);
      expect(closed.at - second).toBeLessThan(1000);
      expect(has(dir.path, "finalized")).toBe(false);
      await vi.waitFor(() => expect(groupAlive(leader)).toBe(false), { timeout: 1000 });
    } finally {
      cleanup(cli.child, dir);
    }
  }, 15000);

  test("one Ctrl+C under the dev wrapper, which also forwards it, runs finalizers and exits 130", async () => {
    const dir = tempDir();
    mkdirSync(join(dir.path, "scripts"));
    mkdirSync(join(dir.path, "src"));
    copyFileSync(join(pkg, "scripts/dev.ts"), join(dir.path, "scripts/dev.ts"));
    writeFileSync(join(dir.path, "src/bin.ts"), `await import(${JSON.stringify(fixture)});\n`);
    const cli = launch(["scripts/dev.ts", "slow", dir.path], dir.path, dir.path);
    try {
      await waitFor(dir.path, "ready");
      await waitFor(dir.path, "leader");
      const leader = readPid(dir.path, "leader") as number;
      // The terminal delivers SIGINT to the whole foreground group: the wrapper and the CLI.
      process.kill(-cli.pid, "SIGINT");
      expect((await cli.closed).status).toBe(130);
      expect(has(dir.path, "finalized")).toBe(true);
      expect(groupAlive(leader)).toBe(false);
    } finally {
      cleanup(cli.child, dir);
    }
  }, 15000);
});
