import assert from "node:assert/strict";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Fixture, makeFixture, runHook } from "../helpers/hooks";

let project: Fixture;
let children: ChildProcess[] = [];
let listener: Server | undefined;

beforeEach(() => {
  project = makeFixture();
});
afterEach(() => {
  for (const child of children) child.kill("SIGKILL");
  children = [];
  listener?.close();
  listener = undefined;
  project.cleanup();
});

const put = (name: string, content: string) => {
  const path = join(project.dir, name);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
};

const sessionStart = async () => {
  const result = await runHook(
    "SessionStart",
    "dev-server-status",
    { session_id: "s", hook_event_name: "SessionStart", source: "startup" },
    { env: { CLAUDE_PROJECT_DIR: project.dir } },
  );
  expect(result.code).toBe(0);
  return result.stdout;
};

/** A stand-in dev process the hook recognizes by its script name, as it does scripts/dev.ts. */
async function fakeDevProcess(): Promise<number> {
  const script = put("scripts/dev.ts", "setTimeout(() => {}, 60_000);\n");
  const child = spawn("bun", [script], { stdio: "ignore" });
  children.push(child);
  const pid = child.pid;
  assert(pid !== undefined);
  await vi.waitFor(() => {
    const ps = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
    expect(ps.stdout).toContain("scripts/dev.ts");
  });
  return pid;
}

/** An HTTP server answering 200 on every path, standing in for a healthy dev server. */
async function healthyServer(): Promise<number> {
  const server = createServer((_req, res) => res.end("ok"));
  listener = server;
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return address.port;
}

describe("dev-server-status", { timeout: 30_000 }, () => {
  it("says nothing without logs/dev.pid", async () => {
    expect(await sessionStart()).toBe("");
  });

  it("ignores a stale pid file", async () => {
    put("logs/dev.pid", "999999 5999 5998\n");
    expect(await sessionStart()).toBe("");
  });

  it("reports ports, health, the logs command and the warn/error count", async () => {
    const pid = await fakeDevProcess();
    const port = await healthyServer();
    // Nothing listens on the site's port.
    put("logs/dev.pid", `${pid} ${port}\n`);
    put(
      "logs/server.jsonl",
      [
        '{"time":"2026-01-01T00:00:00.000Z","level":"info","msg":"ok"}',
        '{"time":"2026-01-01T00:00:01.000Z","level":"warn","msg":"slow"}',
        "",
      ].join("\n"),
    );
    put(
      "logs/dev.jsonl",
      '{"time":"2026-01-01T00:00:02.000Z","level":"error","msg":"[vite] http proxy error","source":"web"}\n',
    );

    const out = await sessionStart();
    expect(out).toContain(`Dev servers are running from this checkout (pid ${pid})`);
    expect(out).toContain(`API   http://localhost:${port}  healthy`);
    expect(out).toContain("logs  bun run logs");
    expect(out).toContain("2 warn/error record(s) this run: bun run logs --level warn");
  });

  it("reports an unhealthy API and tells the agent how to restart", async () => {
    const pid = await fakeDevProcess();
    put("logs/dev.pid", `${pid} 1\n`);
    const out = await sessionStart();
    expect(out).toContain("API   http://localhost:1  not answering /healthz");
    expect(out).toContain("Restart with bun run dev:stop, then bun run dev:bg.");
  });

  it("stays quiet with exit 0 when the report can't be built", async () => {
    const pid = await fakeDevProcess();
    const port = await healthyServer();
    put("logs/dev.pid", `${pid} ${port}\n`);
    // Reading a directory as the log fails with EISDIR.
    mkdirSync(join(project.dir, "logs/server.jsonl"));
    const result = await runHook(
      "SessionStart",
      "dev-server-status",
      { session_id: "s", hook_event_name: "SessionStart", source: "startup" },
      { env: { CLAUDE_PROJECT_DIR: project.dir } },
    );
    expect(result).toMatchObject({ code: 0, stdout: "", stderr: "" });
  });

  it("tells the agent to stop the servers a killed session left behind", async () => {
    // A live process group the pid file names, with no dev process behind it.
    const orphan = spawn("bun", ["-e", "setInterval(() => {}, 1000)"], {
      detached: true,
      stdio: "ignore",
    });
    children.push(orphan);
    put("logs/dev.pid", `999999 5999 ${orphan.pid}\n`);
    expect(await sessionStart()).toContain("Stop them with bun run dev:stop");
  });
});
