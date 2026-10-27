import { Schema } from "effect";
import { expect, test } from "vitest";
import { evaluate, pairwiseWins, recallAt, reciprocalRank } from "./helpers/search-eval";
import { GoldenSet } from "./helpers/search-golden";

type Query = GoldenSet["queries"][number];
type Ref = Pick<Query["relevant"][number], "kind" | "id">;

const stack = (id: string): Ref => ({ kind: "stack", id });
const fragment = (id: string): Ref => ({ kind: "fragment", id });

function judgment(overrides: Partial<Query> = {}): Query {
  return {
    id: "stack-request",
    pool: "product",
    split: "tune",
    query: "a sample project",
    relevant: [{ kind: "stack", id: "right", grade: 2 }],
    ...overrides,
  };
}

function golden(queries: ReadonlyArray<Query>): GoldenSet {
  return Schema.decodeUnknownSync(GoldenSet)({
    schemaVersion: 1,
    gate: { mrr: 0, recallAt3: 0, fragmentRecallAt5: 0 },
    queries,
  });
}

test("reciprocal rank uses the first grade-1-or-2 stack's one-based rank [4.5a#6]", () => {
  expect(reciprocalRank([stack("wrong"), stack("right")], judgment())).toBe(0.5);
  const query = judgment({
    relevant: [
      { kind: "stack", id: "fair", grade: 1 },
      { kind: "stack", id: "right", grade: 2 },
    ],
  });
  expect(reciprocalRank([stack("wrong"), stack("fair"), stack("right")], query)).toBe(0.5);
  expect(reciprocalRank([stack("wrong")], query)).toBe(0);
});

test("MRR includes rank ten and excludes rank eleven [4.5a#6]", () => {
  const misses = Array.from({ length: 9 }, (_, index) => stack(`wrong-${index}`));
  expect(reciprocalRank([...misses, stack("right")], judgment())).toBe(0.1);
  expect(reciprocalRank([...misses, stack("another"), stack("right")], judgment())).toBe(0);
  expect(reciprocalRank([], judgment())).toBe(0);
});

test("recall at three counts only grade-2 stacks and includes the cutoff [4.5a#6]", () => {
  const query = judgment({
    relevant: [
      { kind: "stack", id: "right", grade: 2 },
      { kind: "stack", id: "also-right", grade: 2 },
      { kind: "stack", id: "fair", grade: 1 },
    ],
  });
  const ranking = [stack("fair"), stack("wrong"), stack("right"), stack("also-right")];
  expect(recallAt(ranking, query, "stack", 3)).toBe(0.5);
  expect(recallAt(ranking, query, "stack", 4)).toBe(1);
  expect(recallAt([], query, "stack", 3)).toBe(0);
});

test("fragment recall at five counts grade-2 fragments at the cutoff [4.5a#6]", () => {
  const query = judgment({
    pool: "fragment",
    relevant: [
      { kind: "fragment", id: "auth", grade: 2 },
      { kind: "fragment", id: "database", grade: 2 },
      { kind: "fragment", id: "fair", grade: 1 },
    ],
  });
  const ranking = ["fair", "other-a", "other-b", "other-c", "auth", "database"].map(fragment);
  expect(recallAt(ranking, query, "fragment", 5)).toBe(0.5);
  expect(recallAt(ranking, query, "fragment", 6)).toBe(1);
});

test("interleaved kinds do not consume each other's rank positions [4.5a#6] [4.5a#10]", () => {
  const query = judgment({
    relevant: [
      { kind: "stack", id: "right", grade: 2 },
      { kind: "fragment", id: "auth", grade: 2 },
    ],
  });
  const ranking = [fragment("other"), stack("wrong"), fragment("auth"), stack("right")];
  expect(reciprocalRank(ranking, query)).toBe(0.5);
  expect(recallAt(ranking, query, "stack", 3)).toBe(1);
  expect(recallAt(ranking, query, "fragment", 5)).toBe(1);
});

test("a missing first and missing competitor count no pairwise win [4.5a#7]", () => {
  const query = judgment({ first: stack("right") });
  expect(pairwiseWins([], query)).toBe(0);
  expect(pairwiseWins([stack("unrelated")], query)).toBe(0);
});

