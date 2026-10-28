import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { JsonSchema, Schema, SchemaRepresentation } from "effect";
import { expect, test } from "vitest";
import {
  TELEMETRY_SCHEMA_VERSION,
  TelemetryAccepted,
  TelemetryAddEvent,
  TelemetryBatch,
  TelemetryErrorEvent,
  TelemetryEvent,
  TelemetryNewEvent,
  TelemetryShowEvent,
  TelemetryVerifyEvent,
  telemetryEventJsonSchema,
} from "../src/index.js";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/telemetry/${name}.json`, import.meta.url), "utf8"),
  );
}

const options = { onExcessProperty: "error" } as const;
const decode = Schema.decodeUnknownSync(TelemetryEvent, options);

test.each([
  ["new", TelemetryNewEvent],
  ["add", TelemetryAddEvent],
  ["verify", TelemetryVerifyEvent],
  ["show", TelemetryShowEvent],
  ["error", TelemetryErrorEvent],
] as const)("the %s fixture decodes through its member and the public union", (name, schema) => {
  const input = fixture(name);
  expect(Schema.decodeUnknownSync(schema, options)(input)).toEqual(input);
  const event = decode(input);
  expect(decode(Schema.encodeSync(TelemetryEvent)(event))).toEqual(input);
  expect(event.schemaVersion).toBe(TELEMETRY_SCHEMA_VERSION);
});

test.each([
  { schemaVersion: 2 },
  { type: "list" },
  { eventId: "not-a-uuid" },
  { installId: "not-a-uuid" },
  { projectId: "my-project" },
  { cliVersion: "dev" },
  { os: "win32" },
  { nodeMajor: 24.5 },
  { nodeMajor: -1 },
  { agent: "copilot" },
  { sentAt: "yesterday" },
])("the envelope rejects values outside v1: %j", (update) => {
  expect(() => decode({ ...decode(fixture("new")), ...update })).toThrow();
});

test("install ids accept RFC 9562 UUIDs including the reserved v8 seed shape", () => {
  const event = decode(fixture("new"));
  for (const installId of [
    "ad7c7211-cc24-1d18-9913-64f8a531523f",
    "ad7c7211-cc24-7d18-9913-64f8a531523f",
    "ad7c7211-cc24-8d18-9913-64f8a531523f",
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
  ]) {
    expect(decode({ ...event, installId }).installId).toBe(installId);
  }
  for (const installId of [
    "ad7c7211-cc24-9d18-9913-64f8a531523f",
    "ad7c7211-cc24-4d18-0913-64f8a531523f",
  ]) {
    expect(() => decode({ ...event, installId })).toThrow();
  }
});

test.each(["new", "add", "verify", "show", "error"])(
  "%s rejects extra fields that could disclose private data",
  (name) => {
    const event = decode(fixture(name));
    for (const key of [
      "path",
      "projectName",
      "remote",
      "username",
      "hostname",
      "env",
      "answers",
      "brief",
      "notes",
      "files",
      "message",
      "details",
      "output",
      "yes",
      "existingRepo",
    ]) {
      expect(() => decode({ ...event, [key]: "/private/project" }), key).toThrow();
    }
  },
);

test.each(["/private/project", "my project", "../custom-entry", "user/custom-entry", "a\nb"])(
  "id fields reject paths and free text: %j",
  (id) => {
    const scaffold = decode(fixture("add"));
    for (const update of [{ stack: id }, { fragments: [id] }, { without: [id] }]) {
      expect(() => decode({ ...scaffold, ...update })).toThrow();
    }
    expect(() => decode({ ...decode(fixture("show")), id })).toThrow();
    expect(() => decode({ ...decode(fixture("error")), stack: id })).toThrow();
    const verify = Schema.decodeUnknownSync(TelemetryVerifyEvent)(fixture("verify"));
    expect(() => decode({ ...verify, steps: [{ ...verify.steps[0], name: id }] })).toThrow();
  },
);

test("show and error cannot carry project ids or fields from another event type", () => {
  for (const name of ["show", "error"]) {
    const event = decode(fixture(name));
    expect(() => decode({ ...event, projectId: "4b4bce19-dd67-4358-a490-02846b30b228" })).toThrow();
    expect(() => decode({ ...event, fragments: [] })).toThrow();
  }
});

test("errors accept only the plan's closed codes and new/add commands", () => {
  const event = decode(fixture("error"));
  for (const code of [
    "ComposeConflict",
    "EntryInvalid",
    "TargetNotEmpty",
    "NotFound",
    "BadInput",
    "PermissionDenied",
    "Interrupted",
    "Defect",
    "other",
  ]) {
    expect(decode({ ...event, code })).toMatchObject({ code });
  }
  expect(() => decode({ ...event, code: "InvalidConfig" })).toThrow();
  expect(() => decode({ ...event, command: "verify" })).toThrow();
  expect(decode({ ...event, command: "add" })).toMatchObject({ command: "add" });
});

test("verify keeps recorded enums and duration buckets without command text or raw timings", () => {
  const event = Schema.decodeUnknownSync(TelemetryVerifyEvent)(fixture("verify"));
  const step = event.steps[0];
  for (const duration of ["5s", "30s", "2m", "10m", "longer"]) {
    expect(decode({ ...event, steps: [{ ...step, duration }] })).toMatchObject({
      steps: [{ duration }],
    });
  }
  for (const update of [
    { duration: 5000 },
    { duration: "1s" },
    { durationMs: 1000 },
    { run: "npm test" },
    { cwd: "/private/project" },
    { exitCode: 1 },
    { phase: "custom" },
    { layer: "custom" },
    { status: "green" },
    { failureKind: "custom" },
  ]) {
    expect(() => decode({ ...event, steps: [{ ...step, ...update }] })).toThrow();
  }
  for (const update of [
    { stepsChanged: -1 },
    { stepsChanged: 0.5 },
    { secondsSinceScaffold: -1 },
    { secondsToFirstTestPass: -1 },
    { outcome: "env-blocked" },
    { tamperCheck: "none" },
    { scope: "app" },
    { stages: { base: "green", app: "failed" } },
  ]) {
    expect(() => decode({ ...event, ...update })).toThrow();
  }
});

test("nested composition objects reject arbitrary origins, counts and private fields", () => {
  const event = decode(fixture("add"));
  for (const update of [
    { origin: "user" },
    { source: "somewhere" },
    { preset: "private" },
    { targetAgents: ["other"] },
    { handoff: "choose" },
    { nonOfficial: { user: -1, project: 0, source: 0 } },
    { nonOfficial: { user: 0.5, project: 0, source: 0 } },
    { nonOfficial: { user: 1, project: 0, source: 0, id: "private" } },
  ]) {
    expect(() => decode({ ...event, ...update })).toThrow();
  }
});

test("a composition with no official entry omits origin", () => {
  const { origin: _, ...custom } = Schema.decodeUnknownSync(TelemetryNewEvent)(fixture("new"));
  const event = { ...custom, stack: "custom", fragments: ["custom"] };
  expect(decode(event)).toEqual(event);
});

test("POST /v1/events accepts 1 through 50 events and rejects empty or oversized batches", () => {
  const event = decode(fixture("new"));
  const batch = Schema.decodeUnknownSync(TelemetryBatch, options);
  for (const size of [1, 50]) {
    expect(batch({ events: Array.from({ length: size }, () => event) }).events).toHaveLength(size);
  }
  for (const events of [
    [],
    Array.from({ length: 51 }, () => event),
    [{ ...event, type: "list" }],
  ]) {
    expect(() => batch({ events })).toThrow();
  }
  expect(() => batch({ events: [event], private: "text" })).toThrow();
  expect(() => batch({ events: [{ ...event, private: "text" }] })).toThrow();
});

test("the 202 body contains only UUID-shaped rejected event ids", () => {
  const accepted = Schema.decodeUnknownSync(TelemetryAccepted, options);
  expect(accepted({ rejected: [] })).toEqual({ rejected: [] });
  const input = { rejected: [decode(fixture("error")).eventId] };
  expect(accepted(input)).toEqual(input);
  expect(() => accepted({ rejected: ["/private/project"] })).toThrow();
  expect(() => accepted({ rejected: [], message: "private" })).toThrow();
});

test("the exported JSON Schema enforces the runtime string restrictions", () => {
  const exported = SchemaRepresentation.fromJsonSchemaDocument(
    JsonSchema.fromSchemaDraft2020_12(telemetryEventJsonSchema()),
    { patterns: "apply" },
  );
  const acceptsExported = Schema.is(exported);
  for (const name of ["new", "add", "verify", "show", "error"]) {
    expect(acceptsExported(fixture(name))).toBe(true);
  }
  const event = decode(fixture("new"));
  for (const update of [
    { cliVersion: "dev" },
    { stack: "/private/project" },
    { fragments: ["user/custom-entry"] },
    { without: ["my project"] },
    { fingerprint: "private text" },
    { sentAt: "2026-10-27" },
  ]) {
    expect(() => decode({ ...event, ...update })).toThrow();
    expect(acceptsExported({ ...event, ...update })).toBe(false);
  }
  const verify = Schema.decodeUnknownSync(TelemetryVerifyEvent)(fixture("verify"));
  expect(acceptsExported({ ...verify, steps: [{ ...verify.steps[0], name: "npm test" }] })).toBe(
    false,
  );
  expect(acceptsExported({ ...decode(fixture("show")), id: "/private/project" })).toBe(false);
  expect(acceptsExported({ ...decode(fixture("error")), stack: "my project" })).toBe(false);
});

test.each(["2026-02-29", "2026-02-31", "2026-04-31"])(
  "timestamps reject impossible calendar dates: %s",
  (day) => {
    expect(() => decode({ ...decode(fixture("new")), sentAt: `${day}T14:02:01.000Z` })).toThrow();
  },
);

test("timestamps accept leap days and UTC times with or without milliseconds", () => {
  for (const sentAt of ["2024-02-29T14:02:01.000Z", "2024-02-29T14:02:01Z"]) {
    expect(decode({ ...decode(fixture("new")), sentAt }).sentAt).toBe(sentAt);
  }
});

test("v1's closed JSON Schema is frozen byte for byte, including formatting", () => {
  const exported = `${JSON.stringify(telemetryEventJsonSchema(), null, 2)}\n`;
  const committed = readFileSync(
    new URL("../schemas/telemetry-event.v1.json", import.meta.url),
    "utf8",
  );
  const digest = (text: string) => createHash("sha256").update(text).digest("hex");
  expect(digest(exported)).toBe(digest(committed));
  expect(telemetryEventJsonSchema()).toMatchObject({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    anyOf: expect.arrayContaining([expect.objectContaining({ additionalProperties: false })]),
  });
});
