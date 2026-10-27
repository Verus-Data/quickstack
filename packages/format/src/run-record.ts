import { Schema } from "effect";
import { DetectedAgent } from "./agent.js";
import { Phase, StepLayer } from "./entry.js";

/**
 * Why a step failed: its own command (`step`), something the machine lacks or holds (`env`: a
 * missing command, a busy port, a working directory that is missing or outside the project), a
 * time limit (`timeout`), or a stop signal while it ran (`interrupted`).
 */
export const FailureKind = Schema.Literals(["step", "env", "timeout", "interrupted"]);
export type FailureKind = typeof FailureKind.Type;

/**
 * Which copies of the digest this run checked: `full` is the manifest and the state record,
 * `manifest-only` the manifest alone (no record for this project here), which never counts for
 * the MVP gate (D20).
 */
export const TamperCheck = Schema.Literals(["full", "manifest-only"]);
export type TamperCheck = typeof TamperCheck.Type;

export const Outcome = Schema.Literals(["green", "partial", "failed", "changed", "interrupted"]);
const stages = Schema.Struct({ base: Outcome, app: Schema.NullOr(Outcome) });

export type Outcome = typeof Outcome.Type;

/** One step in a run record: no command, output, reason or path, so the file is safe to share. */
export const RunStep = Schema.Struct({
  name: Schema.String,
  phase: Phase,
  layer: Schema.optionalKey(StepLayer),
  status: Schema.Literals(["passed", "failed", "skipped"]),
  failureKind: Schema.optionalKey(FailureKind),
  exitCode: Schema.optionalKey(Schema.Number),
  durationMs: Schema.Number,
});
export type RunStep = typeof RunStep.Type;

/**
 * One line of `.stacks/state/runs.jsonl`, appended by every verify run that reaches the
 * tamper check. Green is `outcome: "green"`. A new optional field doesn't bump `schemaVersion`;
 * readers skip a line with a higher version or one that doesn't decode.
 */
export const RunRecord = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  /** ISO start time, from Clock. */
  at: Schema.String,
  /** The stacks version that ran. */
  cli: Schema.String,
  agent: DetectedAgent,
  outcome: Outcome,
  /** Only for manifests with app-tagged steps; null means the app stage did not run. */
  stages: Schema.optionalKey(stages),
  scope: Schema.Literals(["full", "partial"]),
  tamperCheck: TamperCheck,
  /** This run began with `--accept-changes`. */
  acceptedChanges: Schema.Boolean,
  durationMs: Schema.Number,
  secondsSinceCreated: Schema.Number,
  /** Every step, skipped ones included, in run order. */
  steps: Schema.Array(RunStep),
});
export type RunRecord = typeof RunRecord.Type;
