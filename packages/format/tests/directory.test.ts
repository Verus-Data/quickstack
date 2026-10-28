import { Schema } from "effect";
import { expect, test } from "vitest";

const lastRun = {
  date: "2026-10-27",
  result: "pass",
  agent: "claude",
  preset: "sandbox",
  minutesToGreen: null,
  fingerprint: `sha256:${"a".repeat(64)}`,
};
const removed = {
  id: "old-stack",
  kind: "stack",
  removedAt: "2026-11-03",
  reason: "Merged <old> into new-stack",
  replacedBy: "new-stack",
  last: {
    version: "v0.10.0",
    name: "Old stack",
    description: "A retired stack.",
    tags: ["api"],
    steps: [{ name: "test", phase: "check", layer: "test", run: "bun run test" }],
    lastRun,
  },
};
const value = {
  formatVersion: 1,
  generatedAt: "2026-11-04T09:00:00Z",
  commit: "1".repeat(40),
  entries: [
    { id: "tools", kind: "fragment", addedAt: "2026-10-27T09:00:00+00:00" },
    { id: "new-stack", kind: "stack", addedAt: "2026-10-28T10:00:00-05:00" },
  ],
  removed: [removed],
};

test("directory payload is exported from its module and package boundary [4.2c#1] [4.2c#2]", async () => {
  const { DirectoryData } = await import("../src/directory");
  const publicApi = await import("../src/index");
  expect(publicApi.DirectoryData).toBe(DirectoryData);
  expect(Schema.decodeUnknownSync(DirectoryData)(value)).toEqual(value);
  expect(Schema.encodeSync(DirectoryData)(Schema.decodeUnknownSync(DirectoryData)(value))).toEqual(
    value,
  );
});

test("replacement, proof and layer are optional; projected serve steps need no probe [4.2c#2]", async () => {
  const { DirectoryData } = await import("../src/directory");
  const { replacedBy: _replacement, ...withoutReplacement } = removed;
  const { lastRun: _proof, ...last } = removed.last;
  const input = {
    ...value,
    entries: [],
    removed: [
      {
        ...withoutReplacement,
        kind: "fragment",
        last: {
          ...last,
          steps: [
            { name: "check", phase: "check", run: "true" },
            { name: "preview", phase: "serve", run: "bun run dev" },
          ],
        },
      },
    ],
  };
  expect(Schema.decodeUnknownSync(DirectoryData)(input)).toEqual(input);
});

test.each([
  { label: "newer version", input: { ...value, formatVersion: 2 } },
  {
    label: "unsafe current id",
    input: { ...value, entries: [{ ...value.entries[0], id: "../x" }] },
  },
  {
    label: "unknown current kind",
    input: { ...value, entries: [{ ...value.entries[0], kind: "app" }] },
  },
  { label: "missing added date", input: { ...value, entries: [{ id: "x", kind: "stack" }] } },
  { label: "unsafe removed id", input: { ...value, removed: [{ ...removed, id: "../x" }] } },
  { label: "unknown removed kind", input: { ...value, removed: [{ ...removed, kind: "app" }] } },
  {
    label: "unsafe replacement",
    input: { ...value, removed: [{ ...removed, replacedBy: "../x" }] },
  },
  {
    label: "missing last content",
    input: {
      ...value,
      removed: [{ id: "x", kind: "stack", removedAt: "2026-11-03", reason: "Retired" }],
    },
  },
  {
    label: "invalid step phase",
    input: {
      ...value,
      removed: [
        {
          ...removed,
          last: { ...removed.last, steps: [{ name: "test", phase: "unknown", run: "true" }] },
        },
      ],
    },
  },
  {
    label: "failed historical proof",
    input: {
      ...value,
      removed: [{ ...removed, last: { ...removed.last, lastRun: { ...lastRun, result: "fail" } } }],
    },
  },
])("directory rejects $label [4.2c#1] [4.2c#2]", async ({ input }) => {
  const { DirectoryData } = await import("../src/directory");
  expect(() => Schema.decodeUnknownSync(DirectoryData)(input)).toThrow();
});
