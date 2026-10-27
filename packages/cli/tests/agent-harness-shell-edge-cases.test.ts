import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());
const fragments = join(import.meta.dirname, "../registry/fragments");
const Denial = Schema.Struct({
  hookSpecificOutput: Schema.Struct({
    hookEventName: Schema.Literal("PreToolUse"),
    permissionDecision: Schema.Literal("deny"),
    permissionDecisionReason: Schema.NonEmptyString,
  }),
});

const cases = [
  { command: "sh -c 'git push --force'", denied: true },
  { command: "sh -c 'git push --dry-run'", denied: false },
  { command: "find . -exec git push --force \\;", denied: true },
  { command: "find . -exec git status \\;", denied: false },
  { command: "echo $(git push --force)", denied: true },
  { command: "echo '$(git push --force)'", denied: false },
  { command: "cat <<EOF\n$(git push --force)\nEOF", denied: true },
  { command: "cat <<EOF\n\\$(git push --force)\nEOF", denied: false },
  { command: "cat <<'EOF'\n$(git push --force)\nEOF", denied: false },
  { command: "cat <<EOF\ngit push --force\nEOF", denied: false },
  { command: "cat <<'EOF' | sh\ngit push --force\nEOF", denied: true },
  { command: "sh <<'EOF'\ngit push --force\nEOF", denied: true },
  { command: "cat <<-EOF\n\t$(git push --force)\n\tEOF", denied: true },
  { command: "cat <<-EOF\n\tgit push --force\n\tEOF", denied: false },
  { command: "git pu\\\nsh --force", denied: true },
  { command: "git sta\\\ntus", denied: false },
];

test.each(
  (["shell", "typescript"] as const).flatMap((adapter) =>
    cases.map((scenario) => ({ adapter, ...scenario })),
  ),
)("$adapter heredocs and wrappers: $command (denied=$denied)", ({ adapter, command, denied }) => {
  const root = space.dir();
  const hooks = join(root, ".claude/hooks");
  cpSync(join(fragments, "agent-ops/files/.claude/hooks"), hooks, { recursive: true });
  cpSync(join(fragments, "claude-harness/files/.claude/hooks"), hooks, { recursive: true });
  cpSync(join(fragments, "claude-harness/adapters/claude/.claude/hooks"), hooks, {
    recursive: true,
  });
  const result = spawnSync(
    adapter === "shell" ? "/bin/bash" : "bun",
    [join(hooks, adapter === "shell" ? "block-destructive.sh" : "guard-commands.ts")],
    {
      cwd: root,
      env: { HOME: root, PATH: process.env.PATH, CLAUDE_PROJECT_DIR: root },
      input: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command },
      }),
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  if (denied) {
    Schema.decodeUnknownSync(Denial, { onExcessProperty: "error" })(JSON.parse(result.stdout));
  } else expect(result.stdout).toBe("");
});
