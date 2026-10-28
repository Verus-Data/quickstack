import { Schema } from "effect";

// Shapes copied from packages/cli/src/schemas — not imported, to avoid a
// cross-package source dependency. Keep them in sync with the CLI when it
// changes. Origin: packages/cli/src/schemas/origin.ts
const Origin = Schema.Literals(["project", "user", "index", "bundled"]);
// Kind: packages/format/src/entry.ts (re-declared here for the same reason)
const Kind = Schema.Literals(["stack", "fragment"]);
// Category: packages/format/src/entry.ts
const Category = Schema.Literals([
  "agent-ops",
  "app",
  "ci",
  "deploy",
  "release",
  "service",
  "vendor",
  "tooling",
]);
// DetectedAgent: packages/format/src/agent.ts
const DetectedAgent = Schema.Literals(["claude", "codex", "opencode", "cursor", "other", "none"]);

// LastRun: copied from packages/cli/src/schemas/ledger.ts
const LastRun = Schema.Struct({
  date: Schema.String,
  result: Schema.Literals(["pass", "partial", "fail", "infra"]),
  agent: DetectedAgent,
  preset: Schema.String,
  fingerprint: Schema.String,
});

// ListEntry: copied from packages/cli/src/schemas/list.ts (ListRow)
export const ListEntry = Schema.Struct({
  id: Schema.String,
  kind: Kind,
  name: Schema.String,
  description: Schema.String,
  tags: Schema.Array(Schema.String),
  category: Schema.optionalKey(Category),
  appliesTo: Schema.optionalKey(Schema.Array(Schema.String)),
  origin: Origin,
  trusted: Schema.Boolean,
  shadows: Schema.Array(Origin),
  lastRun: Schema.NullOr(LastRun),
});

export type ListEntry = typeof ListEntry.Type;

// ListResult: copied from packages/cli/src/schemas/list.ts
// (notice and project are optional; the handler only reads entries)
export const ListResult = Schema.Struct({
  notice: Schema.optionalKey(Schema.String),
  project: Schema.optionalKey(
    Schema.Struct({
      stack: Schema.NullOr(Schema.String),
      applied: Schema.Array(Schema.String),
      addable: Schema.Array(Schema.String),
    }),
  ),
  entries: Schema.Array(ListEntry),
  rejected: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Kind,
      origin: Origin,
      dir: Schema.String,
      error: Schema.String,
    }),
  ),
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
  brief: Schema.Literal(".stacks/BRIEF.md"),
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
