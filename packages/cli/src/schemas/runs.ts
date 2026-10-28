import { Schema } from "effect";

export const ProjectRuns = Schema.Struct({
  /** Null for a project `add` created without a stack. */
  stack: Schema.NullOr(Schema.String),
  fingerprint: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  handoff: Schema.optionalKey(Schema.String),
  briefWords: Schema.Number,
  verifyRuns: Schema.Number,
  lastOutcome: Schema.NullOr(Schema.String),
  minutesToGreen: Schema.NullOr(Schema.Number),
  /** Run-completion proxy for the first successful test-layer command; no runner counts observed. */
  minutesToFirstTest: Schema.NullOr(Schema.Number),
  interventions: Schema.NullOr(Schema.Number),
  stateRecord: Schema.Boolean,
  skippedLines: Schema.Number,
});
export type ProjectRuns = typeof ProjectRuns.Type;
