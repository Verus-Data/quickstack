import { Schema } from "effect";

// --- SARIF 2.1.0 subset (the authority is the OASIS JSON schema) ---

export type SarifLogLevel = "note" | "warning" | "error" | undefined;

export type ArtifactLocation = {
  readonly uri?: string;
  readonly uriBaseId?: string;
};

export type PhysicalLocation = {
  readonly artifactLocation?: ArtifactLocation;
};

export type Location = {
  readonly physicalLocation?: PhysicalLocation;
};

export type Result = {
  readonly ruleId?: string;
  readonly level?: SarifLogLevel;
  readonly message?: { readonly text?: string };
  readonly locations?: ReadonlyArray<Location>;
  readonly partialFingerprints?: Readonly<Record<string, string>>;
};

export type ToolDriver = {
  readonly name?: string;
  readonly version?: string;
};

export type Tool = {
  readonly driver?: ToolDriver;
};

export type Invocation = {
  readonly executionSuccessful?: boolean;
  readonly exitCode?: number;
  readonly startTimeUtc?: string;
  readonly endTimeUtc?: string;
};

export type Artifact = {
  readonly location?: ArtifactLocation;
};

export type OriginalUriBaseId = { readonly uri?: string; readonly uriBaseId?: string };

export type SarifRun = {
  readonly tool?: Tool;
  readonly invocations?: ReadonlyArray<Invocation>;
  readonly results?: ReadonlyArray<Result>;
  readonly artifacts?: ReadonlyArray<Artifact>;
  readonly originalUriBaseIds?: Readonly<Record<string, OriginalUriBaseId>>;
  readonly properties?: Readonly<Record<string, unknown>>;
};

export type SarifLog = {
  readonly version: string;
  readonly $schema?: string;
  readonly runs: ReadonlyArray<SarifRun>;
  readonly properties?: Readonly<Record<string, unknown>>;
};

export type ValidationResult =
  | { readonly ok: true; readonly log: SarifLog }
  | { readonly ok: false; readonly reason: string; readonly version?: string };

const SCHEMA_URI =
  "https://docs.oasis-open.org/sarif/sarif/v2.1.0/cs01/schemas/sarif-schema-2.1.0.json";

export function sarifSchemaUri(): string {
  return SCHEMA_URI;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateSarif(value: unknown): ValidationResult {
  if (!isObject(value)) {
    return { ok: false, reason: "SARIF log must be a JSON object." };
  }
  const version = typeof value.version === "string" ? value.version : undefined;
  if (version !== "2.1.0") {
    return {
      ok: false,
      reason: `Unsupported SARIF version: expected "2.1.0", got ${JSON.stringify(version ?? null)}.`,
      version,
    };
  }
  const runs = value.runs;
  if (!Array.isArray(runs)) {
    return { ok: false, reason: "SARIF log is missing the runs array.", version };
  }
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    if (!isObject(run)) {
      return { ok: false, reason: `runs[${i}] is not an object.`, version };
    }
    const tool = run.tool;
    if (tool !== undefined && !isObject(tool)) {
      return { ok: false, reason: `runs[${i}].tool is not an object.`, version };
    }
    const results = run.results;
    if (results !== undefined && !Array.isArray(results)) {
      return { ok: false, reason: `runs[${i}].results is not an array.`, version };
    }
  }
  return { ok: true, log: value as SarifLog };
}

export function countResults(log: SarifLog): number {
  let total = 0;
  for (const run of log.runs) {
    if (Array.isArray(run.results)) {
      total += run.results.length;
    }
  }
  return total;
}

// --- AnalysisSummary (what a ledger record holds) ---

export const ToolNotRunEntry = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["absent", "skipped", "failed", "timeout"]),
  reason: Schema.optionalKey(Schema.String),
});

export const AnalysisSummary = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  runId: Schema.String,
  createdAt: Schema.String,
  digest: Schema.String,
  target: Schema.Struct({
    files: Schema.Number,
    bytes: Schema.Number,
    skippedSymlinks: Schema.Number,
    excluded: Schema.Array(Schema.String),
  }),
  layout: Schema.Struct({
    topLevel: Schema.Array(Schema.String),
    maxDepth: Schema.Number,
  }),
  metrics: Schema.Struct({
    lines: Schema.Number,
    codeLines: Schema.Number,
    blankLines: Schema.Number,
    testRatio: Schema.Number,
    byLanguage: Schema.Record(Schema.String, Schema.Number),
    markers: Schema.Record(Schema.String, Schema.Number),
    manifests: Schema.Array(Schema.String),
  }),
  attribution: Schema.Struct({
    kind: Schema.Literals(["manifest", "label", "none"]),
    stack: Schema.optionalKey(Schema.String),
    with: Schema.Array(Schema.String),
    preset: Schema.optionalKey(Schema.String),
    agent: Schema.optionalKey(Schema.String),
    fingerprint: Schema.optionalKey(Schema.String),
    label: Schema.optionalKey(Schema.String),
  }),
  toolsNotRun: Schema.Array(ToolNotRunEntry),
  findings: Schema.Struct({
    total: Schema.Number,
    byLevel: Schema.Struct({
      error: Schema.Number,
      warning: Schema.Number,
      note: Schema.Number,
    }),
  }),
}).annotate({
  title: "Analysis summary",
  description: "The summary a ledger record holds; the SARIF log is the full artefact",
});

export type AnalysisSummary = typeof AnalysisSummary.Type;
