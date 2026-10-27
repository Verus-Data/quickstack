import { describe, expect, it } from "vitest";
import { bash, denyReason, runHook } from "../helpers/hooks";

const run = (command: string) =>
  runHook("PreToolUse", "guard-react-router-commands", bash(command));

const NODE = "vitest, Vite, and React Router run on Node in this project.";
const BUN_TEST = "bun test is bun's own test runner";
const SCHEMA = "@effect/schema was folded into effect.";

describe.concurrent("guard-commands denies", () => {
  it.each([
    ["bun test", BUN_TEST],
    ["bun test tests/chat-routes.test.ts", BUN_TEST],
    ["cd app && bun test", BUN_TEST],
    ["bunx --bun vitest", NODE],
    ["bun --bun vitest run", NODE],
    ["bun run --bun dev", NODE],
    ["bun --bun run build", NODE],
    ["bun run --bun coverage", NODE],
    ["bun --bun run e2e", NODE],
    ["bunx --bun react-router typegen", NODE],
    ["bun add @effect/schema", SCHEMA],
    ["npm install @effect/schema", SCHEMA],
    ["bun add x\ry @effect/schema", SCHEMA],
    ['bash -c "bun test"', BUN_TEST],
  ])("%j", async (command, reason) => {
    expect(denyReason(await run(command))).toContain(reason);
  });
});

describe.concurrent("guard-commands allows", () => {
  it.each([
    "bun run test",
    'bun run test tests/chat-routes.test.ts -t "streams"',
    "bun add effect",
    "bunx vitest run",
    "bun --bun scripts/tool.ts",
    "git commit -m 'bun test is banned here'",
    // A test name holding the command it tests.
    'bun run test tests/hooks -t "bun test"',
    "cat <<EOF\nbun test\nEOF",
  ])("%j", async (command) => {
    const result = await run(command);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
