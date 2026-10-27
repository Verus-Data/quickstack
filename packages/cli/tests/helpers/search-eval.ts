import type { GoldenSet } from "./search-golden";

type Query = GoldenSet["queries"][number];
type Ref = Pick<Query["relevant"][number], "kind" | "id">;
type Hit = Ref & { readonly tier?: "strong" | "partial" | "weak" };
type Ranking = ReadonlyArray<Hit>;

function sameEntry(left: Ref, right: Ref): boolean {
  return left.kind === right.kind && left.id === right.id;
}

export function reciprocalRank(ranking: Ranking, query: Query): number {
  const index = ranking
    .filter((hit) => hit.kind === "stack")
    .slice(0, 10)
    .findIndex((hit) => query.relevant.some((ref) => sameEntry(hit, ref)));
  return index < 0 ? 0 : 1 / (index + 1);
}

export function recallAt(
  ranking: Ranking,
  query: Query,
  kind: Ref["kind"],
  cutoff: number,
): number {
  const relevant = query.relevant.filter((ref) => ref.kind === kind && ref.grade === 2);
  const hits = ranking.filter((hit) => hit.kind === kind).slice(0, cutoff);
  const found = relevant.filter((ref) => hits.some((hit) => sameEntry(hit, ref)));
  return relevant.length === 0 ? 0 : found.length / relevant.length;
}

// Despite the name, this counts competitors above first. Missing first is handled separately
// by firstResult, so dropping it cannot turn a failed first-result case into a pass.
export function pairwiseWins(ranking: Ranking, query: Query): number {
  const first = query.first;
  if (first === undefined) return 0;
  const index = ranking
    .filter((hit) => hit.kind === first.kind)
    .findIndex((hit) => sameEntry(hit, first));
  return Math.max(0, index);
}

type ScoredQuery = {
  readonly query: Query;
  readonly ranking: Ranking;
};

function mean(scores: ReadonlyArray<number>): number {
  return scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function hasGradeTwo(query: Query, kind: Ref["kind"]): boolean {
  return query.relevant.some((ref) => ref.kind === kind && ref.grade === 2);
}

function firstResultPass({ query, ranking }: ScoredQuery): boolean {
  const first = query.first;
  if (first === undefined) return false;
  const hit = ranking.find((hit) => hit.kind === first.kind);
  return hit !== undefined && sameEntry(hit, first);
}

function summarize(scored: ReadonlyArray<ScoredQuery>) {
  const stacks = scored.filter(({ query }) => query.relevant.some((ref) => ref.kind === "stack"));
  const stackRecall = scored.filter(({ query }) => hasGradeTwo(query, "stack"));
  const fragmentRecall = scored.filter(({ query }) => hasGradeTwo(query, "fragment"));
  const first = scored.filter(({ query }) => query.first !== undefined);
  const noMatch = scored.filter(({ query }) => query.noMatch === true);
  return {
    queries: scored.length,
    mrr: mean(stacks.map(({ query, ranking }) => reciprocalRank(ranking, query))),
    recallAt3: mean(stackRecall.map(({ query, ranking }) => recallAt(ranking, query, "stack", 3))),
    fragmentRecallAt5: mean(
      fragmentRecall.map(({ query, ranking }) => recallAt(ranking, query, "fragment", 5)),
    ),
    firstResult: { passed: first.filter(firstResultPass).length, total: first.length },
    noMatch: {
      passed: noMatch.filter(({ ranking }) => ranking.every((hit) => hit.tier !== "strong")).length,
      total: noMatch.length,
    },
  };
}

export function evaluate(rank: (query: string) => Ranking, golden: GoldenSet) {
  const scored = golden.queries.map((query) => ({ query, ranking: rank(query.query) }));
  return {
    tune: summarize(scored.filter(({ query }) => query.split === "tune")),
    holdout: summarize(scored.filter(({ query }) => query.split === "holdout")),
    total: summarize(scored),
  };
}
