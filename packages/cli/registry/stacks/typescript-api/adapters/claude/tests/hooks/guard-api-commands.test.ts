import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bash, denyReason, REPO, runHook } from "../helpers/hooks";

const run = (command: string) => runHook("PreToolUse", "guard-api-commands", bash(command));

const NODE = "The server and vitest run on Node in this project.";
const BUN_TEST = "bun test is bun's own test runner";
const BUN_SERVER = "That runs the server under Bun";
const SCHEMA = "@effect/schema was folded into effect.";
const FOREGROUND = "Use bun run dev:bg";

it("names the supported Node recovery command", async () => {
  const result = await run("bun src/platform/node.ts");
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(denyReason(result)).toContain("bun run dev:server");
});

describe.concurrent("guard-api-commands denies", () => {
  it.each([
    ["bun test", BUN_TEST],
    ["bun test tests/orders.test.ts", BUN_TEST],
    ["cd src && bun test", BUN_TEST],
    ["bunx --bun vitest", NODE],
    ["bun --bun vitest run", NODE],
    ["bun run --bun dev", NODE],
    ["bun --bun run build", NODE],
    ["bun run --bun coverage", NODE],
    ["bun -b run test", NODE],
    ["bun run --bun dev:bg", NODE],
    ["bun --bun run lint", NODE],
    ["bun --bun test", BUN_TEST],
    ["bun -b test", BUN_TEST],
    ["bun src/platform/node.ts", BUN_SERVER],
    ["bun run src/platform/node.ts", BUN_SERVER],
    ["bun --watch ./src/platform/node.ts", BUN_SERVER],
    ["bun add @effect/schema", SCHEMA],
    ["npm install @effect/schema", SCHEMA],
    ["bun --cwd sub add @effect/schema", SCHEMA],
    ["bun --filter sub add @effect/schema", SCHEMA],
    ["bun run dev", FOREGROUND],
    ["bun dev", FOREGROUND],
    ["npm run dev", FOREGROUND],
    ['bash -c "bun test"', BUN_TEST],
  ])("%j", async (command, reason) => {
    expect(denyReason(await run(command))).toContain(reason);
  });
});

describe.concurrent("guard-api-commands allows", () => {
  it.each([
    "bun run test",
    'bun run test tests/orders.test.ts -t "creates"',
    "bun add effect @effect/platform-node",
    "bunx vitest run",
    "bun scripts/dev.ts",
    "bun --bun scripts/tool.ts",
    "bun --bun run scripts/tool.ts",
    "bun run scripts/dev-bg.ts start",
    "node src/platform/node.ts",
    "bun run dev:server",
    "bun run dev:bg",
    "bun run dev:stop",
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

it("keeps the guard within the project complexity limit", () => {
  const result = spawnSync(
    join(REPO, "node_modules/.bin/biome"),
    [
      "lint",
      "--only=complexity/noExcessiveCognitiveComplexity",
      ".claude/hooks/guard-api-commands.ts",
    ],
    { cwd: REPO, encoding: "utf8" },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
