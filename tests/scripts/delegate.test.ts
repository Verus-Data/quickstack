// scripts/delegate.sh against a fake `codex` (CODEX_BIN) in a throwaway repo with a linked
// worktree: what it refuses, the flags it passes Codex, and how it judges and digests a run.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REPO } from "../helpers/hooks";

const SCRIPT = join(REPO, "scripts/delegate.sh");

// Records its argv, writes one file into --cd and reports a completed (or failed) turn.
const FAKE_CODEX = `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$FAKE_ARGS"
while [ $# -gt 0 ]; do
  case "$1" in
    --cd) cd "$2" || exit 9; shift ;;
    --output-last-message) last="$2"; shift ;;
  esac
  shift
done
echo written > src.txt
echo '{"type":"item.completed","item":{"type":"command_execution","command":"bun run test","exit_code":0}}'
if [ "$FAKE_MODE" = fail ]; then
  echo '{"type":"turn.failed","error":{"message":"boom"}}'
else
  echo '{"type":"turn.completed"}'
  echo "Changed src.txt" > "$last"
fi
`;

let root: string;
let main: string;
let worktree: string;
let contract: string;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
    cwd,
    env: { PATH: process.env.PATH ?? "", HOME: root },
  });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "delegate-"));
  main = join(root, "main");
  worktree = join(root, "wt");
  mkdirSync(main);
  git(main, "init", "-q");
  writeFileSync(join(main, "README.md"), "x\n");
  git(main, "add", ".");
  git(main, "commit", "-q", "-m", "init");
  git(main, "worktree", "add", "-q", worktree, "-b", "delegate/t");
  mkdirSync(join(worktree, "node_modules"));
  writeFileSync(join(worktree, ".gitignore"), "node_modules/\n");
  git(worktree, "add", ".gitignore");
  git(worktree, "commit", "-q", "-m", "ignore");
  writeFileSync(join(root, "codex"), FAKE_CODEX);
  chmodSync(join(root, "codex"), 0o755);
  contract = join(root, "contract.md");
  writeFileSync(contract, "Do the thing.\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: root,
      CODEX_BIN: join(root, "codex"),
      FAKE_ARGS: join(root, "args.txt"),
      DELEGATE_LOG_ROOT: join(root, "logs"),
      ...env,
    },
  });

describe("delegate.sh", () => {
  it("refuses the main checkout", () => {
    const result = run([contract, "--worktree", main]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("refusing to run a delegate in the main checkout");
  });

  it("refuses a worktree without node_modules", () => {
    rmSync(join(worktree, "node_modules"), { recursive: true });
    const result = run([contract, "--worktree", worktree]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("no node_modules");
  });

  it("runs Codex unsandboxed on sol 6.1 at high effort and digests a completed turn", () => {
    const result = run([contract, "--worktree", worktree, "--write"]);
    expect(result.status, result.stderr).toBe(0);
    const args = readFileSync(join(root, "args.txt"), "utf8").split("\n");
    expect(args).toEqual(
      expect.arrayContaining([
        "danger-full-access",
        "gpt-6.1-sol",
        'model_reasoning_effort="high"',
        'approval_policy="never"',
      ]),
    );
    expect(args.join("\n")).toContain("Do the thing.");
    expect(result.stdout).toContain("result:    success - turn completed");
    expect(result.stdout).toContain("  [0] bun run test");
    expect(result.stdout).toContain("  ?? src.txt");
    expect(result.stdout).toContain("  Changed src.txt");
  });

  it("is read-only without --write and takes the model from the environment", () => {
    run([contract, "--worktree", worktree], { DELEGATE_MODEL: "gpt-6-sol" });
    const args = readFileSync(join(root, "args.txt"), "utf8").split("\n");
    expect(args).toEqual(expect.arrayContaining(["read-only", "gpt-6-sol"]));
  });

  it("fails on a failed turn even when codex exits 0", () => {
    const result = run([contract, "--worktree", worktree, "--write"], { FAKE_MODE: "fail" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("result:    failure - turn failed");
  });
});
