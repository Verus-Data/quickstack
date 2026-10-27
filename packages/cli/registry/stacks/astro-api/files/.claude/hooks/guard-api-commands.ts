// PreToolUse (Bash, Claude Code and Codex): deny wrong commands with the fix.
//
//   --bun (-b) on vitest or bun run       the server and tests run on Node here; --bun swaps in
//                                         bun's runtime and hides differences until deploy
//   bun test                              bun's own test runner; the tests are vitest
//                                         (bun run test)
//   bun [apps/api/]src/...                runs the server under Bun; bun run dev:api runs it
//                                         on Node
//   bun run dev                           the foreground dev servers block the tool call; agents
//                                         use bun run dev:bg and dev:stop
//   installing @effect/schema             folded into `effect`; the old package conflicts
//                                         with it
//
// Commands are read the way bash runs them (see _shell.ts), so a quoted mention (a commit message,
// bun run test -t "bun test") passes.
import { basename } from "node:path";
import { deny, readPayload, text } from "./_lib";
import { type Command, commands } from "./_shell";

// Flags whose value is the next word (bun --cwd apps/api add ..., npm -w api install ...).
const VALUE_FLAGS = new Set(["--cwd", "--filter", "-F", "--workspace", "-w", "--env-file"]);

/** The first argument that isn't a flag or a flag's value, skipping a leading `run` when `skipRun` is set. */
function target(args: string[], skipRun: boolean): string {
  const words = args.filter((a, i) => !a.startsWith("-") && !VALUE_FLAGS.has(args[i - 1] ?? ""));
  return (skipRun && words[0] === "run" ? words[1] : words[0]) ?? "";
}

function reasonFor(cmd: Command): string | undefined {
  const [first = "", ...args] = cmd.argv;
  const name = basename(first);
  if (name !== "bun" && name !== "bunx" && name !== "npm" && name !== "pnpm" && name !== "yarn") {
    return undefined;
  }
  const bun = name === "bun" || name === "bunx";
  const forced = args.includes("--bun") || args.includes("-b");
  // Under --bun every script's `node` resolves to Bun, so any `bun run <script>` is wrong; only a
  // file under scripts/ (Bun tooling already) may run that way.
  const runsScript = args.includes("run") && !/^(\.\/)?scripts\//.test(target(args, true));
  if (bun && forced && (args.some((a) => /(^|\/)vitest$/.test(a)) || runsScript)) {
    return "The server and vitest run on Node in this project. Drop --bun (use bun run test / bun run dev / bun run build).";
  }
  if (name === "bun" && target(args, false) === "test") {
    return 'bun test is bun\'s own test runner; the tests here are vitest. Use bun run test (add a file path or -t "<name>" to scope it).';
  }
  if (name === "bun" && /^(\.\/)?(apps\/api\/)?src\/.*\.ts$/.test(target(args, true))) {
    return "That runs the server under Bun; it runs on Node here. Use bun run dev:bg (or bun run dev:api).";
  }
  if (name !== "bunx" && target(args, true) === "dev") {
    return "bun run dev runs the dev servers in the foreground and blocks this shell. Use bun run dev:bg (stop them with bun run dev:stop).";
  }
  if (
    name !== "bunx" &&
    ["add", "install", "i"].includes(target(args, false)) &&
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