test("pairwise wins count the same-kind results above the required first [4.5a#7]", () => {
  const query = judgment({ first: stack("right") });
  expect(pairwiseWins([stack("competitor"), stack("right")], query)).toBe(1);
  expect(pairwiseWins([stack("right"), stack("competitor")], query)).toBe(0);
  expect(pairwiseWins([stack("a"), fragment("other"), stack("b"), stack("right")], query)).toBe(2);
});

test("evaluation reports separate splits and a query-weighted total deterministically [4.5a#8]", () => {
  const set = golden([
    judgment({ id: "tune-hit", query: "tune hit", first: stack("right") }),
    judgment({ id: "tune-miss", query: "tune miss", first: stack("right") }),
    judgment({
      id: "tune-fragment",
      query: "tune fragment",
      pool: "fragment",
      relevant: [{ kind: "fragment", id: "auth", grade: 2 }],
    }),
    judgment({
      id: "tune-no-match",
      query: "tune no match",
      pool: "no-match",
      noMatch: true,
      relevant: [],
    }),
    judgment({ id: "holdout-hit", query: "holdout hit", split: "holdout", first: stack("right") }),
    judgment({
      id: "holdout-no-match",
      query: "holdout no match",
      split: "holdout",
      pool: "no-match",
      noMatch: true,
      relevant: [],
    }),
  ]);
  const rank = (query: string) => {
    switch (query) {
      case "tune hit":
        return [stack("right")];
      case "holdout hit":
        return [stack("wrong-a"), stack("wrong-b"), stack("right")];
      case "tune fragment":
        return ["a", "b", "c", "d", "e", "auth"].map(fragment);
      case "tune no match":
        return [{ kind: "stack", id: "weak-fit", tier: "weak" }] as const;
      case "holdout no match":
        return [{ kind: "fragment", id: "overconfident-fit", tier: "strong" }] as const;
      default:
        return [];
    }
  };
  const report = evaluate(rank, set);
  expect(evaluate(rank, set)).toEqual(report);
  expect(report.tune).toMatchObject({
    queries: 4,
    mrr: 0.5,
    recallAt3: 0.5,
    fragmentRecallAt5: 0,
    firstResult: { passed: 1, total: 2 },
    noMatch: { passed: 1, total: 1 },
  });
  expect(report.holdout).toMatchObject({
    queries: 2,
    recallAt3: 1,
    firstResult: { passed: 0, total: 1 },
    noMatch: { passed: 0, total: 1 },
  });
  expect(report.total).toMatchObject({
    queries: 6,
    fragmentRecallAt5: 0,
    firstResult: { passed: 1, total: 3 },
    noMatch: { passed: 1, total: 2 },
  });
  expect(report.holdout.mrr).toBeCloseTo(1 / 3);
  expect(report.total.mrr).toBeCloseTo(4 / 9);
  expect(report.total.recallAt3).toBeCloseTo(2 / 3);
});

test("fragment-only judgments do not dilute stack MRR or stack recall [4.5a#9]", () => {
  const set = golden([
    judgment({ query: "stack request" }),
    judgment({
      id: "fragment-request",
      query: "fragment request",
      pool: "fragment",
      relevant: [{ kind: "fragment", id: "auth", grade: 2 }],
    }),
  ]);
  const rank = (query: string) =>
    query === "stack request" ? [stack("wrong"), stack("right")] : [fragment("auth")];
  const report = evaluate(rank, set);
  expect(report.tune.mrr).toBe(0.5);
  expect(report.total.mrr).toBe(0.5);
  expect(report.total.recallAt3).toBe(1);
  expect(report.total.fragmentRecallAt5).toBe(1);
});

test("a grade-1-only stack query contributes to MRR without diluting grade-2 recall [4.5a#6] [4.5a#8]", () => {
  const fair = judgment({
    id: "fair-only",
    query: "a fair second choice",
    relevant: [{ kind: "stack", id: "fair", grade: 1 }],
  });
  const rank = (query: string) =>
    query === fair.query ? [stack("wrong"), stack("fair")] : [stack("right")];
  expect(reciprocalRank(rank(fair.query), fair)).toBe(0.5);
  const report = evaluate(rank, golden([fair, judgment()]));
  expect(report.total.mrr).toBe(0.75);
  expect(report.total.recallAt3).toBe(1);
});

