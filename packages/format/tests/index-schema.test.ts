import { createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { expect, test } from "vitest";

const digest = `sha256:${"a".repeat(64)}`;
const lastRun = {
  date: "2026-10-27",
  result: "pass",
  agent: "claude",
  preset: "default",
  minutesToGreen: 2.5,
  fingerprint: digest,
};
const stack = {
  id: "sample",
  kind: "stack",
  schemaVersion: 1,
  name: "Sample",
  description: "A proven stack.",
  tags: ["scripts"],
  digest,
  composition: { tools: digest },
  lastRun,
};

test("index schemas and trust roots are exported through the package boundary [4.0c#1]", async () => {
  const schemas = await import("../src/index-schema");
  const keys = await import("../src/index-keys");
  const api = await import("../src/index");
  expect(api.LastRun).toBe(schemas.LastRun);
  expect(api.IndexEntry).toBe(schemas.IndexEntry);
  expect(api.RegistryIndex).toBe(schemas.RegistryIndex);
  expect(api.SignedIndex).toBe(schemas.SignedIndex);
  expect(api.INDEX_PUBLIC_KEYS).toBe(keys.INDEX_PUBLIC_KEYS);
  const ids = new Set<string>();
  const fixture = createPublicKey(
    readFileSync(
      join(import.meta.dirname, "../../cli/tests/fixtures/index/test-public.pem"),
      "utf8",
    ),
  )
    .export({ type: "spki", format: "der" })
    .toString("hex");
  for (const key of keys.INDEX_PUBLIC_KEYS) {
    expect(key.keyId.trim()).not.toBe("");
    expect(ids.has(key.keyId)).toBe(false);
    ids.add(key.keyId);
    const parsed = createPublicKey(key.publicKey);
    expect(parsed.asymmetricKeyType).toBe("ed25519");
    expect(parsed.export({ type: "spki", format: "der" }).toString("hex")).not.toBe(fixture);
  }
});

test("index payload and envelope decode while payload bytes remain untouched [4.0c#1]", async () => {
  const { RegistryIndex, SignedIndex } = await import("../src/index-schema");
  const payload = JSON.stringify(
    {
      formatVersion: 1,
      minCli: "0.3.1",
      generatedAt: "2026-10-27T09:00:00Z",
      commit: "1".repeat(40),
      entries: [stack],
    },
    null,
    2,
  );
  const input = { keyId: "fixture", signature: "", payload: `${payload}\n` };
  const decoded = Schema.decodeUnknownSync(SignedIndex)(input);
  expect(decoded).toEqual(input);
  expect(Schema.decodeUnknownSync(RegistryIndex)(JSON.parse(decoded.payload)).entries).toEqual([
    stack,
  ]);
  expect(() =>
    Schema.decodeUnknownSync(RegistryIndex)({ ...JSON.parse(payload), formatVersion: 2 }),
  ).toThrow();
});

test("stack entries require pinned default fragments; fragments need no proof fields [4.0c#2]", async () => {
  const { IndexEntry } = await import("../src/index-schema");
  expect(Schema.decodeUnknownSync(IndexEntry)(stack)).toEqual(stack);
  const { composition: _composition, lastRun: _lastRun, ...metadata } = stack;
  expect(() => Schema.decodeUnknownSync(IndexEntry)({ ...metadata, lastRun })).toThrow();
  expect(Schema.decodeUnknownSync(IndexEntry)({ ...metadata, kind: "fragment" })).toEqual({
    ...metadata,
    kind: "fragment",
  });
  expect(Schema.decodeUnknownSync(IndexEntry)({ ...stack, composition: {} }).composition).toEqual(
    {},
  );
});

test("entry ids, bundle digests and composition digests reject unsafe or malformed input [4.0c#1]", async () => {
  const { IndexEntry } = await import("../src/index-schema");
  for (const input of [
    { ...stack, id: "../sample" },
    { ...stack, kind: "app" },
    { ...stack, schemaVersion: 1.5 },
    { ...stack, digest: "not-a-digest" },
    { ...stack, composition: { "../tools": digest } },
    { ...stack, composition: { tools: "sha256:short" } },
  ])
    expect(() => Schema.decodeUnknownSync(IndexEntry)(input)).toThrow();
});

test.each(["claude", "codex", "opencode", "cursor", "other", "none"])(
  "lastRun accepts recorded agent %s and preserves null timing [4.0c#4]",
  async (agent) => {
    const { LastRun } = await import("../src/index-schema");
    const value = { ...lastRun, agent, minutesToGreen: null };
    expect(Schema.decodeUnknownSync(LastRun)(value)).toEqual(value);
    expect(() => Schema.decodeUnknownSync(LastRun)({ ...value, agent: "unknown" })).toThrow();
    expect(() => Schema.decodeUnknownSync(LastRun)({ ...value, result: "fail" })).toThrow();
  },
);
