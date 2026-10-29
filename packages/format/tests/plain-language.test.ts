import { Schema } from "effect";
import { expect, test } from "vitest";
import { rank, SearchHit, SearchMetadata, SearchResponse, SearchVocabulary } from "../src/index.js";
import { searchInput } from "./helpers/search-input";

const plain = {
  whatItIs: "A small starting point for local tools.",
  goodAt: ["Automating repeated local work"],
  notGoodAt: ["Hosting a public website"],
};
const source = {
  digest: `sha256:${"a".repeat(64)}`,
  by: "author",
  reviewedAt: "2026-10-28",
};
const common = {
  schemaVersion: 1,
  id: "sample",
  source,
  summary: "Local tools.",
  requests: ["automate local work"],
  useCases: [],
  synonyms: [],
  goodFor: [],
  notFor: [],
};
const stack = {
  ...common,
  kind: "stack",
  platforms: ["cli"],
  productKinds: ["cli-tool"],
  languages: ["typescript"],
};
const fragment = { ...common, kind: "fragment", capabilities: [] };

test("plain decodes for both kinds and old cards remain valid [4.5f#1]", () => {
  for (const original of [stack, fragment]) {
    const old = Schema.decodeUnknownSync(SearchMetadata)(original);
    expect(old).not.toHaveProperty("plain");
    const current = Schema.decodeUnknownSync(SearchMetadata)({ ...original, plain });
    expect(current.plain).toEqual(plain);
    expect(
      Schema.decodeUnknownSync(SearchMetadata)(Schema.encodeSync(SearchMetadata)(current)),
    ).toEqual(current);
  }
});

test("search response columns and hit fields stay stable [4.5f#5]", () => {
  expect(Object.keys(SearchHit.fields)).toEqual([
    "kind",
    "id",
    "name",
    "summary",
    "origin",
    "trusted",
    "tier",
    "score",
    "coverage",
    "why",
    "penalties",
    "caveats",
    "appliesTo",
    "evidence",
  ]);
  const input = searchInput();
  const result = rank({
    ...input,
    vocabulary: Schema.decodeUnknownSync(SearchVocabulary)(input.vocabulary),
    entries: input.entries.map((record) => ({
      ...record,
      search: Schema.decodeUnknownSync(SearchMetadata)(record.search),
    })),
  });
  const body = {
    method: "lexical",
    indexGeneratedAt: "2026-10-28T10:00:00Z",
    understood: result.understood,
    noStrongMatch: result.noStrongMatch,
    stacks: result.stacks.map((hit) => ({
      ...hit,
      origin: "index",
      trusted: true,
      evidence: { ...hit.evidence, lastRun: null },
    })),
    fragments: [],
  };
  const encoded = Schema.encodeUnknownSync(SearchResponse)(body);
  expect(Object.keys(encoded)).toEqual([
    "method",
    "indexGeneratedAt",
    "understood",
    "noStrongMatch",
    "stacks",
    "fragments",
  ]);
  expect(Object.keys(encoded.stacks).sort()).toEqual(
    [
      "appliesTo",
      "caveats",
      "coverage",
      "evidence.lastRun.agent",
      "evidence.lastRun.date",
      "evidence.lastRun.fingerprint",
      "evidence.lastRun.preset",
      "evidence.lastRun.result",
      "evidence.stats.greenRateLower",
      "evidence.stats.projects",
      "evidence.stats.sample",
      "evidence.stats.window",
      "id",
      "kind",
      "name",
      "origin",
      "penalties",
      "score",
      "summary",
      "tier",
      "trusted",
      "why",
    ].sort(),
  );
  expect(Schema.decodeUnknownSync(SearchResponse)(encoded)).toEqual(body);
});

test("dependency card files and published cards decode with closed fields [4.5f#6]", async () => {
  const { DependencyCard, DependencyCardFile, DependencyCards } = await import("../src/index.js");
  const card = {
    whatItIs: "A small web framework.",
    goodAt: ["HTTP handlers"],
    notGoodAt: ["Browser layout"],
    example: "A JSON API",
    homepage: "https://hono.dev",
    source: { by: "author", reviewedAt: "2026-10-28" },
  };
  expect(Schema.decodeUnknownSync(DependencyCard)(card)).toEqual(card);
  expect(
    Schema.decodeUnknownSync(DependencyCardFile)({ formatVersion: 1, cards: { hono: card } }).cards
      .hono,
  ).toEqual(card);
  for (const bad of [
    { ...card, whatItIs: undefined },
    { ...card, homepage: "http://hono.dev" },
    { ...card, excess: true },
    { ...card, source: { ...card.source, excess: true } },
    { ...card, source: { ...card.source, reviewedAt: "yesterday" } },
    { ...card, goodAt: [] },
    { ...card, notGoodAt: ["a", "b", "c", "d"] },
  ])
    expect(() =>
      Schema.decodeUnknownSync(DependencyCard)(bad, { onExcessProperty: "error" }),
    ).toThrow();
  const published = {
    formatVersion: 1,
    generatedAt: "2026-10-28T00:00:00Z",
    cards: { npm: { hono: card }, pypi: {}, go: {}, crates: {} },
  };
  expect(Schema.decodeUnknownSync(DependencyCards)(published)).toEqual(published);
  expect(
    Schema.decodeUnknownSync(DependencyCards)(Schema.encodeUnknownSync(DependencyCards)(published)),
  ).toEqual(published);
});
