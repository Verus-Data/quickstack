import { describe, expect, it } from "vitest";
import { bash, denyReason, runHook } from "../helpers/hooks";

const run = (command: string) => runHook("PreToolUse", "guard-sveltekit-commands", bash(command));

const NODE = "run on Node in this project.";
const BUN_TEST = "bun test is bun's own test runner";

describe.concurrent("guard-sveltekit-commands denies", () => {
  it.each([
    ["bun test", BUN_TEST],
    ["bun test tests/item-schema.test.ts", BUN_TEST],
    ["cd src && bun test", BUN_TEST],
    ["bunx --bun vitest", NODE],
    ["bunx --bun vite build", NODE],
    ["bunx --bun svelte-kit sync", NODE],
    ["bunx --bun svelte-check", NODE],
    ["bun --bun run build", NODE],
    ["bun run --bun dev", NODE],
    ["bun --bun run e2e", NODE],
    ["bunx --bun playwright test", NODE],
    ["bun --bun node_modules/.bin/vite dev", NODE],
    ['bash -c "bun test"', BUN_TEST],
  ])("%j", async (command, reason) => {
    expect(denyReason(await run(command))).toContain(reason);
  });
});

describe.concurrent("guard-sveltekit-commands allows", () => {
  it.each([
    "bun run test",
    'bun run test tests/item-schema.test.ts -t "rejects"',
    "bun run lint",
    "bunx svelte-kit sync",
    "bunx vite build",
    "bunx vitest run",
    "bunx playwright test",
    "bun --bun scripts/tool.ts",
    "git commit -m 'bun test and --bun vite are banned here'",
    'bun run test tests/hooks -t "bun test"',
    "cat <<EOF\nbun test\nEOF",
  ])("%j", async (command) => {
    const result = await run(command);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