test("aggregate recall averages eligible queries rather than pooling judgments [4.5a#8]", () => {
  const set = golden([
    judgment({
      id: "two-stacks",
      query: "two stacks fit",
      relevant: [
        { kind: "stack", id: "a", grade: 2 },
        { kind: "stack", id: "b", grade: 2 },
      ],
    }),
    judgment({
      id: "one-stack",
      query: "one stack fits",
      relevant: [{ kind: "stack", id: "c", grade: 2 }],
    }),
    judgment({
      id: "two-fragments",
      query: "two fragments fit",
      pool: "fragment",
      relevant: [
        { kind: "fragment", id: "x", grade: 2 },
        { kind: "fragment", id: "y", grade: 2 },
      ],
    }),
    judgment({
      id: "one-fragment",
      query: "one fragment fits",
      pool: "fragment",
      relevant: [{ kind: "fragment", id: "z", grade: 2 }],
    }),
  ]);
  const rankings: Readonly<Record<string, ReadonlyArray<Ref>>> = {
    "two stacks fit": [stack("a")],
    "one stack fits": [stack("c")],
    "two fragments fit": [fragment("x")],
    "one fragment fits": [fragment("z")],
  };
  const report = evaluate((query: string) => rankings[query] ?? [], set);
  expect(report.tune.recallAt3).toBe(0.75);
  expect(report.tune.fragmentRecallAt5).toBe(0.75);
  expect(report.total.recallAt3).toBe(0.75);
  expect(report.total.fragmentRecallAt5).toBe(0.75);
});

test("no-match checks every hit of both kinds for a strong tier [4.5a#8]", () => {
  const set = golden([judgment({ pool: "no-match", noMatch: true, relevant: [] })]);
  const weakRanking = [
    { ...stack("weak-stack"), tier: "weak" },
    { ...fragment("weak-fragment"), tier: "weak" },
  ] as const;
  expect(evaluate(() => weakRanking, set).total.noMatch).toEqual({ passed: 1, total: 1 });
  for (const strong of [stack("strong-stack"), fragment("strong-fragment")]) {
    const ranking = [
      { ...stack("weak-stack"), tier: "weak" },
      { ...strong, tier: "strong" },
    ] as const;
    expect(evaluate(() => ranking, set).total.noMatch).toEqual({ passed: 0, total: 1 });
  }
});

test("stack and fragment judgments with a shared id remain separate [4.5a#10]", () => {
  const query = judgment({
    first: stack("shared"),
    relevant: [
      { kind: "stack", id: "shared", grade: 2 },
      { kind: "fragment", id: "shared", grade: 2 },
    ],
  });
  const onlyFragment = [fragment("shared")];
  expect(reciprocalRank(onlyFragment, query)).toBe(0);
  expect(recallAt(onlyFragment, query, "stack", 3)).toBe(0);
  expect(recallAt(onlyFragment, query, "fragment", 5)).toBe(1);
  const onlyStack = [stack("shared")];
  expect(reciprocalRank(onlyStack, query)).toBe(1);
  expect(recallAt(onlyStack, query, "fragment", 5)).toBe(0);
  expect(pairwiseWins([fragment("shared"), stack("shared")], query)).toBe(0);
  const report = evaluate(() => onlyFragment, golden([query]));
  expect(report.total.firstResult).toEqual({ passed: 0, total: 1 });
});

test("first-result success is checked among that kind, including fragment firsts [4.5a#8] [4.5a#10]", () => {
  const query = judgment({
    pool: "fragment",
    first: fragment("shared"),
    relevant: [{ kind: "fragment", id: "shared", grade: 2 }],
  });
  const report = evaluate(() => [stack("shared"), fragment("shared")], golden([query]));
  expect(report.total.firstResult).toEqual({ passed: 1, total: 1 });
  expect(report.total.fragmentRecallAt5).toBe(1);
});

test("schema decoding and evaluation preserve the query's original text [4.5a#11]", () => {
  const text = "  MiXeD Case request?!  ";
  const set = golden([judgment({ query: text })]);
  expect(set.queries.map((query: Query) => query.query)).toEqual([text]);
  const rank = (query: string) => (query === text ? [stack("right")] : []);
  expect(evaluate(rank, set).total.mrr).toBe(1);
  expect(set.queries.map((query: Query) => query.query)).toEqual([text]);
});
