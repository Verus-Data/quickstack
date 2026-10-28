import {
  rank,
  SearchHit,
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
    })),
    fragments: [],
  };
  expect(Schema.decodeUnknownSync(SearchResponse)(body)).toEqual(body);
  expect(() => Schema.decodeUnknownSync(SearchResponse)({ ...body, stacks: "invalid" })).toThrow();
  expect(() => Schema.decodeUnknownSync(SearchResponse)({ ...body, method: "unknown" })).toThrow();
});
