// scripts/delegate.sh against a fake `codex` (CODEX_BIN) in a throwaway repo with a linked
// worktree: what it refuses, the flags it passes Codex, and how it judges and digests a run.
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REPO } from "../helpers/hooks";

const SCRIPT = join(REPO, "scripts/delegate.sh");

// Records its argv, writes one file into its cwd and reports a completed (or failed) turn.
const FAKE_CODEX = `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$FAKE_ARGS"
while [ $# -gt 0 ]; do
  case "$1" in
    --output-last-message) last="$2"; shift ;;
  esac
  shift
done
echo written > src.txt
echo '{"type":"thread.started","thread_id":"thread-1"}'
echo '{"type":"item.completed","item":{"type":"command_execution","command":"bun run test","exit_code":0}}'
if [ "$FAKE_MODE" = warned ]; then
  echo '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"hooks may run without review"}}'
fi
if [ "$FAKE_MODE" = fail ]; then
  echo '{"type":"turn.failed","error":{"message":"boom"}}'
elif [ "$FAKE_MODE" = capacity ]; then
  echo '{"type":"turn.failed","error":{"message":"Selected model is at capacity. Please try a different model."}}'
  exit 1
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
        'sandbox_mode="danger-full-access"',
        "gpt-6.1-sol",
        'model_reasoning_effort="high"',
        'approval_policy="never"',
      ]),
    );
    expect(args).not.toContain("--ephemeral");
    expect(args.join("\n")).toContain("Do the thing.");
    expect(result.stdout).toContain("result:    success - turn completed");
    expect(result.stdout).toContain("session:   thread-1");
    expect(result.stdout).toContain("  [0] bun run test");
    expect(result.stdout).toContain("  ?? src.txt");
    expect(result.stdout).toContain("  Changed src.txt");
  });

  it("lists changed paths outside the contract's May change entries", () => {
    writeFileSync(
      contract,
      "Do the thing.\n\n## Scope\n\n- May change: `lib/` (new modules),\n  `README.md`.\n- Must not change: `src.txt`.\n",
    );
    const result = run([contract, "--worktree", worktree, "--write"]);
    expect(result.stdout).toContain("outside the contract's May change:\n  src.txt\n");
  });

  it("accepts paths under a May change directory or ending in a package-relative entry", () => {
    writeFileSync(contract, "Do the thing.\n\n- May change: `docs/`, `cli/src.txt`, `src.txt`.\n");
    const result = run([contract, "--worktree", worktree, "--write"]);
    expect(result.stdout).toContain("outside the contract's May change:\n  (none)\n");
  });

  it("says so when the contract has no May change entry", () => {
    const result = run([contract, "--worktree", worktree, "--write"]);
    expect(result.stdout).toContain(
      "outside the contract's May change:\n  (no May change entry)\n",
    );
  });

  it("is read-only without --write and takes the model from the environment", () => {
    run([contract, "--worktree", worktree], { DELEGATE_MODEL: "gpt-6-sol" });
    const args = readFileSync(join(root, "args.txt"), "utf8").split("\n");
    expect(args).toEqual(expect.arrayContaining(['sandbox_mode="read-only"', "gpt-6-sol"]));
  });

  it("resumes a session with the contract as the follow-up and no second preamble", () => {
    const result = run([contract, "--worktree", worktree, "--write", "--resume", "thread-1"]);
    expect(result.status, result.stderr).toBe(0);
    const args = readFileSync(join(root, "args.txt"), "utf8").split("\n");
    expect(args.slice(0, 2)).toEqual(["exec", "resume"]);
    expect(args).toContain("thread-1");
    expect(args.join("\n")).toContain("Do the thing.");
    expect(args.join("\n")).not.toContain("orchestrator");
  });

  it("fails on a failed turn even when codex exits 0", () => {
    const result = run([contract, "--worktree", worktree, "--write"], { FAKE_MODE: "fail" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("result:    failure - turn failed");
  });

  it("succeeds on a completed turn that carries an error item, such as the hook-trust warning", () => {
    const result = run([contract, "--worktree", worktree, "--write"], { FAKE_MODE: "warned" });
    expect(result.stdout).toContain("result:    success - turn completed");
    expect(result.status).toBe(0);
  });

  it("names a turn's failure when codex exits nonzero, and says a capacity failure can resume", () => {
    const result = run([contract, "--worktree", worktree, "--write"], { FAKE_MODE: "capacity" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("result:    failure - turn failed");
    expect(result.stdout).toContain("at capacity");
    expect(result.stdout).toContain("transient: resume thread-1 with a short 'continue' follow-up");
  });
});
