import {
  rank,
  SearchHit,
  SearchIndex,
  SearchMetadata,
  SearchResponse,
  SearchResult,
  SearchVocabulary,
} from "@steamfield/stacks-format";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { searchInput } from "./helpers/search-input";

test("the public search schemas and pure ranker retain lexical language and TUI behaviour [4.5e#13]", () => {
  const raw = searchInput();
  const input = {
    ...raw,
    vocabulary: Schema.decodeUnknownSync(SearchVocabulary)(raw.vocabulary),
    entries: raw.entries.map((record) => ({
      ...record,
      search: Schema.decodeUnknownSync(SearchMetadata)(record.search),
    })),
  };
  const before = JSON.stringify(input);
  const go = rank(input);
  expect(Schema.decodeUnknownSync(SearchResult)(go)).toEqual(go);
  expect(go).toMatchObject({
    ranking: "local",
    understood: { languages: ["go"], platforms: ["cli"] },
    noStrongMatch: false,
  });
  expect(go.stacks[0]).toMatchObject({ id: "go-cli", tier: "strong" });
  expect(go.stacks[1]).toMatchObject({ id: "typescript-cli", penalties: ["language"] });
  for (const row of go.stacks) expect(Schema.decodeUnknownSync(SearchHit)(row)).toEqual(row);
  const tui = rank({ ...input, request: "a cli with a good TUI experience" });
  expect(tui.noStrongMatch).toBe(true);
  expect(tui.understood.unmatched).toContain("tui");
  expect(tui.stacks).toHaveLength(2);
  for (const row of tui.stacks) {
    expect(row.tier).not.toBe("strong");
    expect(row.penalties).toContain("notFor");
  }
  expect(JSON.stringify(input)).toBe(before);
  expect(rank(input)).toEqual(go);
});

test("the public signed search schema roundtrips vocabulary and rejects its absence [4.5e#13]", () => {
  const raw = searchInput();
  const document = {
    formatVersion: 1,
    entries: raw.entries.map((record) => record.search),
    vocabulary: raw.vocabulary,
  };
  const decoded = Schema.decodeUnknownSync(SearchIndex)(document);
  expect(Schema.decodeUnknownSync(SearchIndex)(Schema.encodeSync(SearchIndex)(decoded))).toEqual(
    decoded,
  );
  const { vocabulary: _vocabulary, ...withoutVocabulary } = document;
  expect(() => Schema.decodeUnknownSync(SearchIndex)(withoutVocabulary)).toThrow();
});

test("the shared HTTP schema accepts the route response without request text [4.5e#13]", () => {
  const raw = searchInput();
  const ranked = rank({
    ...raw,
    vocabulary: Schema.decodeUnknownSync(SearchVocabulary)(raw.vocabulary),
    entries: raw.entries.map((record) => ({
      ...record,
      search: Schema.decodeUnknownSync(SearchMetadata)(record.search),
    })),
  });
  const body = {
    method: "lexical",
    indexGeneratedAt: "2026-10-28T10:00:00Z",
    understood: ranked.understood,
    noStrongMatch: ranked.noStrongMatch,
    stacks: ranked.stacks.map((hit: typeof SearchHit.Type) => ({
      ...hit,
      origin: "index",
      trusted: true,
      evidence: { ...hit.evidence, lastRun: null },
    })),
    fragments: [],
  };
  const wire = Schema.encodeUnknownSync(SearchResponse)(body);
  expect(Schema.decodeUnknownSync(SearchResponse)(wire)).toEqual(body);
  expect(() => Schema.decodeUnknownSync(SearchResponse)({ ...wire, stacks: "invalid" })).toThrow();
  expect(() => Schema.decodeUnknownSync(SearchResponse)({ ...wire, method: "unknown" })).toThrow();
});

