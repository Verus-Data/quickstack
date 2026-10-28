import { Schema } from "effect";
import { expect, test } from "vitest";

test("official names and compositions are exported schemas for the signed payload [4.0e#1]", async () => {
  const { OfficialNames, NamedComposition } = await import("../src/index");
  expect(OfficialNames).toBeDefined();
  expect(NamedComposition).toBeDefined();
  const composition = { fragments: ["tools"], steps: ["install", "test"] };
  expect(Schema.decodeUnknownSync(NamedComposition)(composition)).toEqual(composition);
  const value = {
    formatVersion: 1,
    generatedAt: "2026-10-27T09:00:00Z",
    commit: "1".repeat(40),
    sources: [
      {
        origin: "release",
        version: "0.1.0",
        stacks: [{ id: "sample", compositions: [composition] }],
        fragments: ["tools"],
      },
      { origin: "index", stacks: [], fragments: [] },
    ],
  };
  expect(Schema.decodeUnknownSync(OfficialNames)(value)).toEqual(value);
  expect(() => Schema.decodeUnknownSync(OfficialNames)({ ...value, formatVersion: 2 })).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(NamedComposition)({ fragments: ["../tools"], steps: [] }),
  ).toThrow();
});
