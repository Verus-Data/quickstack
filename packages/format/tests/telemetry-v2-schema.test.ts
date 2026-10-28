import { readFileSync } from "node:fs";
import { it } from "@effect/vitest";
import { JsonSchema, Schema, SchemaRepresentation } from "effect";
import { expect, test } from "vitest";
import {
  DependencyAllowlist,
  TELEMETRY_SCHEMA_VERSION,
  TelemetryBatch,
  TelemetryEvent,
  TelemetryEventV2,
  TelemetryVerifyEventV2,
  telemetryEventV2JsonSchema,
} from "../src/index.js";

const options = { onExcessProperty: "error" } as const;
const decodeBatch = Schema.decodeUnknownSync(TelemetryBatch, options);
const decodeV2 = Schema.decodeUnknownSync(TelemetryEventV2, options);
const verifyV1 = Schema.decodeUnknownSync(
  TelemetryEvent,
  options,
)(JSON.parse(readFileSync(new URL("./fixtures/telemetry/verify.json", import.meta.url), "utf8")));
const verifyV2 = {
  ...verifyV1,
  schemaVersion: 2,
};
const deps = [
  { ecosystem: "crates", name: "serde", major: "1" },
  { ecosystem: "go", name: "github.com/a/b", major: "0.2" },
  { ecosystem: "npm", name: "react", major: "18" },
  { ecosystem: "pypi", name: "requests", major: null },
];

test.each(["new", "add", "verify", "show", "error"])(
  "v2 %s preserves its v1 fields and closes the event",
  (name) => {
    const v1 = Schema.decodeUnknownSync(
      TelemetryEvent,
      options,
    )(
      JSON.parse(
        readFileSync(new URL(`./fixtures/telemetry/${name}.json`, import.meta.url), "utf8"),
      ),
    );
    const v2 = { ...v1, schemaVersion: 2 };
    expect(decodeV2(v2)).toEqual(v2);
    expect(() => decodeV2({ ...v2, private: "text" })).toThrow();
  },
);

test("v1, v2, and mixed batches decode without changing the public v1 event", () => {
  expect(TELEMETRY_SCHEMA_VERSION).toBe(1);
  expect(Schema.decodeUnknownSync(TelemetryEvent, options)(verifyV1)).toEqual(verifyV1);
  expect(() => Schema.decodeUnknownSync(TelemetryEvent, options)(verifyV2)).toThrow();
  for (const events of [[verifyV1], [verifyV2], [verifyV1, verifyV2]]) {
    expect(decodeBatch({ events }).events).toEqual(events);
  }
  expect(decodeV2({ ...verifyV2, deps })).toEqual({ ...verifyV2, deps });
});

test("v2 verify rejects oversized, unsorted, duplicate, and unknown dependencies", () => {
  const decodeVerify = Schema.decodeUnknownSync(TelemetryVerifyEventV2, options);
  for (const invalid of [
    Array.from({ length: 101 }, (_, index) => ({
      ecosystem: "npm",
      name: `package-${index.toString().padStart(3, "0")}`,
      major: "1",
    })),
    [deps[2], deps[0]],
    [deps[0], deps[0]],
    [{ ecosystem: "private", name: "react", major: "18" }],
    [{ ecosystem: "npm", name: "react", major: "05" }],
    [{ ecosystem: "npm", name: "react", major: "v2" }],
  ]) {
    expect(() => decodeVerify({ ...verifyV2, deps: invalid })).toThrow();
  }
  expect(() => Schema.decodeUnknownSync(TelemetryEvent, options)({ ...verifyV1, deps })).toThrow();
});

test("allowlist requires four ecosystem keys and sorted, unique names", () => {
  const decode = Schema.decodeUnknownSync(DependencyAllowlist, options);
  const allowlist = {
    formatVersion: 1,
    generatedAt: "2026-10-28T00:00:00Z",
    names: { npm: ["react", "vite"], pypi: [], go: [], crates: ["serde"] },
  };
  expect(decode(allowlist)).toEqual(allowlist);
  expect(() =>
    decode({ ...allowlist, names: { ...allowlist.names, npm: ["vite", "react"] } }),
  ).toThrow();
  expect(() =>
    decode({ ...allowlist, names: { ...allowlist.names, npm: ["react", "react"] } }),
  ).toThrow();
  expect(() => decode({ ...allowlist, names: { npm: [], pypi: [], go: [] } })).toThrow();
  expect(() => decode({ ...allowlist, names: { ...allowlist.names, ruby: [] } })).toThrow();
});

test("v2's exported JSON Schema is frozen and closes every event", () => {
  const exported = `${JSON.stringify(telemetryEventV2JsonSchema(), null, 2)}\n`;
  const committed = readFileSync(
    new URL("../schemas/telemetry-event.v2.json", import.meta.url),
    "utf8",
  );
  expect(exported).toBe(committed);
  const schema = SchemaRepresentation.fromJsonSchemaDocument(
    JsonSchema.fromSchemaDraft2020_12(telemetryEventV2JsonSchema()),
    { patterns: "apply" },
  );
  expect(Schema.is(schema)({ ...verifyV2, deps })).toBe(true);
  expect(
    Schema.is(schema)({ ...verifyV2, deps: [{ ecosystem: "npm", name: "react", major: "05" }] }),
  ).toBe(false);
  expect(telemetryEventV2JsonSchema()).toMatchObject({
    anyOf: expect.arrayContaining([expect.objectContaining({ additionalProperties: false })]),
  });
});

it.prop(
  "every decoded v2 event re-encodes to the same JSON",
  [TelemetryEventV2],
  ([event]) => {
    const json: unknown = JSON.parse(JSON.stringify(event));
    const decoded = decodeV2(json);
    expect(Schema.encodeSync(TelemetryEventV2)(decoded)).toEqual(json);
  },
  { arbitrary: { seed: "telemetry-v2", runs: 50, size: 20 } },
);
