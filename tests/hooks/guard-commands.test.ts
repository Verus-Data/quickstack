import { describe, expect, it } from "vitest";
import { bash, denyReason, runHook } from "../helpers/hooks";

describe("shared package manager guard", () => {
  it.each(["npm install", "pnpm add a", "yarn", "npm ci"])("denies %s", async (command) => {
    expect(denyReason(await runHook("PreToolUse", "guard-commands", bash(command)))).toContain(
      "bun owns",
    );
  });
  it.each(["bun install", "npm view effect", "git commit -m 'npm install'", "echo 'pnpm add a'"])(
    "allows %s",
    async (command) => {
      expect(
        denyReason(await runHook("PreToolUse", "guard-commands", bash(command))),
      ).toBeUndefined();
    },
  );
});

describe("shell in-place edit guard", () => {
  it.each([
    "sed -i '' 's/a/b/' src/x.ts",
    "sed -i.bak -e 's/a/b/' x.md",
    "sed --in-place 's/a/b/' x.md",
    "perl -pi -e 's/a/b/' x.md",
    "python3 - <<'EOF'\nimport pathlib\npathlib.Path('x.md').write_text('y')\nEOF",
    "python3 - <<'EOF'\nopen('x.md', 'w').write('y')\nEOF",
  ])("denies %s", async (command) => {
    expect(denyReason(await runHook("PreToolUse", "guard-commands", bash(command)))).toContain(
      "Edit or Write tool",
    );
  });
  it.each([
    "sed -n '1,20p' x.md",
    "sed -E 's/a/b/' x.md > y.md",
    "perl -ne 'print if /a/' x.md",
    "python3 - <<'EOF'\nprint(open('x.md').read())\nEOF",
    "git commit -m 'use sed -i for the rename'",
  ])("allows %s", async (command) => {
    expect(
      denyReason(await runHook("PreToolUse", "guard-commands", bash(command))),
    ).toBeUndefined();
  });
});
