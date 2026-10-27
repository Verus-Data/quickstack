import { BRIEF_PATH } from "../../project-layout";
import type { FailureKind, Outcome, VerifyResult } from "../../schemas/verify";

/**
 * The fixed next action after a non-green verify run, worded as the brief's rules word it. `kinds`
 * are the run's failure kinds: a failed run where every one is `env` points at the machine instead
 * of the code. Green and interrupted runs have none. 1.3b passes `"changed"`. The report prints it
 * as its `Next:` line; the error envelope carries it as `next`.
 */
export function verifyNext(
  outcome: Outcome | "changed",
  invocation: string,
  kinds: ReadonlyArray<FailureKind> = [],
  stages?: VerifyResult["stages"],
): string | undefined {
  switch (outcome) {
    case "failed": {
      const application =
        stages?.base === "green" && stages.app === "failed"
          ? `the application section ("Then: the application") of ${BRIEF_PATH}`
          : undefined;
      if (kinds.length && kinds.every((kind) => kind === "env"))
        return `the machine is missing something these steps need (see each reason); install or start it, ${application ? `follow ${application}, ` : ""}then run ${invocation} verify again.`;
      return application
        ? `follow ${application}, fix the code or config these steps exercise, then run ${invocation} verify again.`
        : `fix the code or config these steps exercise, not the steps, then run ${invocation} verify again.`;
    }
    case "partial":
      return `this was a partial run; done means a full ${invocation} verify with outcome green.`;
    case "changed":
      return `the verify steps changed since they were recorded. Don't edit them back; ask the user to run ${invocation} verify --accept-changes from their own terminal, or to undo the change.`;
    case "green":
    case "interrupted":
      return undefined;
  }
}

/** `verifyNext` as the report's `Next:` line. */
export function nextLine(...args: Parameters<typeof verifyNext>): string | undefined {
  const next = verifyNext(...args);
  return next === undefined ? undefined : `Next: ${next}`;
}