const columns = [
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
  "evidence.stats.greenRateLower",
  "evidence.stats.sample",
  "evidence.stats.projects",
  "evidence.stats.window",
  "evidence.lastRun.date",
  "evidence.lastRun.result",
  "evidence.lastRun.agent",
  "evidence.lastRun.preset",
  "evidence.lastRun.fingerprint",
];

test("API hits encode to complete flattened columns and decode to rows", () => {
  const hit = {
    kind: "stack",
    id: "go-cli",
    name: "Go CLI",
    summary: "A CLI stack",
    origin: "index",
    trusted: true,
    tier: "strong",
    score: 0.84,
    coverage: 1,
    why: [{ field: "platforms", matched: "cli", from: "cli" }],
    penalties: ["language"],
    evidence: { lastRun: null },
  };
  const run = {
    date: "2026-10-28",
    result: "pass",
    agent: "codex",
    preset: "default",
    fingerprint: "sha256:sample",
  };
  const body = {
    method: "lexical",
    indexGeneratedAt: "2026-10-28T10:00:00Z",
    understood: {
      platforms: ["cli"],
      productKinds: [],
      languages: [],
      capabilities: [],
      unmatched: [],
    },
    noStrongMatch: false,
    stacks: [
      hit,
      {
        ...hit,
        id: "typescript-cli",
        evidence: {
          stats: { greenRateLower: 0.8, sample: 10, projects: 8, window: 28 },
          lastRun: run,
        },
      },
    ],
    fragments: [{ ...hit, kind: "fragment", id: "lint" }],
  };
  const wire = Schema.encodeUnknownSync(SearchResponse)(body);
  expect(Object.keys(wire.stacks)).toEqual(columns);
  expect(Object.keys(wire.fragments)).toEqual(columns);
  expect(Object.values(wire.stacks).every((column) => column.length === 2)).toBe(true);
  expect(Object.values(wire.fragments).every((column) => column.length === 1)).toBe(true);
  expect(wire.stacks.id).toEqual(["go-cli", "typescript-cli"]);
  expect(wire.stacks.score).toEqual([0.84, 0.84]);
  expect(wire.stacks.why).toEqual([hit.why, hit.why]);
  expect(wire.stacks.penalties).toEqual([hit.penalties, hit.penalties]);
  expect(wire.stacks["evidence.lastRun.date"]).toEqual([null, run.date]);
  expect(wire.stacks["evidence.stats.sample"]).toEqual([null, 10]);
  expect(Schema.decodeUnknownSync(SearchResponse)(wire)).toEqual(body);
});

test("empty API hit lists encode every column and decode to empty rows", () => {
  const body = {
    method: "lexical",
    indexGeneratedAt: "2026-10-28T10:00:00Z",
    understood: { platforms: [], productKinds: [], languages: [], capabilities: [], unmatched: [] },
    noStrongMatch: true,
    stacks: [],
    fragments: [],
  };
  const wire = Schema.encodeUnknownSync(SearchResponse)(body);
  for (const list of [wire.stacks, wire.fragments]) {
    expect(Object.keys(list)).toEqual(columns);
    expect(Object.values(list).every((column) => column.length === 0)).toBe(true);
  }
  expect(Schema.decodeUnknownSync(SearchResponse)(wire)).toEqual(body);
});

test("API hit rows require evidence.lastRun even when no run exists", () => {
  const body = {
    method: "lexical",
    indexGeneratedAt: "2026-10-28T10:00:00Z",
    understood: { platforms: [], productKinds: [], languages: [], capabilities: [], unmatched: [] },
    noStrongMatch: false,
    stacks: [
      {
        kind: "stack",
        id: "go-cli",
        name: "Go CLI",
        summary: "A CLI stack",
        origin: "index",
        trusted: true,
        tier: "strong",
        score: 0.84,
        coverage: 1,
        why: [],
        penalties: [],
        evidence: {},
      },
    ],
    fragments: [],
  };
  expect(() => Schema.encodeUnknownSync(SearchResponse)(body)).toThrow();
});
