// PreToolUse (Bash): deny commands that are wrong for this stack, with the fix.
//
//   --bun on vitest / react-router / vite   they run on Node here; --bun swaps in bun's runtime
//                                           and breaks them subtly
//   bun test                                bun's own test runner; the tests are vitest
//                                           (bun run test)
//   installing @effect/schema               folded into `effect`; the old package conflicts
//                                           with it
//
// Commands are read the way bash runs them (see _shell.ts), so a quoted mention (a commit message,
// bun run test -t "bun test") passes.
import { basename } from "node:path";
import { deny, readPayload, text } from "./_lib";
import { type Command, commands } from "./_shell";

const NODE_TOOL = /(^|\/)(vitest|react-router|vite)$/;
const SCRIPTS = new Set([
  "dev",
  "dev:server",
  "build",
  "test",
  "test:watch",
  "coverage",
  "e2e",
  "typecheck",
  "start",
  "check",
]);

function reasonFor(cmd: Command): string | undefined {
  const [first = "", ...args] = cmd.argv;
  const name = basename(first);
  if (name !== "bun" && name !== "bunx" && name !== "npm" && name !== "pnpm" && name !== "yarn") {
    return undefined;
  }
  const bun = name === "bun" || name === "bunx";
  if (
    bun &&
    args.includes("--bun") &&
    (args.some((a) => NODE_TOOL.test(a)) ||
      (args.includes("run") && args.some((a) => SCRIPTS.has(a))))
  ) {
    return "vitest, Vite, and React Router run on Node in this project. Drop --bun (use bun run test / bun run dev / bun run build).";
  }
  if (name === "bun" && args[0] === "test") {
    return 'bun test is bun\'s own test runner; the tests here are vitest. Use bun run test (add a file path or -t "<name>" to scope it).';
  }
  if (
    name !== "bunx" &&
    ["add", "install", "i"].includes(args[0] ?? "") &&
    args.some((a) => a.includes("@effect/schema"))
  ) {
    return '@effect/schema was folded into effect. Import Schema from "effect" instead of installing it.';
  }
  return undefined;
}

const command = text(readPayload()?.tool_input?.command);
const reason = command
  ? commands(command)
      .map(reasonFor)
      .find((r) => r !== undefined)
  : undefined;
if (reason) deny(`BLOCKED: ${reason}`);
