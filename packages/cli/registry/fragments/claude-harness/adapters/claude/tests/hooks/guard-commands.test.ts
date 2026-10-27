import { spawnSync } from "node:child_process";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bash, denyReason, makeFixture, runHook } from "../helpers/hooks";

describe("shared package manager guard", () => {
  it.each(["npm install", "pnpm add a", "yarn", "npm ci"])("denies %s", async (command) => {
    expect(denyReason(await runHook("PreToolUse", "block-destructive", bash(command)))).toContain(
      "bun owns",
    );
  });
  it.each(["bun install", "npm view effect", "git commit -m 'npm install'", "echo 'pnpm add a'"])(
    "allows %s",
    async (command) => {
      expect(
        denyReason(await runHook("PreToolUse", "block-destructive", bash(command))),
      ).toBeUndefined();
    },
  );
});

const destructive = [
  'printf ok && r"m" -rf /',
  "env X=1 sudo -u root rm -rf /tmp/outside",
  "rm -r ../outside",
  'echo "$(rm -rf /)"',
  "echo `rm -rf /`",
  "(rm -rf /)",
  "true | rm -rf /",
  "r\\m -rf /",
  'sh -c "rm -rf /"',
  "git push --force origin main",
  "git push --force-with-lease origin main",
  "git push origin +HEAD:refs/heads/master",
  "git filter-branch --all",
  "git rebase -i HEAD~2",
  "git reflog expire --expire=now --all",
  "dd if=/dev/zero of=/dev/disk2",
  "mkfs.ext4 /dev/sda",
  "printf x > /dev/sda",
];

describe("destructive command guard through the wired shell entry", () => {
  it.each(destructive)("denies %s with one JSON response", async (command) => {
    const result = await runHook("PreToolUse", "block-destructive", bash(command));
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(denyReason(result)).toBeDefined();
  });
  it.each(destructive)("allows a quoted mention of %s", async (command) => {
    const quoted = `'${command.replaceAll("'", "'\\''")}'`;
    const result = await runHook("PreToolUse", "block-destructive", bash(`echo ${quoted}`));
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });
  it.each([
    "rm -rf build",
    "git push origin feature",
    "git log",
    "dd if=input of=output",
    "cat <<'EOF'\nrm -rf /\nEOF",
  ])("allows %s", async (command) => {
    const result = await runHook("PreToolUse", "block-destructive", bash(command));
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });
  it("checks hard reset against the selected repository without changing it", async () => {
    const project = makeFixture();
    try {
      const git = (args: string[]) => {
        const result = spawnSync("git", args, { cwd: project.dir, encoding: "utf8" });
        expect(result.status, result.stderr).toBe(0);
      };
      git(["init", "--quiet"]);
      writeFileSync(join(project.dir, ".gitignore"), "node_modules/\n");
      git(["add", ".gitignore"]);
      git([
        "-c",
        "user.name=Hooks",
        "-c",
        "user.email=hooks@example.test",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--allow-empty",
        "-qm",
        "fixture",
      ]);
      const command = `git -C '${project.dir}' reset --hard`;
      const clean = await runHook("PreToolUse", "block-destructive", bash(command));
      expect(clean.code).toBe(0);
      expect(clean.stderr).toBe("");
      expect(clean.stdout).toBe("");
      writeFileSync(join(project.dir, "unfinished.txt"), "work\n");
      const dirty = await runHook("PreToolUse", "block-destructive", bash(command));
      expect(dirty.code).toBe(0);
      expect(dirty.stderr).toBe("");
      expect(denyReason(dirty)).toContain("uncommitted");
    } finally {
      project.cleanup();
    }
  });
  it("fails closed when path inspection throws", async () => {
    const project = makeFixture();
    try {
      symlinkSync("loop", join(project.dir, "loop"));
      const result = await runHook("PreToolUse", "block-destructive", bash("rm -rf loop/out"), {
        cwd: project.dir,
        env: { CLAUDE_PROJECT_DIR: project.dir },
      });
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
      expect(denyReason(result)).toContain("could not inspect");
    } finally {
      project.cleanup();
    }
  });
});
