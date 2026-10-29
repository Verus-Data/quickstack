// PreToolUse (Bash): deny commands that are wrong for this stack, with the fix.
//
//   --bun on vite / svelte-kit / svelte-check / vitest / playwright
//                                         they run on Node here; --bun swaps in bun's runtime
//                                         and breaks them subtly
//   bun test                              bun's own test runner; the tests are vitest
//                                         (bun run test)
//
// Commands are read the way bash runs them (see _shell.ts), so a quoted mention (a commit message,
// bun run test -t "bun test") passes.
import { basename } from "node:path";
import { deny, readPayload, text } from "./_lib";
import { type Command, commands } from "./_shell";

const NODE_TOOL = /(^|\/)(vite|svelte-kit|svelte-check|vitest|playwright)$/;
const SCRIPTS = new Set([
  "dev",
  "build",
  "start",
  "test",
  "test:watch",
  "coverage",
  "e2e",
  "typecheck",
  "check",
]);

function reasonFor(cmd: Command): string | undefined {
  const [first = "", ...args] = cmd.argv;
  const name = basename(first);
  if (name !== "bun" && name !== "bunx") return undefined;
  if (
    args.includes("--bun") &&
    (args.some((a) => NODE_TOOL.test(a)) ||
      (args.includes("run") && args.some((a) => SCRIPTS.has(a))))
  ) {
    return "Vite, svelte-kit, svelte-check, Vitest and Playwright run on Node in this project. Drop --bun (use bun run dev / bun run test / bun run build).";
  }
  if (name === "bun" && args[0] === "test") {
    return 'bun test is bun\'s own test runner; the tests here are vitest. Use bun run test (add a file path or -t "<name>" to scope it).';
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
