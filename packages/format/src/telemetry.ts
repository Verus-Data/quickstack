import { Schema } from "effect";
import { AgentId, DetectedAgent } from "./agent.js";
import { Kebab, Kind } from "./entry.js";
import { Digest } from "./index-schema.js";
import { Manifest } from "./manifest.js";
import { Outcome, RunRecord, RunStep, TamperCheck } from "./run-record.js";

export const TELEMETRY_SCHEMA_VERSION = 1;

const Uuid = Schema.String.check(Schema.isUUID());
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Seconds = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0));
// Effect omits the shared schemas' non-Unicode regexes from JSON Schema; retain them for v1.
const EntryId = Kebab.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u));
const Fingerprint = Digest.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/u));
const CliVersion = Schema.String.check(
  Schema.isPattern(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u),
);
const SentAt = Schema.String.check(
  Schema.isPattern(
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/u,
  ),
  Schema.makeFilter(
    (at) => {
      const instant = new Date(at);
      return (
        (Number.isFinite(instant.getTime()) &&
          instant.toISOString().replace(".000Z", "Z") === at.replace(".000Z", "Z")) ||
        "invalid UTC timestamp"
      );
    },
    { toJsonSchema: () => ({ format: "date-time" }) },
  ),
);

const envelope = {
  schemaVersion: Schema.Literal(TELEMETRY_SCHEMA_VERSION),
  eventId: Uuid,
  installId: Uuid,
  cliVersion: CliVersion,
  os: Schema.Literals(["darwin", "linux", "other"]),
  nodeMajor: Schema.Int.check(Schema.isGreaterThan(0)),
  agent: DetectedAgent,
  sentAt: SentAt,
};

/** Official-name lookup and replacement with `custom` belong to the sender and ingest. */
const composition = {
  projectId: Schema.optionalKey(Uuid),
  stack: EntryId,
  fragments: Schema.Array(EntryId),
  without: Schema.Array(EntryId),
  preset: Manifest.fields.preset,
  targetAgents: Schema.Array(AgentId),
  handoff: Manifest.fields.handoff.schema.fields.kind,
  source: Schema.optionalKey(Schema.Literals(["web", "docs", "skill", "cli", "other"])),
  // Absent when no entry is official.
  origin: Schema.optionalKey(Schema.Literals(["bundled", "index", "mixed"])),
  nonOfficial: Schema.Struct({ user: Count, project: Count, source: Count }),
  fingerprint: Schema.optionalKey(Fingerprint),
};

export const TelemetryNewEvent = Schema.Struct({
  ...envelope,
  type: Schema.Literal("new"),
  ...composition,
});
export type TelemetryNewEvent = typeof TelemetryNewEvent.Type;

export const TelemetryAddEvent = Schema.Struct({
  ...envelope,
  type: Schema.Literal("add"),
  ...composition,
});
export type TelemetryAddEvent = typeof TelemetryAddEvent.Type;

const step = Schema.Struct({
  name: EntryId,
  phase: RunStep.fields.phase,
  layer: RunStep.fields.layer,
  status: RunStep.fields.status,
  failureKind: RunStep.fields.failureKind,
  duration: Schema.Literals(["5s", "30s", "2m", "10m", "longer"]),
});

export const TelemetryVerifyEvent = Schema.Struct({
  ...envelope,
  type: Schema.Literal("verify"),
  projectId: Schema.optionalKey(Uuid),
  scope: RunRecord.fields.scope,
  outcome: Outcome,
  tamperCheck: TamperCheck,
  steps: Schema.Array(step),
  stepsChanged: Count,
  secondsSinceScaffold: Seconds,
  secondsToFirstTestPass: Schema.optionalKey(Seconds),
});
export type TelemetryVerifyEvent = typeof TelemetryVerifyEvent.Type;

export const TelemetryShowEvent = Schema.Struct({
  ...envelope,
  type: Schema.Literal("show"),
  kind: Kind,
  id: EntryId,
});
export type TelemetryShowEvent = typeof TelemetryShowEvent.Type;

export const TelemetryErrorEvent = Schema.Struct({
  ...envelope,
  type: Schema.Literal("error"),
  command: Schema.Literals(["new", "add"]),
  code: Schema.Literals([
    "ComposeConflict",
    "EntryInvalid",
    "TargetNotEmpty",
    "NotFound",
    "BadInput",
    "PermissionDenied",
    "Interrupted",
    "Defect",
    "other",
  ]),
  stack: Schema.optionalKey(EntryId),
});
export type TelemetryErrorEvent = typeof TelemetryErrorEvent.Type;

/** Decode at a boundary with `onExcessProperty: "error"` to reject unknown keys. */
export const TelemetryEvent = Schema.Union([
  TelemetryNewEvent,
  TelemetryAddEvent,
  TelemetryVerifyEvent,
  TelemetryShowEvent,
  TelemetryErrorEvent,
]);
export type TelemetryEvent = typeof TelemetryEvent.Type;

/** POST /v1/events request body. */
export const TelemetryBatch = Schema.Struct({
  events: Schema.Array(TelemetryEvent).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
});
export type TelemetryBatch = typeof TelemetryBatch.Type;

/** The 202 response lists only rejected event ids; an empty list accepts every event. */
export const TelemetryAccepted = Schema.Struct({ rejected: Schema.Array(Uuid) });
export type TelemetryAccepted = typeof TelemetryAccepted.Type;

/** Standalone draft 2020-12 document; released v1 is frozen in schemas/telemetry-event.v1.json. */
export function telemetryEventJsonSchema(): Record<string, unknown> {
  const document = Schema.toJsonSchemaDocument(TelemetryEvent, { onExcessProperty: "error" });
  const definitions = document.definitions ?? {};
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...document.schema,
    ...(Object.keys(definitions).length ? { $defs: definitions } : {}),
  };
}
