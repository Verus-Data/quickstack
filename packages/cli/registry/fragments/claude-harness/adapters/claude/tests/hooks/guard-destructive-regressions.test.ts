import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bash, denyReason, makeFixture, runHook } from "../helpers/hooks";

const destructive = [
  "dd if=/dev/zero of=/dev/rdisk2",
  "printf x > /dev/rdisk2",
  "printf '%s\\n' /tmp/outside | xargs rm -rf",
  "rm -rf {build,../outside}",
  "rm -rf */../outside",
  'rm -rf "build"/{cache,../../outside}',
  'rm -rf "prefix"*',
];

describe("destructive guard review regressions", () => {
  it.each(destructive)("denies %s", async (command) => {
    const result = await runHook("PreToolUse", "block-destructive", bash(command));
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(denyReason(result)).toBeDefined();
  });
  it.each(destructive)("allows a quoted mention of %s", async (command) => {
    const result = await runHook(
      "PreToolUse",
      "block-destructive",
      bash(`echo '${command.replaceAll("'", "'\\''")}'`),
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });
  it.each([
    "rm -rf '{build,../outside}'",
    "rm -rf 'literal*'",
    'rm -rf "literal*"',
    "rm -rf literal\\*",
  ])("allows literal quoted or escaped filenames: %s", async (command) => {
    const result = await runHook("PreToolUse", "block-destructive", bash(command));
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });
  it.each(["rm -rf link/../work", "cd link; rm -rf ../work"])(
    "checks symlinks before parent traversal: %s",
    async (command) => {
      const project = makeFixture();
      const outside = makeFixture();
      try {
        mkdirSync(join(outside.dir, "subdir"));
        writeFileSync(join(outside.dir, "work"), "keep this work\n");
        symlinkSync(join(outside.dir, "subdir"), join(project.dir, "link"));
        const result = await runHook("PreToolUse", "block-destructive", bash(command), {
          cwd: project.dir,
          env: { CLAUDE_PROJECT_DIR: project.dir },
        });
        expect(result.code).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout.trim().split("\n")).toHaveLength(1);
        expect(denyReason(result)).toBeDefined();
        expect(readFileSync(join(outside.dir, "work"), "utf8")).toBe("keep this work\n");
      } finally {
        project.cleanup();
        outside.cleanup();
      }
    },
  );
});
