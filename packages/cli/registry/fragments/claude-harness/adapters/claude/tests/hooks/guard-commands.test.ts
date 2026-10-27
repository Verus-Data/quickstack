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
