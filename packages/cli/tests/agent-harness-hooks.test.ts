import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { tempDir } from "./helpers/cli";

const fragments = join(import.meta.dirname, "../registry/fragments");
// 3.4b moved the shell guards to files/ so every agent's adapter reaches them by path.
const shellSource = join(fragments, "agent-ops/files/.claude/hooks");
const harnessSource = join(fragments, "claude-harness/adapters/claude/.claude/hooks");
const Payload = Schema.Struct({
  session_id: Schema.String,
  hook_event_name: Schema.Literal("PreToolUse"),
  tool_name: Schema.Literal("Bash"),
  tool_input: Schema.Struct({ command: Schema.String }),
});
const payloads = Schema.decodeUnknownSync(
  Schema.Struct({
    pattern: Payload,
    lexer: Payload,
    example: Payload,
    dirtyReset: Payload,
    resetExample: Payload,
  }),
)(
  JSON.parse(
    readFileSync(join(import.meta.dirname, "fixtures/agent-harness/payloads.json"), "utf8"),
  ),
);
const Denial = Schema.Struct({
  hookSpecificOutput: Schema.Struct({
    hookEventName: Schema.Literal("PreToolUse"),
    permissionDecision: Schema.Literal("deny"),
    permissionDecisionReason: Schema.NonEmptyString,
  }),
});
const dirs: ReturnType<typeof tempDir>[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) dir.cleanup();
});
function project(harness = false) {
  const dir = tempDir();
  dirs.push(dir);
  cpSync(shellSource, join(dir.path, ".claude/hooks"), { recursive: true });
  if (harness) cpSync(harnessSource, join(dir.path, ".claude/hooks"), { recursive: true });
  return dir.path;
}
function hook(
  root: string,
  script: "shell" | "typescript",
  payload: typeof Payload.Type,
  cwd = root,
) {
  const result = spawnSync(
    script === "shell" ? "/bin/bash" : "bun",
    [
      join(
        root,
        ".claude/hooks",
        script === "shell" ? "block-destructive.sh" : "guard-commands.ts",
      ),
    ],
    {
      cwd,
      input: JSON.stringify(payload),
      encoding: "utf8",
      timeout: 10_000,
      env: {
        HOME: root,
        PATH: process.env.PATH,
        CLAUDE_PROJECT_DIR: root,
        GIT_CONFIG_NOSYSTEM: "1",
      },
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
function denied(result: ReturnType<typeof hook>) {
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout, "a blocked hook must emit a JSON denial").not.toBe("");
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  return Schema.decodeUnknownSync(Denial)(JSON.parse(result.stdout));
}
function allowed(result: ReturnType<typeof hook>) {
  expect(result).toEqual({ status: 0, stdout: "", stderr: "" });
}

test("the shell alone blocks its recorded pattern and allows the lexer gap and quoted example [3.4a#3]", () => {
  const root = project();
  denied(hook(root, "shell", payloads.pattern));
  allowed(hook(root, "shell", payloads.lexer));
  allowed(hook(root, "shell", payloads.example));
});

test.each([
  ["shell", "lexer"],
  ["shell", "pattern"],
  ["typescript", "lexer"],
  ["typescript", "pattern"],
] as const)("%s with the harness blocks the recorded %s case [3.4a#3]", (script, name) => {
  denied(hook(project(true), script, payloads[name]));
});

test.each(["shell", "typescript"] as const)(
  "%s with the harness allows a quoted destructive example [3.4a#3]",
  (script) => allowed(hook(project(true), script, payloads.example)),
);

test("delegation follows a symlink with spaces and Unicode from an unrelated cwd [3.4a#5]", () => {
  const root = project(true);
  const alias = join(root, "project café link");
  symlinkSync(root, alias);
  const outside = tempDir();
  dirs.push(outside);
  const cwd = join(outside.path, "unrelated cwd");
  mkdirSync(cwd);
  allowed(hook(alias, "shell", payloads.example, cwd));
  denied(hook(alias, "shell", payloads.lexer, cwd));
});

test.each(["shell", "typescript"] as const)(
  "%s protects uncommitted work from a quoted hard reset [3.4a#6]",
  (script) => {
    const root = project(true);
    const env = { HOME: root, PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1" };
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8", timeout: 10_000 });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      return result.stdout;
    };
    git(["init", "--quiet"]);
    writeFileSync(join(root, "work.txt"), "committed\n");
    git(["add", "work.txt"]);
    git([
      "-c",
      "user.name=Acceptance",
      "-c",
      "user.email=acceptance@example.test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ]);
    writeFileSync(join(root, "work.txt"), "unfinished work\n");
    const before = git(["status", "--porcelain", "--", "work.txt"]);
    expect(before).toContain("M work.txt");
    allowed(hook(root, script, payloads.resetExample));
    denied(hook(root, script, payloads.dirtyReset));
    expect(readFileSync(join(root, "work.txt"), "utf8")).toBe("unfinished work\n");
    expect(git(["status", "--porcelain", "--", "work.txt"])).toBe(before);
  },
);

test("removing the harness from an existing hook directory leaves working shell guardrails [3.4a#7]", () => {
  const root = project(true);
  for (const name of readdirSync(harnessSource)) rmSync(join(root, ".claude/hooks", name));
  denied(hook(root, "shell", payloads.pattern));
  allowed(hook(root, "shell", payloads.example));
  allowed(hook(root, "shell", payloads.lexer));
});
