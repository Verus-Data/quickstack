import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { deny, readPayload, text } from "./_lib";
import { commands } from "./_shell";

// In-place edits from the shell skip every Edit/Write hook (lint, typecheck, boundary and secret
// guards, format-on-stop), so the Edit and Write tools are the only way to change a file.
const IN_PLACE =
  "BLOCKED: Shell in-place edits bypass the Edit/Write hooks (lint, typecheck, boundaries, secrets, formatting). Use the Edit or Write tool.";
const inPlaceFlag = (arg: string) =>
  /^-[a-zA-Z]*i/.test(arg) || arg === "--in-place" || arg.startsWith("--in-place=");

// Parallel agents running whole suites on one laptop starve each other into timeouts; rr queues
// them on the test hosts. A clone opts in with `git config quickstack.rr true` (shared by its
// worktrees, never committed); without it, whole suites run locally. A scoped file always does.
const RR =
  'BLOCKED: Whole test suites run through rr, which queues them across the test hosts: `rr check` for the gate, `rr test-cli`, `rr test-hooks` or `rr e2e` for one suite (AGENTS.md "Test runs"). A single test file runs locally (`bun run test:unit tests/<file>.test.ts` in packages/cli). If rr is missing or fails before running, say so and rerun with QUICKSTACK_LOCAL_GATE=1 in front.';
const SUITES = new Set(["check", "test", "e2e", "coverage"]);
const SCOPABLE = new Set(["test:hooks", "test:unit"]);
const VALUED = new Set(["--cwd", "--filter", "-F"]);

/** The operands up to `--`, skipping flags and the values of `VALUED` flags. */
function operands(args: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (VALUED.has(arg)) i++;
    else if (arg === "--") break;
    else if (!arg.startsWith("-")) out.push(arg);
  }
  return out;
}

function wholeSuite(argv: readonly string[]): boolean {
  const [executable = "", sub, ...rest] = argv;
  const name = basename(executable);
  if (name === "bun" && sub === "run") {
    const [script = "", ...files] = operands(rest);
    return SUITES.has(script) || (SCOPABLE.has(script) && files.length === 0);
  }
  if (name === "bun" && sub === "test") return !operands(rest).some((arg) => arg.endsWith(".ts"));
  if (name === "vitest") return unscopedVitest(argv.slice(1));
  return ["npx", "bunx"].includes(name) && sub === "vitest" && unscopedVitest(rest);
}

const unscopedVitest = (args: readonly string[]) =>
  operands(args).filter((arg) => arg !== "run").length === 0;

const optedIntoRr = () =>
  spawnSync("git", ["config", "--type=bool", "--get", "quickstack.rr"], {
    encoding: "utf8",
  }).stdout.trim() === "true";

const command = text(readPayload()?.tool_input?.command);
const localGate = /(^|[\s;&|(])QUICKSTACK_LOCAL_GATE=1\s/.test(command ?? "");
for (const { argv, stdin } of commands(command ?? "")) {
  if (!localGate && wholeSuite(argv) && optedIntoRr()) {
    deny(RR);
    break;
  }
  const [executable = "", sub] = argv;
  const name = basename(executable);
  if ((name === "sed" || name === "perl") && argv.slice(1).some(inPlaceFlag)) {
    deny(IN_PLACE);
    break;
  }
  if (/^python[0-9.]*$/.test(name) && /write_text\(|open\([^)]*["'][wa]/.test(stdin.join("\n"))) {
    deny(IN_PLACE);
    break;
  }
  if (
    ["npm", "pnpm", "yarn"].includes(name) &&
    ((name === "yarn" && sub === undefined) ||
      ["install", "i", "add", "ci", "remove", "uninstall", "rm", "update", "up"].includes(
        sub ?? "",
      ))
  ) {
    deny("BLOCKED: bun owns this project's lockfile. Use bun install, bun add, or bun remove.");
    break;
  }
}
