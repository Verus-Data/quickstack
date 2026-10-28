import { readFileSync } from "node:fs";
import { Schema } from "effect";
import { expect, test } from "vitest";
import {
  DependencySummary,
  MajorShare,
  StackDependency,
  StackStatsDetail,
  StatsDep,
  StatsDeps,
  StatsDetail,
} from "../src/index.js";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/stats/${name}.json`, import.meta.url), "utf8"),
  );
}

function expectColumns(value: unknown, rows: number): void {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  for (const column of Object.values(value ?? {})) {
    expect(Array.isArray(column)).toBe(true);
    expect(column).toHaveLength(rows);
  }
}

const summaryFixture = fixture("deps-summary");
const detailFixture = fixture("dep-detail");
const stackFixture = fixture("stack-detail");

test("dependency routes decode their fixtures and round-trip every row through columns", () => {
  const summary = Schema.decodeUnknownSync(StatsDeps)(summaryFixture);
  const detail = Schema.decodeUnknownSync(StatsDep)(detailFixture);
  if (!summary.published || !detail.published) throw new Error("fixtures must be published");
  expect(summary.ecosystem).toBe("npm");
  expect(summary.window).toBe(28);
  expect(summary.items.map((item) => item.name)).toEqual(["react", "typescript", "vite"]);
  expect(summary.items[2]?.projects.suppressed).toBe(true);
  expect(detail.majors[2]?.share.suppressed).toBe(true);
  expect(detail.drops.suppressed).toBe(true);
  expect(detail.transitions[0]).toMatchObject({ from: "18", to: "19" });
  expect(detail.byStack[1]?.withWithout.with.suppressed).toBe(true);

  const encodedSummary = Schema.encodeSync(StatsDeps)(summary);
  const encodedDetail = Schema.encodeSync(StatsDep)(detail);
  if (!encodedDetail.published) throw new Error("encoded fixture must be published");
  expect(Schema.decodeUnknownSync(StatsDeps)(encodedSummary)).toEqual(summary);
  expect(Schema.decodeUnknownSync(StatsDep)(encodedDetail)).toEqual(detail);
  expect(encodedSummary).toEqual(summaryFixture);
  expect(encodedDetail).toEqual(detailFixture);
  expectColumns(encodedSummary.items, 3);
  expectColumns(encodedSummary.transitions, 2);
  expectColumns(encodedDetail.majors, 3);
  expectColumns(encodedDetail.series, 3);
  expectColumns(encodedDetail.transitions, 1);
  expectColumns(encodedDetail.oftenUsedWith, 2);
  expectColumns(encodedDetail.byStack, 2);
  expect(encodedDetail.series.majors?.[0]).toEqual(detail.series[0]?.majors);
  expect(encodedDetail.byStack.majors?.[0]).toEqual(detail.byStack[0]?.majors);
});

test("a stack detail decodes with or without dependency rows", () => {
  const oldStack = Schema.decodeUnknownSync(StackStatsDetail)(stackFixture);
  expect(oldStack.deps).toBeUndefined();
  expect(Schema.decodeUnknownSync(StatsDetail)(stackFixture)).toEqual(oldStack);

  const dependency = {
    ecosystem: "npm",
    name: "react",
    projects: { value: 75, suppressed: false },
    share: { value: 0.6, suppressed: false },
    majors: [{ major: "19", share: { value: 0.65, suppressed: false } }],
    withWithout: {
      with: { value: 0.8, lower: 0.72, upper: 0.87, sample: 60, suppressed: false },
      without: { value: 0.8, lower: 0.72, upper: 0.87, sample: 60, suppressed: false },
    },
  };
  expect(Schema.decodeUnknownSync(StackDependency)(dependency)).toEqual(dependency);
  const encoded = Schema.encodeUnknownSync(StackStatsDetail)({ ...oldStack, deps: [dependency] });
  expectColumns(encoded.deps, 1);
  const decoded = Schema.decodeUnknownSync(StackStatsDetail)(encoded);
  expect(decoded.deps).toEqual([dependency]);
  expect(Schema.decodeUnknownSync(StatsDetail)(encoded)).toEqual(decoded);
});

test("dependency columns enforce rate bounds, paired suppression and ecosystems", () => {
  const detail = Schema.encodeSync(StatsDep)(Schema.decodeUnknownSync(StatsDep)(detailFixture));
  expect(() =>
    Schema.decodeUnknownSync(StatsDep)({
      ...detail,
      byStack: { ...detail.byStack, "withWithout.with.lower": [0.9, null] },
    }),
  ).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(StatsDep)({
      ...detail,
      byStack: { ...detail.byStack, "withWithout.with.suppressed": [false, false] },
    }),
  ).toThrow();
  expect(() => Schema.decodeUnknownSync(StatsDep)({ ...detail, ecosystem: "unknown" })).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(StatsDep)({
      ...detail,
      oftenUsedWith: { ...detail.oftenUsedWith, ecosystem: ["npm", "unknown"] },
    }),
  ).toThrow();
});

test("lift must be finite and above one", () => {
  const detail = Schema.encodeSync(StatsDep)(Schema.decodeUnknownSync(StatsDep)(detailFixture));
  for (const lift of [1, 0.8, Number.POSITIVE_INFINITY]) {
    expect(() =>
      Schema.decodeUnknownSync(StatsDep)({
        ...detail,
        oftenUsedWith: { ...detail.oftenUsedWith, lift: [lift, 1.25] },
      }),
    ).toThrow();
  }
});

test("dependency responses use 28-day windows, not the series stride", () => {
  const detail = Schema.encodeSync(StatsDep)(Schema.decodeUnknownSync(StatsDep)(detailFixture));
  const summary = Schema.encodeSync(StatsDeps)(Schema.decodeUnknownSync(StatsDeps)(summaryFixture));
  expect(() => Schema.decodeUnknownSync(StatsDep)({ ...detail, window: 7 })).toThrow();
  expect(() => Schema.decodeUnknownSync(StatsDeps)({ ...summary, window: 7 })).toThrow();
});

test("an unpublished dependency response has no metric fields", () => {
  const summary = {
    generatedAt: "2026-10-28T02:00:00Z",
    through: "2026-10-25",
    population: "stacks projects",
    window: 28,
    ecosystem: "npm",
    published: false,
  };
  const detail = {
    ...summary,
    name: "react",
    interval: 7,
    from: "2026-10-11",
    to: "2026-10-25",
  };
  expect(Schema.decodeUnknownSync(StatsDeps)(summary)).toEqual(summary);
  expect(Schema.decodeUnknownSync(StatsDep)(detail)).toEqual(detail);
  expect(() =>
    Schema.encodeUnknownSync(StatsDeps)({ ...summary, projects: { value: 5, suppressed: false } }),
  ).toThrow();
  expect(() =>
    Schema.encodeUnknownSync(StatsDep)({ ...detail, projects: { value: 5, suppressed: false } }),
  ).toThrow();
});

test("exported major share and summary rows preserve published and suppressed cells", () => {
  const summary = Schema.decodeUnknownSync(StatsDeps)(summaryFixture);
  const detail = Schema.decodeUnknownSync(StatsDep)(detailFixture);
  if (!summary.published || !detail.published) throw new Error("fixtures must be published");
  for (const row of summary.items) {
    expect(Schema.decodeUnknownSync(DependencySummary)(row)).toEqual(row);
  }
  for (const row of detail.majors) {
    expect(Schema.decodeUnknownSync(MajorShare)(row)).toEqual(row);
  }
});
