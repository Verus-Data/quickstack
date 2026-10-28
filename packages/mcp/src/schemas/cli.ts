import { Schema } from "effect";

export const ListEntry = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["stack", "fragment"]),
  name: Schema.String,
  description: Schema.String,
  tags: Schema.Array(Schema.String),
  origin: Schema.String,
  trusted: Schema.Boolean,
  shadows: Schema.Array(Schema.String),
  lastRun: Schema.NullOr(Schema.String),
});

export type ListEntry = typeof ListEntry.Type;

export const ListResult = Schema.Struct({
  entries: Schema.Array(ListEntry),
});

export type ListResult = typeof ListResult.Type;

export const NewResult = Schema.Struct({
  project: Schema.String,
  fingerprint: Schema.String,
  stack: Schema.String,
  fragments: Schema.Array(Schema.String),
  preset: Schema.String,
  agents: Schema.Array(Schema.String),
  written: Schema.Array(Schema.String),
  brief: Schema.String,
  briefWords: Schema.Int,
  fixedWords: Schema.Int,
  missingTools: Schema.Array(Schema.String),
  untrusted: Schema.Array(Schema.String),
  warnings: Schema.Array(Schema.String),
  git: Schema.Boolean,
  stateRecord: Schema.Boolean,
  handoff: Schema.Struct({
    kind: Schema.String,
    agent: Schema.String,
    untrusted: Schema.Boolean,
    prompt: Schema.String,
  }),
});

export type NewResult = typeof NewResult.Type;

export const VerifyStep = Schema.Struct({
  name: Schema.String,
  phase: Schema.String,
  layer: Schema.String,
  command: Schema.String,
  status: Schema.String,
  exitCode: Schema.Int,
  durationMs: Schema.Int,
});

export type VerifyStep = typeof VerifyStep.Type;

export const VerifyTotals = Schema.Struct({
  passed: Schema.Int,
  failed: Schema.Int,
  skipped: Schema.Int,
});

export type VerifyTotals = typeof VerifyTotals.Type;

export const VerifyResult = Schema.Struct({
  outcome: Schema.String,
  scope: Schema.String,
  steps: Schema.Array(VerifyStep),
  totals: VerifyTotals,
  durationMs: Schema.Int,
  secondsSinceCreated: Schema.Int,
  tamperCheck: Schema.String,
  firstGreen: Schema.Boolean,
  stateRecord: Schema.Boolean,
});

export type VerifyResult = typeof VerifyResult.Type;

export const CliErrorEnvelope = Schema.Struct({
  error: Schema.Struct({
    tag: Schema.String,
    message: Schema.String,
    retryable: Schema.Boolean,
    details: Schema.optional(Schema.Unknown),
  }),
});

export type CliErrorEnvelope = typeof CliErrorEnvelope.Type;
