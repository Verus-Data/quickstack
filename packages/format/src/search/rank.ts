import type { FragmentMeta, Kind, StackMeta } from "../entry.js";
import { bm25 } from "./bm25.js";
import { excluded } from "./explain.js";
import type {
  SearchEvidence,
  SearchHit,
  SearchMetadata,
  SearchResult,
  SearchVocabulary,
  SearchWhy,
} from "./schema.js";
import { surfaceForms, tokens } from "./tokens.js";
import { type Category, categories, matchedWords, vocabularyMatches } from "./vocabulary.js";

export type RankRecord = {
  readonly entry: {
    readonly id: string;
    readonly kind: Kind;
    readonly origin: SearchHit["origin"];
    readonly trusted: boolean;
    readonly meta: StackMeta | FragmentMeta;
    readonly body: string;
  };
  readonly search?: SearchMetadata;
  readonly evidence?: SearchEvidence;
};
export type RankInput = {
  readonly request: string;
  readonly entries: ReadonlyArray<RankRecord>;
  readonly vocabulary: SearchVocabulary;
  readonly limit?: number;
  readonly kind?: Kind;
};
type Field = { name: string; weight: number; text: string; words: string[] };
type Candidate = {
  record: RankRecord;
  fields: Field[];
  why: SearchWhy[];
  covered: Set<string>;
  raw: number;
};
const field = (name: string, weight: number, text: string): Field => ({
  name,
  weight,
  text,
  words: tokens(text),
});

