import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Fixture, makeFixture, runHook } from "../helpers/hooks";

let project: Fixture;
let server: ChildProcess | undefined;

beforeEach(() => {
  project = makeFixture();
});
afterEach(() => {
  server?.kill();
  server = undefined;
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

describe("dev-server-status", { timeout: 30_000 }, () => {
  it("says nothing without logs/dev.pid", async () => {
    expect(await sessionStart()).toBe("");
  });

  it("ignores a stale pid file", async () => {
    put("logs/dev.pid", "999999 5999\n");
    expect(await sessionStart()).toBe("");
  });

  it("says where a running server is and how many warn/error lines its log has", async () => {
    const script = put("scripts/dev.ts", "setTimeout(() => {}, 60_000);\n");
    server = spawn("bun", [script], { stdio: "ignore" });
    const pid = server.pid as number;
    // Wait until ps shows the process by its script name, which is what the hook looks for.
    await vi.waitFor(() => {
      const ps = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
      expect(ps.stdout).toContain("scripts/dev.ts");
    });
    put("logs/dev.pid", `${pid} 5999\n`);
    put(
      "logs/server.jsonl",
      '{"level":"info","msg":"ok"}\n{"level":"warn","msg":"slow"}\n{"level":"error","msg":"bad"}\n',
    );

    expect(await sessionStart()).toContain(
      `A dev server is running at http://localhost:5999 (pid ${pid}); use it rather than starting another. logs/server.jsonl has 2 warn/error line(s) from this run:`,
    );
  });
});
