import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  fixtureRecord,
  hit,
  loadRank,
  options,
  searched,
  vocabulary,
} from "./helpers/search-command";
import { cardPath, put } from "./helpers/search-metadata";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());

test("all recognized aliases contribute coverage and retain their original request words", async () => {
  const record = await fixtureRecord(space.dir(), "neutral", {
    search: { summary: "", requests: [], useCases: [], synonyms: [], goodFor: [] },
  });
  const rank = await loadRank();
  const input = { entries: [record], vocabulary: vocabulary() };
  const single = rank({ ...input, request: "iOS" });
  const repeated = rank({ ...input, request: "iOS (iPhone)" });
  expect(repeated.understood.platforms).toEqual(["ios"]);
  expect(repeated.understood.unmatched).toEqual([]);
  expect(repeated.stacks[0]?.coverage).toBe(1);
  expect(repeated.stacks[0]?.score).toBe(single.stacks[0]?.score);
  const reason = repeated.stacks[0]?.why.find((reason) => reason.field === "platforms");
  expect(reason?.from).toContain("iOS");
  expect(reason?.from).toContain("iPhone");
});

test("a valid card retains description-only search terms", async () => {
  const record = await fixtureRecord(space.dir(), "neutral", {
    search: { summary: "", requests: [], useCases: [], synonyms: [], goodFor: [] },
  });
  const rank = await loadRank();
  const entry = { ...record.entry, meta: { ...record.entry.meta, description: "Zephyr." } };
  const result = rank({
    request: "zephyr",
    entries: [{ ...record, entry }],
    vocabulary: vocabulary(),
  });
  expect(result.understood.unmatched).toEqual([]);
  expect(result.stacks[0]?.score).toBeGreaterThan(0);
  expect(result.stacks[0]?.why).toContainEqual({
    field: "description",
    matched: "zephyr",
    from: "zephyr",
  });
});

test.each(["id", "kind"] as const)(
  "a card with the wrong %s falls back to entry fields",
  async (field) => {
    const home = space.dir();
    const registry = join(home, "registry");
    const record = await fixtureRecord(registry, "neutral");
    if (!record.search) throw new Error("Missing card fixture");
    const fragment = await fixtureRecord(registry, "neutral", { kind: "fragment" });
    const card = field === "id" ? { ...record.search, id: "other" } : fragment.search;
    put(cardPath(registry, { id: "neutral", kind: "stack" }), JSON.stringify(card));
    const result = await searched("neutral iOS journal", options(home, registry));
    const neutral = hit(result.value.stacks, "neutral");
    expect(neutral.summary).toBe(record.entry.meta.description);
    expect(neutral.why.some((reason) => reason.field === "platforms")).toBe(false);
  },
);
