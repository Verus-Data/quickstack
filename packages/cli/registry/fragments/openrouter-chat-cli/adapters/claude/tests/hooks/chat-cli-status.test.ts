import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Fixture, makeFixture, runHook } from "../helpers/hooks";

let project: Fixture;
// Where the hook keeps its log offset; per test, so no state leaks between them or from the machine.
let tmp: string;

const NATIVE = `@opentui/core-${process.platform}-${process.arch}`;

const put = (name: string, content = "", dir = project.real) => {
  const path = join(dir, name);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
};
const status = async (dir = project.real) => {
  const result = await runHook(
    "SessionStart",
    "chat-cli-status",
    { session_id: "s", hook_event_name: "SessionStart", source: "startup" },
    { env: { CLAUDE_PROJECT_DIR: dir, TMPDIR: tmp } },
  );
  expect(result.code).toBe(0);
  return result.stdout;
};

beforeEach(() => {
  project = makeFixture();
  tmp = mkdtempSync(join(tmpdir(), "hook-tmp-"));
});
afterEach(() => {
  project.cleanup();
  rmSync(tmp, { recursive: true, force: true });
});

describe("chat-cli-status", { timeout: 30_000 }, () => {
  it("notes a missing OpenTUI native package for this host", async () => {
    put("node_modules/@opentui/core/package.json", "{}\n");
    expect(await status()).toContain(
      `node_modules/${NATIVE} is missing, so OpenTUI can't load its native library`,
    );
    put(`node_modules/${NATIVE}/package.json`, "{}\n");
    expect(await status()).not.toContain("OpenTUI");
  });

  describe("with the stub servers running from the checkout", () => {
    let stub: ChildProcess | undefined;
    afterEach(() => {
      stub?.kill();
      stub = undefined;
    });

    it("says they are running and how to stop them", async () => {
      put("scripts/stub-server.ts", "setTimeout(() => {}, 60_000);\n");
      stub = spawn("bun", [join(project.real, "scripts/stub-server.ts")], { stdio: "ignore" });
      const pid = stub.pid as number;
      // Wait until ps shows the process by its script name, which is what the hook looks for.
      await vi.waitFor(() => {
        const ps = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
        expect(ps.stdout).toContain("scripts/stub-server.ts");
      });
      put("logs/stub.pid", `${pid} 5190 5191\n`);
      expect(await status()).toContain(`The application stub servers are running (pid ${pid});`);
    });

    it("ignores a stale pid file", async () => {
      put("logs/stub.pid", "999999\n");
      expect(await status()).not.toContain("stub");
    });
  });
});
