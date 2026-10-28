import { rank, SearchMetadata, SearchVocabulary } from "@steamfield/stacks-format";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { searchInput } from "./helpers/search-input";

function input() {
  const raw = searchInput();
  return {
    ...raw,
    vocabulary: Schema.decodeUnknownSync(SearchVocabulary)(raw.vocabulary),
    entries: raw.entries.map((record) => ({
      ...record,
      search: Schema.decodeUnknownSync(SearchMetadata)(record.search),
    })),
  };
}

test("postgres explanations use the request's words in each matched field", () => {
  const raw = input();
  const result = rank({
    ...raw,
    request: "postgres auth for a saas",
    entries: raw.entries.map((record) => ({
      ...record,
      entry: {
        ...record.entry,
        meta: { ...record.entry.meta, description: "A Postgres database." },
        body: "Postgres auth",
      },
    })),
  });
  for (const hit of result.stacks) {
    expect(hit.why).toContainEqual({ field: "description", matched: "postgres", from: "postgres" });
    expect(hit.why).toContainEqual({
      field: "body",
      matched: "postgres auth",
      from: "postgres auth",
    });
  }
});

test("inflected matches keep the first request spelling and case word by word", () => {
  const raw = input();
  const result = rank({
    ...raw,
    request: "Running TESTS, tests test",
    entries: raw.entries.map((record) => ({
      ...record,
      entry: {
        ...record.entry,
        meta: { ...record.entry.meta, description: "running test" },
      },
    })),
  });
  for (const hit of result.stacks)
    expect(hit.why).toContainEqual({
      field: "description",
      matched: "Running TESTS",
      from: "Running TESTS",
    });
  expect(result.understood.unmatched).toEqual([]);
});

test("vocabulary synonyms keep their canonical term and original request phrase", () => {
  const result = rank({ ...input(), request: "Golang with a command LINE" });
  expect(result.stacks[0]?.why).toEqual(
    expect.arrayContaining([
      { field: "languages", matched: "go", from: "Golang" },
      { field: "platforms", matched: "cli", from: "command LINE" },
    ]),
  );
});

test("unmatched words keep their first surface form even when bodies match them", () => {
  const raw = input();
  const result = rank({
    ...raw,
    request: "a Widgets, widget widgets with Cafés café",
    entries: raw.entries.map((record) => ({
      ...record,
      entry: { ...record.entry, body: "widget café" },
    })),
  });
  expect(result.understood.unmatched).toEqual(["Widgets", "Cafés"]);
  for (const hit of result.stacks)
    expect(hit.why).toContainEqual({
      field: "body",
      matched: "Widgets Cafés",
      from: "Widgets Cafés",
    });
});

test.each([
  { request: "İstanbul", surfaces: ["İstanbul"] },
  { request: "ΟΣ.Α", surfaces: ["ΟΣ", "Α"] },
])("Unicode normalization preserves surface words for $request", ({ request, surfaces }) => {
  const raw = input();
  for (const metadataMatch of [true, false]) {
    const result = rank({
      ...raw,
      request,
      entries: raw.entries.map((record) => ({
        ...record,
        entry: {
          ...record.entry,
          meta: { ...record.entry.meta, description: metadataMatch ? request : "unrelated" },
          body: request,
        },
      })),
    });
    expect(result.understood.unmatched).toEqual(metadataMatch ? [] : surfaces);
    for (const hit of result.stacks)
      expect(hit.why).toContainEqual({
        field: "body",
        matched: surfaces.join(" "),
        from: surfaces.join(" "),
      });
  }
});
