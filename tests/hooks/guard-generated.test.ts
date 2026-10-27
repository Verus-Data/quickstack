import { describe, expect, it } from "vitest";
import { denyReason, runHook, write } from "../helpers/hooks";

describe("shared generated-output guard", () => {
  it.each([
    "dist/program",
    "build/index.js",
    "coverage/index.html",
    "bun.lock",
    "packages/cli/dist/stacks",
    "packages/shared/coverage/index.html",
  ])("denies %s", async (path) => {
    expect(
      denyReason(await runHook("PreToolUse", "guard-generated", write(path, "x"))),
    ).toBeDefined();
  });
  it.each([
    "src/build/helper.ts",
    "src/index.ts",
    "/outside/dist/program",
    "packages/cli/src/build/helper.ts",
    "packages/cli/bun.lock",
  ])("allows %s", async (path) => {
    expect(
      denyReason(await runHook("PreToolUse", "guard-generated", write(path, "x"))),
    ).toBeUndefined();
  });
});
