import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const project = resolve(import.meta.dirname, "../..");
let checkout: string;
const cleanup: (() => void)[] = [];

function sessionCommand(): string {
  const config: unknown = JSON.parse(readFileSync(join(project, ".codex/hooks.json"), "utf8"));
  assert(config && typeof config === "object" && "hooks" in config);
  const hooks = config.hooks;
  assert(hooks && typeof hooks === "object" && "SessionStart" in hooks);
  assert(Array.isArray(hooks.SessionStart));
  const commands: string[] = [];
  for (const group of hooks.SessionStart) {
    assert(Array.isArray(group.hooks));
    for (const hook of group.hooks) {
      assert(typeof hook.command === "string");
      if (hook.command.includes("/dev-server-status.ts")) commands.push(hook.command);
    }
  }
  assert.equal(commands.length, 1);
  const command = commands[0];
  assert(command);
  return command;
}

function sessionStart(path = process.env.PATH ?? "") {
  const child = spawn("sh", ["-c", sessionCommand()], {
    cwd: join(checkout, "nested"),
    env: { PATH: path, HOME: tmpdir() },
  });
  child.stdin.end(JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }));
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function copyStatusHook() {
  for (const file of [
    ".claude/hooks/dev-server-status.ts",
    ".claude/hooks/_lib.ts",
    "scripts/dev-status.ts",
    "scripts/dev-pid.ts",
    "scripts/dev-logs.ts",
  ]) {
    mkdirSync(join(checkout, file, ".."), { recursive: true });
    copyFileSync(join(project, file), join(checkout, file));
  }
}

beforeEach(() => {
  checkout = mkdtempSync(join(tmpdir(), "codex start "));
  expect(
    spawnSync("git", ["init", "-q", checkout], { env: { PATH: process.env.PATH } }).status,
  ).toBe(0);
  mkdirSync(join(checkout, "nested"));
});
afterEach(() => {
  for (const step of cleanup.splice(0)) step();
  rmSync(checkout, { recursive: true, force: true });
});

describe("Codex SessionStart", { timeout: 30_000 }, () => {
  it("reports a healthy checkout server from a nested cwd", async () => {
    copyStatusHook();
    writeFileSync(join(checkout, "scripts/dev.ts"), "setInterval(() => {}, 1000);\n");
    const dev = spawn("bun", [join(checkout, "scripts/dev.ts")], { stdio: "ignore" });
    cleanup.push(() => {
      dev.kill("SIGKILL");
    });
    const server = createServer((_req, res) => res.end("ok"));
    cleanup.push(() => {
      server.close();
    });
    await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
    const address = server.address();
    assert(address && typeof address === "object");
    await vi.waitFor(() =>
      expect(
        spawnSync("ps", ["-o", "command=", "-p", String(dev.pid)], { encoding: "utf8" }).stdout,
      ).toContain("scripts/dev.ts"),
    );
    mkdirSync(join(checkout, "logs"));
    writeFileSync(join(checkout, "logs/dev.pid"), `${dev.pid} ${address.port}\n`);
    const result = await sessionStart();
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`Dev servers are running from this checkout (pid ${dev.pid})`);
    expect(result.stdout).toContain(`API   http://localhost:${address.port}  healthy`);
  });
  it("stays quiet when the hook file is missing", async () => {
    expect(await sessionStart()).toEqual({ code: 0, stdout: "", stderr: "" });
  });
  it.skipIf(existsSync("/usr/bin/bun") || existsSync("/bin/bun"))(
    "stays quiet when bun is missing",
    async () => {
      copyStatusHook();
      expect(await sessionStart("/usr/bin:/bin")).toEqual({ code: 0, stdout: "", stderr: "" });
    },
  );
  it("stays quiet when the advisory hook crashes", async () => {
    mkdirSync(join(checkout, ".claude/hooks"), { recursive: true });
    writeFileSync(
      join(checkout, ".claude/hooks/dev-server-status.ts"),
      'throw new Error("broken report");',
    );
    expect(await sessionStart()).toEqual({ code: 0, stdout: "", stderr: "" });
  });
});