function bestRequest(requests: ReadonlyArray<string>, query: ReadonlyArray<string>): string {
  const overlap = (text: string) =>
    new Set(tokens(text).filter((word) => query.includes(word))).size;
  return (
    [...requests].sort(
      (a, b) =>
        overlap(b) - overlap(a) || tokens(a).length - tokens(b).length || a.localeCompare(b),
    )[0] ?? ""
  );
}
function fieldsFor(record: RankRecord, query: ReadonlyArray<string>): Field[] {
  const { entry, search } = record;
  const fields = [
    field("id", 2, entry.id),
    field("name", 2, entry.meta.name),
    field("description", 1.5, entry.meta.description),
    field("tags", 1, entry.meta.tags.join(" ")),
    field("body", 0.15, entry.body),
  ];
  if (entry.meta.kind === "fragment") fields.push(field("category", 1, entry.meta.category));
  if (search)
    fields.push(
      field("summary", 1.5, search.summary),
      field("requests", 2.5, bestRequest(search.requests, query)),
      field("useCases", 1.5, search.useCases.join(" ")),
      field("synonyms", 1.5, search.synonyms.join(" ")),
      field("goodFor", 1, search.goodFor.join(" ")),
    );
  return fields;
}
function categoryValues(
  card: SearchMetadata | undefined,
  category: Category,
): ReadonlyArray<string> {
  if (!card) return [];
  if (card.kind === "fragment") return category === "capabilities" ? card.capabilities : [];
  return category === "capabilities" ? [] : card[category];
}
function prepare(input: RankInput, query: string[], matches: SearchWhy[]): Candidate[] {
  const forms = surfaceForms(input.request);
  return input.entries.map((record) => {
    const why = matches.filter((match) =>
      categories.some(
        (category) =>
          category === match.field &&
          categoryValues(record.search, category).includes(match.matched),
      ),
    );
    const covered = new Set(why.flatMap((reason) => matchedWords(input.request, reason)));
    const fields = fieldsFor(record, query);
    for (const f of fields) {
      const matched = query.filter((word) => f.words.includes(word));
      if (matched.length) {
        const from = matched.flatMap((word) => forms.get(word) ?? []).join(" ");
        why.push({ field: f.name, matched: from, from });
      }
      if (f.weight >= 1.5) for (const word of matched) covered.add(word);
    }
    return { record, fields, why, covered, raw: 0 };
  });
}
function scoreFields(candidates: Candidate[], query: string[], matches: SearchWhy[]) {
  const names = new Set(candidates.flatMap((candidate) => candidate.fields.map((f) => f.name)));
  for (const name of names) {
    const fields = candidates.map((candidate) => candidate.fields.find((f) => f.name === name));
    const scores = bm25(
      fields.map((f) => f?.words ?? []),
      query,
    );
    candidates.forEach((candidate, i) => {
      candidate.raw += (scores[i] ?? 0) * (fields[i]?.weight ?? 0);
    });
  }
  for (const category of categories) {
    const keys = matches.filter((match) => match.field === category).map((match) => match.matched);
    const scores = bm25(
      candidates.map((candidate) => categoryValues(candidate.record.search, category)),
      keys,
    );
    candidates.forEach((candidate, i) => {
      candidate.raw += (scores[i] ?? 0) * 3;
    });
  }
}
function incompatible(
  record: RankRecord,
  category: "platforms" | "languages",
  desired: ReadonlyArray<string>,
): boolean {
  return (
    desired.length > 0 &&
    record.search?.kind === "stack" &&
    !categoryValues(record.search, category).some((value) => desired.includes(value))
  );
}
function mismatch(
  record: RankRecord,
  stacks: ReadonlyArray<RankRecord>,
  category: "platforms" | "languages",
  desired: ReadonlyArray<string>,
): boolean {
  if (record.entry.meta.kind === "stack") return incompatible(record, category, desired);
  const applies = record.entry.meta.appliesTo;
  if (applies.length === 0 || desired.length === 0) return false;
  const targets = stacks.filter((stack) =>
    applies.some(
      (selector) => selector === stack.entry.id || stack.entry.meta.tags.includes(selector),
    ),
  );
  return targets.length > 0 && targets.every((stack) => incompatible(stack, category, desired));
}
function penaltiesFor(
  candidate: Candidate,
  input: RankInput,
  matches: SearchWhy[],
): SearchHit["penalties"] {
  const penalties: SearchHit["penalties"][number][] = [];
  const stacks = input.entries.filter((record) => record.entry.kind === "stack");
  for (const [category, penalty] of [
    ["platforms", "platform"],
    ["languages", "language"],
  ] as const) {
    if (
      mismatch(
        candidate.record,
        stacks,
        category,
        matches.filter((match) => match.field === category).map((match) => match.matched),
      )
    )
      penalties.push(penalty);
  }
  if (excluded(input.request, candidate.record.search)) penalties.push("notFor");
  if (!candidate.record.entry.trusted) penalties.push("untrusted");
  return penalties;
}
function hitFor(
  candidate: Candidate,
  input: RankInput,
  matches: SearchWhy[],
  denominator: number,
): SearchHit {
  const { entry, search, evidence } = candidate.record;
  const penalties = penaltiesFor(candidate, input, matches);
  let adjusted = candidate.raw;
  for (const penalty of penalties) {
    if (penalty === "platform" || penalty === "language") adjusted *= 0.3;
    if (penalty === "notFor") adjusted *= 0.5;
  }
  const scale = entry.kind === "stack" ? 1 : 20;
  const score = adjusted / (adjusted + scale);
  const coverage = denominator === 0 ? 0 : candidate.covered.size / denominator;
  let tier: SearchHit["tier"] = "weak";
  if (score >= 0.5 && coverage >= 0.5 && penalties.length === 0) tier = "strong";
  else if (score >= 0.25) tier = "partial";
  return {
    kind: entry.kind,
    id: entry.id,
    name: entry.meta.name,
    summary: search?.summary ?? entry.meta.description,
    origin: entry.origin,
    trusted: entry.trusted,
    tier,
    score,
    coverage,
    why: candidate.why,
    penalties,
    ...(search?.caveats ? { caveats: search.caveats } : {}),
    ...(entry.meta.kind === "fragment" ? { appliesTo: entry.meta.appliesTo } : {}),
    evidence: evidence ?? {},
  };
}
function quality(hit: SearchHit): number {
  if (hit.evidence.stats) return 0.1 * (hit.evidence.stats.greenRateLower - 0.5);
  if (hit.evidence.lastRun?.result === "pass") return 0.02;
  if (hit.evidence.lastRun?.result === "fail") return -0.02;
  return 0;
}
const tierOrder = { strong: 0, partial: 1, weak: 2 } as const;
export function compareSearchHits(a: SearchHit, b: SearchHit): number {
  return (
    tierOrder[a.tier] - tierOrder[b.tier] ||
    Number(b.trusted) - Number(a.trusted) ||
    b.score * (1 + quality(b)) - a.score * (1 + quality(a)) ||
    (b.evidence.stats?.projects ?? 0) - (a.evidence.stats?.projects ?? 0) ||
    a.id.localeCompare(b.id)
  );
}
/** Pure, invocation-independent ranking over plain data; no service, file, network or clock. */
export function rank(input: RankInput): SearchResult {
  const request = input.request.trim();
  const query = [...new Set(tokens(request))];
  const matches = vocabularyMatches(request, input.vocabulary);
  const candidates = prepare(input, query, matches);
  const strongWords = new Set(candidates.flatMap((candidate) => [...candidate.covered]));
  scoreFields(candidates, query, matches);
  const hits = candidates
    .map((candidate) => hitFor(candidate, input, matches, strongWords.size))
    .sort(compareSearchHits);
  const stacks = hits.filter((hit) => hit.kind === "stack");
  const understood = {
    platforms: [],
    productKinds: [],
    languages: [],
    capabilities: [],
    unmatched: [...surfaceForms(request)]
      .filter(([word]) => !strongWords.has(word))
      .map(([, surface]) => surface),
  } satisfies SearchResult["understood"];
  return {
    request,
    ranking: "local",
    understood: {
      ...understood,
      ...Object.fromEntries(
        categories.map((category) => [
          category,
          matches.filter((match) => match.field === category).map((match) => match.matched),
        ]),
      ),
    },
    noStrongMatch: !stacks.some((hit) => hit.tier === "strong"),
    stacks: input.kind === "fragment" ? [] : stacks.slice(0, input.limit ?? 5),
    fragments:
      input.kind === "stack"
        ? []
        : hits.filter((hit) => hit.kind === "fragment").slice(0, input.limit ?? 5),
  };
}
