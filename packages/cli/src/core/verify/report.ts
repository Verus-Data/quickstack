import type { FailureKind, StepResult, VerifyResult } from "../../schemas/verify";
import { printable } from "../text";
import { nextLine } from "./next";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
/** One line of step output, safe for a terminal; tabs become spaces rather than escapes. */
export const outputLine = (line: string) => printable(line.replaceAll("\t", "  "));

function stepLines(step: StepResult, width: number): string[] {
  const facts = [
    ...(step.exitCode !== undefined && step.status === "failed" ? [`exit ${step.exitCode}`] : []),
    ...(step.status === "skipped" ? [] : [seconds(step.durationMs)]),
  ].join(", ");
  const why = step.reason ?? step.note;
  const head = `  ${step.status.padEnd(7)}  ${step.phase.padEnd(8)}  ${printable(step.name).padEnd(width)}`;
  const line = [head, facts && `(${facts})`, why && printable(why)].filter(Boolean).join("  ");
  const tail = step.outputTail
    ? step.outputTail.split("\n").map((text) => `      | ${outputLine(text)}`)
    : [];
  return [line.trimEnd(), ...tail];
}

/**
 * The human result: a summary line, one row per step (a failed step's output tail under it), and
 * for a run that isn't green the fixed `Next:` line last.
 */
export function renderVerify(result: VerifyResult, invocation: string): string {
  const width = Math.max(0, ...result.steps.map((step) => printable(step.name).length));
  const { passed, failed, skipped } = result.totals;
  const header = `verify: ${result.outcome} (${result.scope} run; ${passed} passed, ${failed} failed, ${skipped} skipped; ${seconds(result.durationMs)})`;
  const kinds = result.steps.flatMap((step): FailureKind[] =>
    step.failureKind ? [step.failureKind] : [],
  );
  const next = nextLine(result.outcome, invocation, kinds);
  return [
    header,
    ...(result.tamperCheck === "manifest-only"
      ? [
          "Tamper check: manifest only (no state record for this project on this machine), so this run can't count for the MVP gate.",
        ]
      : []),
    ...(result.steps.length ? ["", ...result.steps.flatMap((step) => stepLines(step, width))] : []),
    ...(next ? ["", next] : []),
  ].join("\n");
}
