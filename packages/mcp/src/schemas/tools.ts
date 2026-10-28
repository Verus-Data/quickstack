import { Schema } from "effect";
import { ListEntry } from "./cli";

export const ListParams = Schema.Struct({
  kind: Schema.optionalKey(Schema.Literals(["stack", "fragment"])),
});

export type ListParams = typeof ListParams.Type;

export const ListSuccess = Schema.Struct({
  entries: Schema.Array(ListEntry),
});

export type ListSuccess = typeof ListSuccess.Type;

export const NewParams = Schema.Struct({
  stack: Schema.String,
  dir: Schema.optionalKey(Schema.String),
  sandbox: Schema.optionalKey(Schema.Boolean),
  with: Schema.optionalKey(Schema.Array(Schema.String)),
  without: Schema.optionalKey(Schema.Array(Schema.String)),
});

export type NewParams = typeof NewParams.Type;

export const NewSuccess = Schema.Struct({
  project: Schema.String,
  stack: Schema.String,
  fragments: Schema.Array(Schema.String),
  agents: Schema.Array(Schema.String),
  written: Schema.Array(Schema.String),
  briefWords: Schema.Number,
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

export type NewSuccess = typeof NewSuccess.Type;

export const VerifyParams = Schema.Struct({
  dir: Schema.optionalKey(Schema.String),
});

export type VerifyParams = typeof VerifyParams.Type;

export const VerifyStepResult = Schema.Struct({
  name: Schema.String,
  status: Schema.String,
  exitCode: Schema.optionalKey(Schema.Number),
  durationMs: Schema.Number,
});

export const VerifySuccess = Schema.Struct({
  outcome: Schema.String,
  totals: Schema.Struct({
    passed: Schema.Number,
    failed: Schema.Number,
    skipped: Schema.Number,
  }),
  durationMs: Schema.Number,
  steps: Schema.Array(VerifyStepResult),
});

export type VerifySuccess = typeof VerifySuccess.Type;
