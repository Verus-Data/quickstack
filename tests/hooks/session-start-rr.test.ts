import { execFileSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type Fixture, makeFixture, runHook, withoutGitVars } from "../helpers/hooks";

let project: Fixture;
let temp: string;
let envDir: string;
let envFile: string;
let socket: string;
let server: Server;
let env: Record<string, string | undefined>;

beforeEach(async () => {
  project = makeFixture();
  temp = mkdtempSync(join(tmpdir(), "qs-"));
  envDir = join(temp, "environment");
  mkdirSync(envDir);
  envFile = join(envDir, "env");
  writeFileSync(envFile, "");
  const bin = join(temp, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "launchctl"),
    '#!/bin/sh\nprintf "\\tSSH_AUTH_SOCK => %s\\n" "$FAKE_AGENT_SOCK"\n',
    { mode: 0o755 },
  );
  writeFileSync(join(bin, "ssh-add"), '#!/bin/sh\nexit "$FAKE_SSH_ADD_EXIT"\n', {
    mode: 0o755,
  });
  socket = join(temp, "agent.sock");
  server = createServer();
  server.listen(socket);
  await once(server, "listening");
  env = {
    CLAUDE_PROJECT_DIR: project.dir,
    CLAUDE_ENV_FILE: envFile,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    FAKE_AGENT_SOCK: socket,
    FAKE_SSH_ADD_EXIT: "0",
  };
  git("init", "--quiet");
  git("config", "quickstacks.rr", "true");
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  project.cleanup();
  rmSync(temp, { recursive: true, force: true });
});

function git(...args: string[]) {
  execFileSync("git", args, {
    cwd: project.dir,
    env: withoutGitVars({ ...process.env, ...env }),
  });
}

async function hook(overrides: Record<string, string | undefined> = {}) {
  const result = await runHook(
    "SessionStart",
    "session-start",
    {},
    {
      cwd: project.dir,
      env: { ...env, ...overrides },
    },
  );
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  return result;
}

async function unchangedAdvisory() {
  const result = await hook();
  const baseline = await hook({ CLAUDE_ENV_FILE: undefined });
  expect(result.stdout).toBe(baseline.stdout);
}

test("an opted-in clone exports a usable agent socket without changing the advisory", async () => {
  await unchangedAdvisory();
  expect(readFileSync(envFile, "utf8")).toBe(`export SSH_AUTH_SOCK=${socket}\n`);
  expect(
    execFileSync("bash", ["-c", '. "$1"; printf %s "$SSH_AUTH_SOCK"', "_", envFile], {
      encoding: "utf8",
    }),
  ).toBe(socket);
});

test("a clone without rr opt-in leaves the env file empty and the advisory unchanged", async () => {
  git("config", "--unset", "quickstacks.rr");
  await unchangedAdvisory();
  expect(readFileSync(envFile, "utf8")).toBe("");
});

test("an explicit false rr setting leaves the env file empty", async () => {
  git("config", "quickstacks.rr", "false");
  await hook();
  expect(readFileSync(envFile, "utf8")).toBe("");
});

test("an unset CLAUDE_ENV_FILE creates no file", async () => {
  unlinkSync(envFile);
  await hook({ CLAUDE_ENV_FILE: undefined });
  expect(readdirSync(envDir)).toEqual([]);
});

test("an agent without identities leaves the env file empty and the advisory unchanged", async () => {
  env.FAKE_SSH_ADD_EXIT = "1";
  await unchangedAdvisory();
  expect(readFileSync(envFile, "utf8")).toBe("");
});

test("an unreachable agent leaves the env file empty and the advisory unchanged", async () => {
  env.FAKE_SSH_ADD_EXIT = "2";
  await unchangedAdvisory();
  expect(readFileSync(envFile, "utf8")).toBe("");
});

test.runIf(process.platform === "linux")(
  "absent launchctl leaves the env file empty (Linux)",
  async () => {
    await hook({ PATH: process.env.PATH });
    expect(readFileSync(envFile, "utf8")).toBe("");
  },
);

test("a launchctl path without a socket leaves the env file empty", async () => {
  await hook({ FAKE_AGENT_SOCK: join(temp, "missing.sock") });
  expect(readFileSync(envFile, "utf8")).toBe("");
});
