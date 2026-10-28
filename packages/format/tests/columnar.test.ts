import { readFileSync } from "node:fs";
import { it } from "@effect/vitest";
import { Arbitrary, Schema } from "effect";
import { expect, test } from "vitest";
import {
  Columnar,
  CompositionStats,
  FragmentStackStats,
  SeriesPoint,
  StatsSummaryItem,
} from "../src/index.js";
import { SearchEvidence } from "../src/search/schema.js";

const summaryColumns = Columnar(StatsSummaryItem);
const seriesColumns = Columnar(SeriesPoint);
const fragmentColumns = Columnar(FragmentStackStats);
const compositionColumns = Columnar(CompositionStats);
const summaryFixture: unknown = JSON.parse(
  readFileSync(new URL("./fixtures/stats/summary.json", import.meta.url), "utf8"),
);
const stackFixture: unknown = JSON.parse(
  readFileSync(new URL("./fixtures/stats/stack-detail.json", import.meta.url), "utf8"),
);
const fragmentFixture: unknown = JSON.parse(
  readFileSync(new URL("./fixtures/stats/fragment-detail.json", import.meta.url), "utf8"),
);
const summaryRows = Schema.decodeUnknownSync(
  Schema.Struct({ items: Schema.Array(StatsSummaryItem) }),
)(summaryFixture).items;
const stackRows = Schema.decodeUnknownSync(
  Schema.Struct({
    series: Schema.Array(SeriesPoint),
    byComposition: Schema.Array(CompositionStats),
  }),
)(stackFixture);
const fragmentRows = Schema.decodeUnknownSync(
  Schema.Struct({ byStack: Schema.Array(FragmentStackStats) }),
)(fragmentFixture).byStack;
const firstSummary = summaryRows[0];
if (firstSummary === undefined) throw new Error("summary fixture needs an item");
const { trending: _trending, ...withoutTrending } = firstSummary;

function rowLists<A>(samples: ReadonlyArray<A>): Arbitrary.Arbitrary<Array<A>> {
  if (samples.length === 0) throw new Error("fixture needs sample rows");
  const index = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: samples.length - 1 }));
  const extras = Arbitrary.array(
    Arbitrary.map(Arbitrary.schema(index), (value) => {
      const sample = samples[value];
      if (sample === undefined) throw new Error("sample index out of range");
      return sample;
    }),
    { maxLength: 8 },
  );
  return Arbitrary.map(extras, (rows) => [...samples, ...rows]);
}

const names = [
  "id",
  "kind",
  "lastRun.date",
  "lastRun.result",
  "lastRun.agent",
  "lastRun.preset",
  "lastRun.minutesToGreen",
  "lastRun.fingerprint",
  "projects.value",
  "projects.suppressed",
  "greenRate.value",
  "greenRate.lower",
  "greenRate.upper",
  "greenRate.sample",
  "greenRate.suppressed",
  "noVerifyShare.value",
  "noVerifyShare.suppressed",
  "medianMinutesToGreen.value",
  "medianMinutesToGreen.suppressed",
  "previous.projects.value",
  "previous.projects.suppressed",
  "previous.greenRate.value",
  "previous.greenRate.lower",
  "previous.greenRate.upper",
  "previous.greenRate.sample",
  "previous.greenRate.suppressed",
  "trending.value",
  "trending.score",
  "trending.suppressed",
  "trending.last7.value",
  "trending.last7.suppressed",
  "trending.prior28.value",
  "trending.prior28.suppressed",
];

test("summary column names are the flattened leaf paths in schema order", () => {
  expect(Object.keys(Schema.encodeSync(summaryColumns)([]))).toEqual(names);
});

test.each([
  ["summary", summaryColumns],
  ["series", seriesColumns],
  ["fragment", fragmentColumns],
  ["composition", compositionColumns],
])("%s empty list has every column and decodes to no rows", (_label, schema) => {
  const encoded = Schema.encodeSync(schema)([]);
  expect(Object.values(encoded).every((column) => column.length === 0)).toBe(true);
  expect(Schema.decodeUnknownSync(schema)(encoded)).toEqual([]);
});

it.prop(
  "stats rows round-trip through columns",
  [
    rowLists([...summaryRows, withoutTrending]),
    rowLists(stackRows.series),
    rowLists(fragmentRows),
    rowLists(stackRows.byComposition),
  ],
  ([summary, series, fragment, composition]) => {
    expect(
      Schema.decodeUnknownSync(summaryColumns)(Schema.encodeSync(summaryColumns)(summary)),
    ).toEqual(summary);
    expect(
      Schema.decodeUnknownSync(seriesColumns)(Schema.encodeSync(seriesColumns)(series)),
    ).toEqual(series);
    expect(
      Schema.decodeUnknownSync(fragmentColumns)(Schema.encodeSync(fragmentColumns)(fragment)),
    ).toEqual(fragment);
    expect(
      Schema.decodeUnknownSync(compositionColumns)(
        Schema.encodeSync(compositionColumns)(composition),
      ),
    ).toEqual(composition);
  },
  { arbitrary: { seed: "columnar-q1a", runs: 50, size: 12 } },
);

