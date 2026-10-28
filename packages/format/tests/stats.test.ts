import { readFileSync } from "node:fs";
import { Schema } from "effect";
import { expect, test } from "vitest";
import {
  CountCell,
  FragmentStackStats,
  FragmentStatsDetail,
  RateCell,
  SeriesPoint,
  ShareCell,
  StackStatsDetail,
  StatsDay,
  StatsDetail,
  StatsSummary,
  Trending,
  ValueCell,
} from "../src/index.js";

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/stats/${name}.json`, import.meta.url), "utf8"),
  );
}

const summary = fixture("summary");
const stack = fixture("stack-detail");
const fragment = fixture("fragment-detail");
const count = { value: 215, suppressed: false };
const rate = { value: 0.91, lower: 0.86, upper: 0.95, sample: 180, suppressed: false };
const suppressed = { value: null, suppressed: true };
const suppressedRate = { value: null, lower: null, upper: null, sample: null, suppressed: true };
const qualifying = {
  value: true,
  score: 1.8,
  suppressed: false,
  last7: { value: 25, suppressed: false },
  prior28: { value: 55, suppressed: false },
};
const decodeSummary = Schema.decodeUnknownSync(StatsSummary);
const decodeDetail = Schema.decodeUnknownSync(StatsDetail);

// Expand the route example's ellipses and add Time filtering's required previous cell.
const routeExample = {
  generatedAt: "2026-10-26T01:00:00Z",
  through: "2026-10-25",
  population: "stacks projects",
  window: 28,
  published: true,
  entryPoints: { handoff: { launch: 0.41 }, source: { skill: 0.22 } },
  items: [
    {
      id: "go-cli",
      kind: "stack",
      projects: count,
      greenRate: rate,
      noVerifyShare: { value: 0.12, suppressed: false },
      medianMinutesToGreen: { value: 14, suppressed: false },
      previous: { projects: count, greenRate: rate },
      lastRun: {
        date: "2026-10-25",
        result: "pass",
        agent: "claude",
        preset: "default",
        minutesToGreen: 2.5,
        fingerprint: `sha256:${"a".repeat(64)}`,
      },
    },
  ],
  nextCursor: "opaque-cursor",
};

test("the plan's expanded route example decodes without trending", () => {
  expect(decodeSummary(routeExample)).toEqual(routeExample);
  expect(decodeSummary({ ...routeExample, window: 7 }).window).toBe(7);
});

test.each([qualifying, { ...qualifying, value: false, score: 1.1 }, suppressed])(
  "summary entries accept each public trending form: %j",
  (trending) => {
    const input = {
      ...routeExample,
      items: routeExample.items.map((item) => ({ ...item, trending })),
    };
    expect(decodeSummary(input)).toEqual(input);
  },
);

test("the two-item summary fixture preserves suppressed previous cells and omits the final cursor", () => {
  const decoded = decodeSummary(summary);
  expect(decoded).toEqual(summary);
  expect(decoded.items).toHaveLength(2);
  expect(decoded).not.toHaveProperty("nextCursor");
});

test("stack and fragment detail fixtures preserve every field through the public decoder", () => {
  expect(Schema.decodeUnknownSync(StackStatsDetail)(stack)).toEqual(stack);
  expect(Schema.decodeUnknownSync(FragmentStatsDetail)(fragment)).toEqual(fragment);
  expect(decodeDetail(stack)).toEqual(stack);
  expect(decodeDetail(fragment)).toEqual(fragment);
});

test("a fragment payload from before oftenUsedWith was added still decodes", () => {
  const { oftenUsedWith: _oftenUsedWith, ...older } =
    Schema.decodeUnknownSync(FragmentStatsDetail)(fragment);
  expect(decodeDetail(older)).toEqual(older);
});

test("fragment history carries 7-day projects without requiring green rates", () => {
  const input = {
    ...Schema.decodeUnknownSync(FragmentStatsDetail)(fragment),
    window: 28,
    series: [{ day: "2026-10-25", projects: { value: 70, suppressed: false } }],
  };
  expect(decodeDetail(input)).toEqual(input);
});

test("the shared fixtures' trending inputs agree with their stored window cells", () => {
  const detail = Schema.decodeUnknownSync(StackStatsDetail)(stack);
  const prior = detail.series.find((point) => point.day === "2026-10-18");
  const last7 = detail.windows["7"].projects;
  if (prior === undefined || prior.projects.suppressed || last7.suppressed) {
    throw new Error("fixture needs published trending input windows");
  }
  // This fixture's exact inputs are multiples of five; real scores use unrounded inputs.
  const score = (last7.value + 5) / (prior.projects.value / 4 + 5);
  expect(detail.trending).toEqual({
    value: last7.value >= 10 && score >= 1.5,
    score,
    suppressed: false,
    last7,
    prior28: prior.projects,
  });
  const response = decodeSummary(summary);
  expect(response.items.find((item) => item.id === detail.id)).toMatchObject({
    trending: detail.trending,
  });
});

function assertRateCanPublish(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  if (Schema.is(RateCell)(value) && !value.suppressed) {
    // Give rounded counts and rates their full possible margin of error.
    const maximumSample = value.sample + 2.5;
    expect((value.value + 0.005) * maximumSample).toBeGreaterThanOrEqual(5);
    expect((1 - value.value + 0.005) * maximumSample).toBeGreaterThanOrEqual(5);
  }
  for (const nested of Object.values(value)) assertRateCanPublish(nested);
}

test("published fixture rates can contain five green and five not-green projects", () => {
  for (const input of [summary, stack, fragment]) assertRateCanPublish(input);
});

test("optional keys may be absent but cannot encode explicit undefined", () => {
  const decoded = decodeSummary(routeExample);
  expect(() => Schema.encodeSync(StatsSummary)({ ...decoded, nextCursor: undefined })).toThrow();
  expect(() =>
    Schema.encodeUnknownSync(StatsSummary)({
      ...routeExample,
      items: routeExample.items.map((item) => ({ ...item, trending: undefined })),
    }),
  ).toThrow();
  expect(() =>
    Schema.encodeUnknownSync(StatsDetail)({
      ...Schema.decodeUnknownSync(FragmentStatsDetail)(fragment),
      oftenUsedWith: undefined,
    }),
  ).toThrow();
});

test("before publication only ledger identities and response metadata are needed", () => {
  const input = {
    generatedAt: routeExample.generatedAt,
    through: routeExample.through,
    population: routeExample.population,
    window: 28,
    published: false,
    items: routeExample.items.map(({ id, kind, lastRun }) => ({ id, kind, lastRun })),
  };
  expect(decodeSummary(input)).toEqual(input);
  const detail = {
    generatedAt: input.generatedAt,
    through: input.through,
    population: input.population,
    window: input.window,
    published: false,
    id: "go-cli",
    kind: "stack",
    interval: 7,
    from: "2026-10-01",
    to: "2026-10-25",
  };
  expect(decodeDetail(detail)).toEqual(detail);
});

test("suppressed count, share and timing cells cannot carry values", () => {
  for (const schema of [CountCell, ShareCell, ValueCell]) {
    expect(Schema.decodeUnknownSync(schema)(suppressed)).toEqual(suppressed);
    expect(() => Schema.decodeUnknownSync(schema)({ value: 0, suppressed: true })).toThrow();
  }
});

test("suppressed rates carry no value, bound or sample", () => {
  expect(Schema.decodeUnknownSync(RateCell)(suppressedRate)).toEqual(suppressedRate);
  for (const field of ["value", "lower", "upper", "sample"]) {
    expect(() => Schema.decodeUnknownSync(RateCell)({ ...suppressedRate, [field]: 0 })).toThrow();
  }
});

test.each([
  { ...rate, lower: 0.92 },
  { ...rate, upper: 0.9 },
  { ...rate, value: 1.01 },
  { ...rate, sample: -5 },
  { ...rate, sample: 1.5 },
])("rates reject invalid bounds and samples: %j", (input) => {
  expect(() => Schema.decodeUnknownSync(RateCell)(input)).toThrow();
});

test("a suppressed trend cannot leak its score or inputs", () => {
  for (const extra of [{ score: 1.8 }, { last7: count }, { prior28: count }]) {
    expect(() => Schema.decodeUnknownSync(Trending)({ ...suppressed, ...extra })).toThrow();
  }
  expect(() => Schema.decodeUnknownSync(Trending)({ ...qualifying, last7: suppressed })).toThrow();
});

test("agents use the recorded DetectedAgent ids, including other and none", () => {
  const detail = Schema.decodeUnknownSync(StackStatsDetail)(stack);
  for (const agent of ["claude", "codex", "opencode", "cursor", "other", "none"]) {
    const input = { ...detail, byAgent: detail.byAgent.map((cell) => ({ ...cell, agent })) };
    expect(decodeDetail(input)).toEqual(input);
  }
  expect(() =>
    decodeDetail({
      ...detail,
      byAgent: detail.byAgent.map((cell) => ({ ...cell, agent: "gemini" })),
    }),
  ).toThrow();
  expect(() =>
    decodeSummary({
      ...routeExample,
      items: routeExample.items.map((item) => ({
        ...item,
        lastRun: { ...item.lastRun, agent: "gemini" },
      })),
    }),
  ).toThrow();
});

test("fragment comparisons publish together and distinguish kept from attach rates", () => {
  const base = { stack: "go-cli", projects: count, default: true, keptRate: suppressed };
  expect(() =>
    Schema.decodeUnknownSync(FragmentStackStats)({
      ...base,
      withWithout: { with: rate, without: suppressedRate },
    }),
  ).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(FragmentStackStats)({
      ...base,
      attachRate: suppressed,
      withWithout: { with: rate, without: rate },
    }),
  ).toThrow();
});

test.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "2026-10-25T00:00:00Z"])(
  "UTC day fields reject malformed or impossible dates: %s",
  (day) => {
    expect(() => Schema.decodeUnknownSync(StatsDay)(day)).toThrow();
  },
);

test("ids, digests, population and windows reject values outside their contracts", () => {
  for (const update of [
    { window: 90 },
    { population: "ecosystem" },
    { items: routeExample.items.map((item) => ({ ...item, id: "../go-cli" })) },
  ]) {
    expect(() => decodeSummary({ ...routeExample, ...update })).toThrow();
  }
  expect(() =>
    Schema.decodeUnknownSync(SeriesPoint)({
      day: "2026-10-25",
      projects: count,
      greenRate: rate,
      changes: [{ day: "2026-10-20", digest: "sha256:short" }],
    }),
  ).toThrow();
});

test("encode and JSON round-trip the shared summary and both detail fixtures", () => {
  const encodedSummary = Schema.encodeSync(StatsSummary)(decodeSummary(summary));
  expect(decodeSummary(JSON.parse(JSON.stringify(encodedSummary)))).toEqual(summary);
  for (const input of [stack, fragment]) {
    const encoded = Schema.encodeSync(StatsDetail)(decodeDetail(input));
    expect(decodeDetail(JSON.parse(JSON.stringify(encoded)))).toEqual(input);
  }
});
