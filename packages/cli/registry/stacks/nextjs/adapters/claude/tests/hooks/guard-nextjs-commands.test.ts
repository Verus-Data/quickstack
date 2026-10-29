import { describe, expect, it } from "vitest";
import { bash, denyReason, runHook } from "../helpers/hooks";

const run = (command: string) => runHook("PreToolUse", "guard-nextjs-commands", bash(command));

const NODE = "next, Vitest and Playwright run on Node in this project.";
const BUN_TEST = "bun test is bun's own test runner";
const LINT = "lint runs through the ESLint CLI";

describe.concurrent("guard-nextjs-commands denies", () => {
  it.each([
    ["bun test", BUN_TEST],
    ["bun test tests/item-schema.test.ts", BUN_TEST],
    ["cd src && bun test", BUN_TEST],
    ["bunx --bun vitest", NODE],
    ["bunx --bun next build", NODE],
    ["bun --bun run build", NODE],
    ["bun run --bun dev", NODE],
    ["bun --bun run e2e", NODE],
    ["bunx --bun playwright test", NODE],
    ["next lint", LINT],
    ["bunx next lint", LINT],
    ["npx next lint --fix", LINT],
    ["node_modules/.bin/next lint", LINT],
    ['bash -c "bun test"', BUN_TEST],
  ])("%j", async (command, reason) => {
    expect(denyReason(await run(command))).toContain(reason);
  });
});

describe.concurrent("guard-nextjs-commands allows", () => {
  it.each([
    "bun run test",
    'bun run test tests/item-schema.test.ts -t "rejects"',
    "bun run lint",
    "bunx next typegen",
    "bunx next build",
    "bunx vitest run",
    "bunx playwright test",
    "bun --bun scripts/tool.ts",
    "git commit -m 'next lint and bun test are banned here'",
    'bun run test tests/hooks -t "bun test"',
    "cat <<EOF\nbun test\nEOF",
  ])("%j", async (command) => {
    const result = await run(command);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
