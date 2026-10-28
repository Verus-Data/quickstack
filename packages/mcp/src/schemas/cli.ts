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

const EntryRef = Schema.Struct({ kind: Schema.String, id: Schema.String });

export const NewResult = Schema.Struct({
  project: Schema.String,
  fingerprint: Schema.String,
  stack: Schema.String,
  fragments: Schema.Array(Schema.String),
  preset: Schema.Literals(["default", "sandbox"]),
  agents: Schema.Array(Schema.String),
  written: Schema.Array(Schema.String),
  brief: Schema.Literal(".quickstacks/BRIEF.md"),
  briefWords: Schema.Number,
  fixedWords: Schema.Number,
  missingTools: Schema.Array(
    Schema.Struct({
      tool: Schema.String,
      owners: Schema.Array(EntryRef),
      drop: Schema.Array(
        Schema.Struct({ id: Schema.String, flag: Schema.Literals(["without", "with"]) }),
      ),
    }),
  ),
  untrusted: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.String,
      origin: Schema.String,
      dir: Schema.String,
    }),
  ),
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.String,
      id: Schema.String,
      exitCode: Schema.optionalKey(Schema.Number),
    }),
  ),
  git: Schema.Literals(["fresh", "parent", "none"]),
  stateRecord: Schema.Boolean,
  handoff: Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("inside-agent"),
      agent: Schema.String,
      untrusted: Schema.Array(Schema.String),
      prompt: Schema.String,
    }),
    Schema.Struct({
      kind: Schema.Literal("print"),
      reason: Schema.String,
      agent: Schema.optionalKey(Schema.String),
      untrusted: Schema.Array(Schema.String),
      prompt: Schema.String,
    }),
  ]),
});

export type NewResult = typeof NewResult.Type;

export const VerifyStep = Schema.Struct({
  name: Schema.String,
  phase: Schema.String,
  layer: Schema.optionalKey(Schema.String),
  command: Schema.String,
  status: Schema.Literals(["passed", "failed", "skipped"]),
  failureKind: Schema.optionalKey(Schema.String),
  exitCode: Schema.optionalKey(Schema.Number),
  durationMs: Schema.Number,
  reason: Schema.optionalKey(Schema.String),
  note: Schema.optionalKey(Schema.String),
  outputTail: Schema.optionalKey(Schema.String),
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
  stages: Schema.optionalKey(
    Schema.Struct({
      base: Schema.String,
      app: Schema.NullOr(Schema.String),
    }),
  ),
  scope: Schema.String,
  steps: Schema.Array(VerifyStep),
  totals: VerifyTotals,
  durationMs: Schema.Number,
  secondsSinceCreated: Schema.Number,
  tamperCheck: Schema.String,
  changed: Schema.optionalKey(
    Schema.Struct({
      against: Schema.String,
      reason: Schema.String,
      removed: Schema.Array(Schema.String),
      added: Schema.Array(Schema.String),
      edited: Schema.Array(Schema.String),
      settings: Schema.Boolean,
    }),
  ),
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
