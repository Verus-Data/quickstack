import { Effect } from "effect";
import { type Entry, isRejected, type RejectedEntry } from "./registry/entry";
import { defaultRoots, Registry } from "./registry/registry";
import { printable } from "./text";

/** A stack's id and display name, for the listing shown before the wizard. */
export type StackInfo = { id: string; name: string };

/**
 * One line per stack, id first, then the display name, sorted by id. No stack is dropped. Ids are
 * padded to a common width so the names align; the padding is whitespace only (no ANSI).
 */
export function stackLines(stacks: ReadonlyArray<StackInfo>): string[] {
  if (!stacks.length) return [];
  const sorted = stacks.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const width = Math.max(...sorted.map((s) => s.id.length));
  return sorted.map((s) => `${s.id.padEnd(width)}  ${printable(s.name)}`);
}

/** Value-taking flags of `new`: the arg after one is its value, not a positional. */
const VALUE_FLAGS = new Set(["--with", "--without", "--agents", "--scope", "--launch"]);

/**
 * Whether a positional stack argument is present after `new`. Flags and their values are skipped;
 * anything after `--` is positional. A bare value (not starting with `-`) before `--` is the stack.
 */
export function hasStackArg(args: readonly string[]): boolean {
  const end = args.indexOf("--");
  const before = end === -1 ? args : args.slice(0, end);
  const after = end === -1 ? [] : args.slice(end + 1);
  const newIdx = before.indexOf("new");
  if (newIdx === -1) return false;
  for (let i = newIdx + 1; i < before.length; ) {
    const arg = before[i];
    if (!arg) break;
    if (arg.startsWith("--") && arg.includes("=")) {
      i++;
    } else if (VALUE_FLAGS.has(arg)) {
      const next = before[i + 1];
      i += next !== undefined && !next.startsWith("-") ? 2 : 1;
    } else if (arg.startsWith("-")) {
      i++;
    } else {
      return true;
    }
  }
  return after.length > 0;
}

/** Whether `value` appears in `args` before any `--`. */
function includesBeforeDash(args: readonly string[], value: string): boolean {
  const end = args.indexOf("--");
  return (end === -1 ? args : args.slice(0, end)).includes(value);
}

/**
 * Whether to show the stack listing before the command runs. Prints for `new --wizard` (without
 * `--json` and without a stack arg) and for `new` with no stack when stdin is a terminal. JSON mode
 * is always silent. Commands other than `new` never show it.
 */
export function shouldShowStacks(args: readonly string[], stdinIsTTY: boolean): boolean {
  if (includesBeforeDash(args, "--json")) return false;
  if (!includesBeforeDash(args, "new")) return false;
  if (hasStackArg(args)) return false;
  if (includesBeforeDash(args, "--wizard")) return true;
  return stdinIsTTY;
}

/**
 * The stacks in the registry as id and name, sorted by id. A registry that can't be read yields an
 * empty list: the command itself will report its own error.
 */
export const readStackInfos = Effect.gen(function* () {
  const items = yield* Registry.pipe(
    Effect.flatMap((registry) => registry.all),
    Effect.provide(Registry.layer(yield* defaultRoots)),
    Effect.orElseSucceed(() => [] as ReadonlyArray<Entry | RejectedEntry>),
  );
  return items
    .filter((item): item is Entry => !isRejected(item) && item.kind === "stack")
    .map((entry) => ({ id: entry.id, name: entry.meta.name }));
});
