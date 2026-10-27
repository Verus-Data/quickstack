import type { FailureKind, Outcome } from "../../schemas/verify";

/**
 * The fixed human `Next:` line that ends a non-green verify run, worded as the brief's rules word
 * it. `kinds` are the run's failure kinds: a failed run where every one is `env` points at the
 * machine instead of the code. Green and interrupted runs have none. 1.3b passes `"changed"`.
 */
export function nextLine(
  outcome: Outcome | "changed",
  invocation: string,
  kinds: ReadonlyArray<FailureKind> = [],
): string | undefined {
  switch (outcome) {
    case "failed":
      return kinds.length && kinds.every((kind) => kind === "env")
        ? `Next: the machine is missing something these steps need (see each reason); install or start it, then run ${invocation} verify again.`
        : `Next: fix the code or config these steps exercise, not the steps, then run ${invocation} verify again.`;
    case "partial":
      return `Next: this was a partial run; done means a full ${invocation} verify with outcome green.`;
    case "changed":
      return `Next: the verify steps changed since they were recorded. Don't edit them back; ask the user to run ${invocation} verify --accept-changes from their own terminal, or to undo the change.`;
    case "green":
    case "interrupted":
      return undefined;
  }
}