test("real stats summary items round-trip and expose their wire size", () => {
  const encoded = Schema.encodeSync(summaryColumns)(summaryRows);
  expect(Schema.decodeUnknownSync(summaryColumns)(encoded)).toEqual(summaryRows);
  expect(Buffer.byteLength(JSON.stringify(encoded))).toBeGreaterThan(0);
});

test("invalid columns and invalid rebuilt rows fail with SchemaError", () => {
  const encoded = Schema.encodeSync(summaryColumns)([
    Schema.decodeUnknownSync(StatsSummaryItem)({
      id: "go-cli",
      kind: "stack",
      projects: { value: 10, suppressed: false },
      greenRate: { value: 0.8, lower: 0.7, upper: 0.9, sample: 20, suppressed: false },
      noVerifyShare: { value: 0.1, suppressed: false },
      medianMinutesToGreen: { value: 5, suppressed: false },
      previous: {
        projects: { value: 10, suppressed: false },
        greenRate: { value: 0.8, lower: 0.7, upper: 0.9, sample: 20, suppressed: false },
      },
    }),
  ]);
  const failures = [
    { ...encoded, id: [...(encoded.id ?? []), "other"] },
    { ...encoded, unexpected: [1] },
    Object.fromEntries(Object.entries(encoded).filter(([name]) => name !== "id")),
    { ...encoded, "greenRate.lower": [0.9] },
  ];
  for (const value of failures) {
    expect(() => Schema.decodeUnknownSync(summaryColumns)(value)).toThrow(Schema.SchemaError);
  }
});

test("an optional nullable key is refused at construction", () => {
  expect(() => Columnar(SearchEvidence)).toThrow(/optional nullable key: lastRun/);
});

test("a required nullable nested struct keeps null distinct from an object", () => {
  const row = Schema.Struct({
    id: Schema.String,
    details: Schema.NullOr(Schema.Struct({ value: Schema.Number })),
  });
  const schema = Columnar(row);
  const rows = [
    { id: "one", details: null },
    { id: "two", details: { value: 3 } },
  ];
  const encoded = Schema.encodeSync(schema)(rows);
  expect(encoded).toEqual({ id: ["one", "two"], "details.value": [null, 3] });
  expect(Schema.decodeUnknownSync(schema)(encoded)).toEqual(rows);
});

test("union members contribute distinct nested columns", () => {
  const row = Schema.Union([
    Schema.Struct({ kind: Schema.Literal("a"), cell: Schema.Struct({ left: Schema.Number }) }),
    Schema.Struct({ kind: Schema.Literal("b"), cell: Schema.Struct({ right: Schema.String }) }),
  ]);
  const schema = Columnar(row);
  const rows = [
    { kind: "a", cell: { left: 1 } },
    { kind: "b", cell: { right: "yes" } },
  ];
  const encoded = Schema.encodeUnknownSync(schema)(rows);
  expect(encoded).toEqual({
    kind: ["a", "b"],
    "cell.left": [1, null],
    "cell.right": [null, "yes"],
  });
  expect(Schema.decodeUnknownSync(schema)(encoded)).toEqual(rows);
});

test("arrays and records remain single columns", () => {
  const row = Schema.Struct({
    id: Schema.String,
    changes: Schema.Array(Schema.Struct({ value: Schema.Number })),
    shares: Schema.Record(Schema.String, Schema.Number),
  });
  const schema = Columnar(row);
  const rows = [{ id: "one", changes: [{ value: 2 }], shares: { x: 0.5 } }];
  const encoded = Schema.encodeSync(schema)(rows);
  expect(encoded).toEqual({
    id: ["one"],
    changes: [[{ value: 2 }]],
    shares: [{ x: 0.5 }],
  });
  expect(Schema.decodeUnknownSync(schema)(encoded)).toEqual(rows);
});

test("an optional all-null nested value is refused because absence would look identical", () => {
  const row = Schema.Struct({
    cell: Schema.optionalKey(Schema.Struct({ value: Schema.Null })),
  });
  expect(() => Columnar(row)).toThrow(/absent and all-null/);
});

test("literal dots in a field name encode through that field", () => {
  const row = Schema.Struct({ "a.b": Schema.Number });
  const schema = Columnar(row);
  const encoded = Schema.encodeSync(schema)([{ "a.b": 3 }]);
  expect(encoded).toEqual({ "a.b": [3] });
  expect(Schema.decodeUnknownSync(schema)(encoded)).toEqual([{ "a.b": 3 }]);
});

test("a row field transformation round-trips through its encoded column values", () => {
  const row = Schema.Struct({ count: Schema.NumberFromString });
  const schema = Columnar(row);
  const encoded = Schema.encodeSync(schema)([{ count: 42 }]);
  expect(encoded).toEqual({ count: ["42"] });
  expect(Schema.decodeUnknownSync(schema)(encoded)).toEqual([{ count: 42 }]);
});
