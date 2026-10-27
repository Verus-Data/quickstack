import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bash, hookCommand, REPO, wiredCommands, withoutGitVars } from "../helpers/hooks";

type CodexHooks = {
  hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>;
};

/** Run Codex's Bash PreToolUse command as Codex does: no CLAUDE_PROJECT_DIR, cwd a checkout. */
function codexPreToolUse(command: string, cwd = REPO, index = 0) {
  const config = JSON.parse(readFileSync(join(REPO, ".codex/hooks.json"), "utf8")) as CodexHooks;
  const group = config.hooks.PreToolUse?.find((g) => new RegExp(g.matcher ?? "").test("Bash"));
  const hook = group?.hooks[index]?.command;
  if (!hook) throw new Error("no Codex PreToolUse hook matches Bash");
  // Opted in to rr (git config quickstacks.rr), so a whole-suite run is a deny to look for.
  const env = withoutGitVars({
    ...process.env,
    CLAUDE_PROJECT_DIR: undefined,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "quickstacks.rr",
    GIT_CONFIG_VALUE_0: "true",
  });
  return spawnSync("sh", ["-c", hook], {
    cwd,
    env: Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => !!e[1])),
    input: JSON.stringify(bash(command)),
    encoding: "utf8",
  });
}

// The hook finds the guard through git, and rr's synced copy on a test host has no .git.
const inCheckout =
  spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: REPO }).status === 0;

describe("Codex hook wiring", () => {
  it.skipIf(!inCheckout)("runs the command guard for Codex's Bash tool", () => {
    const denied = codexPreToolUse("bun run check");
    expect(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecisionReason).toContain(
      "rr check",
    );
    expect(codexPreToolUse("bun run lint").stdout).toBe("");
  });
  it.skipIf(!inCheckout)("runs the destructive-command guard for Codex's Bash tool", () => {
    const denied = codexPreToolUse("git reset --hard HEAD~1", REPO, 1);
    expect(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
    expect(codexPreToolUse("git status", REPO, 1).stdout).toBe("");
  });
  it("refuses a command when the destructive guard can't be found", () => {
    const outside = codexPreToolUse("echo hi", mkdtempSync(join(tmpdir(), "codex-hook-")), 1);
    expect(outside.status).toBe(2);
    expect(outside.stderr).toContain("block-destructive.sh not found");
  });
  it("refuses a command when the guard can't be found", () => {
    const outside = codexPreToolUse("echo hi", mkdtempSync(join(tmpdir(), "codex-hook-")));
    expect(outside.status).toBe(2);
    expect(outside.stderr).toContain("guard-commands.ts not found");
  });
});

describe("hook wiring", () => {
  it("wires each script exactly once and points to existing files", () => {
    const commands = wiredCommands();
    expect(new Set(commands).size).toBe(commands.length);
    for (const command of commands) {
      const path = /"\$\{CLAUDE_PROJECT_DIR\}(\/[^"]+)"/.exec(command)?.[1];
      expect(path, command).toBeDefined();
      expect(existsSync(`${REPO}${path}`), command).toBe(true);
    }
  });
  it.each([
    ["PreToolUse", "guard-commands", "Bash"],
    ["PreToolUse", "guard-generated", "Write"],
    ["PreToolUse", "guard-generated", "Edit"],
    ["PreToolUse", "guard-repo-content", "Write"],
    ["PreToolUse", "guard-repo-content", "Edit"],
    ["PostToolUse", "typecheck-on-write", "Write"],
    ["PostToolUse", "typecheck-on-write", "Edit"],
  ])("wires %s %s for %s", (event, name, tool) => {
    expect(() => hookCommand(event, name, tool)).not.toThrow();
  });
});
