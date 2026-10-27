import { Schema } from "effect";
import { Phase, StepLayer } from "./entry";

/**
 * Why a step failed: its own command (`step`), something the machine lacks or holds (`env`: a
 * missing command, a busy port, a working directory that is missing or outside the project), a
 * time limit (`timeout`), or a stop signal while it ran (`interrupted`).
 */
export const FailureKind = Schema.Literals(["step", "env", "timeout", "interrupted"]);
export type FailureKind = typeof FailureKind.Type;

/** One step's outcome. `reason` and `note` are fixed CLI text; only `outputTail` is step output. */
export const StepResult = Schema.Struct({
  name: Schema.String,
  phase: Phase,
  layer: Schema.optionalKey(StepLayer),
  /** The step's `run`, as the manifest has it. */
  command: Schema.String,
  status: Schema.Literals(["passed", "failed", "skipped"]),
  /** Only on a failed step. */
  failureKind: Schema.optionalKey(FailureKind),
  /** The command's exit status, when it ran and exited. */
  exitCode: Schema.optionalKey(Schema.Number),
  durationMs: Schema.Number,
  /** Why it failed or was skipped. */
  reason: Schema.optionalKey(Schema.String),
  /** On a passed step: something worth knowing that didn't fail it. */
  note: Schema.optionalKey(Schema.String),
  /** A failed step's own output, its last `TAIL_LINES` lines. */
  outputTail: Schema.optionalKey(Schema.String),
});
export type StepResult = typeof StepResult.Type;

/**
 * `verify --json`'s result. `green` is a full run with every step that ran passing; `partial` is a
 * `--only` or `--skip-tag` run that passed, which never counts as green. 1.3b adds `changed`.
 */
export const VerifyResult = Schema.Struct({
  outcome: Schema.Literals(["green", "partial", "failed", "interrupted"]),
  scope: Schema.Literals(["full", "partial"]),
  steps: Schema.Array(StepResult),
  totals: Schema.Struct({
    passed: Schema.Number,
    failed: Schema.Number,
    skipped: Schema.Number,
  }),
  durationMs: Schema.Number,
  /** Seconds from the manifest's `createdAt` to the end of this run. */
  secondsSinceCreated: Schema.Number,
});
export type VerifyResult = typeof VerifyResult.Type;
export type Outcome = VerifyResult["outcome"];
