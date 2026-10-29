import {
  compareSearchHits,
  type RankInput,
  type SearchHit,
  type SearchResult,
} from "@steamfield/stacks-format";
import type { RemoteSearch } from "./remote";

/** Official hits can be fresher; a local override is always the entry new would use. */
function mergeHits(
  local: ReadonlyArray<SearchHit>,
  api: ReadonlyArray<SearchHit>,
  overrides: ReadonlySet<string>,
) {
  const localById = new Map(local.map((hit) => [`${hit.kind}:${hit.id}`, hit]));
  const official = api
    .filter((hit) => !overrides.has(`${hit.kind}:${hit.id}`))
    .map((hit) => {
      const fallback = localById.get(`${hit.kind}:${hit.id}`)?.evidence;
      const stats = hit.evidence.stats ?? fallback?.stats;
      const lastRun = hit.evidence.lastRun ?? fallback?.lastRun;
      return {
        ...hit,
        evidence: {
          ...(stats ? { stats } : {}),
          ...(lastRun ? { lastRun } : {}),
        },
      };
    });
  const replaced = new Set(official.map((hit) => hit.id));
  return [...local.filter((hit) => !replaced.has(hit.id)), ...official].sort(compareSearchHits);
}

export function mergeSearch(
  local: SearchResult,
  remote: RemoteSearch,
  options: Pick<RankInput, "limit" | "kind"> & {
    overrides: ReadonlyArray<Pick<SearchHit, "kind" | "id">>;
  },
): SearchResult & { remote: RemoteSearch["remote"] } {
  const overrides = new Set(options.overrides.map((entry) => `${entry.kind}:${entry.id}`));
  const mergedStacks =
    remote.remote === "used"
      ? mergeHits(local.stacks, remote.response.stacks, overrides)
      : local.stacks;
  const mergedFragments =
    remote.remote === "used"
      ? mergeHits(local.fragments, remote.response.fragments, overrides)
      : local.fragments;
  const stacks = options.kind === "fragment" ? [] : mergedStacks.slice(0, options.limit ?? 5);
  const fragments = options.kind === "stack" ? [] : mergedFragments.slice(0, options.limit ?? 5);
  const ranking =
    remote.remote === "used"
      ? ({ ranking: "api", method: remote.response.method } as const)
      : ({ ranking: "local" } as const);
  return {
    ...local,
    ...ranking,
    remote: remote.remote,
    ...(remote.remote === "off" ? { remoteReason: remote.remoteReason } : {}),
    understood: remote.remote === "used" ? remote.response.understood : local.understood,
    noStrongMatch: ![...stacks, ...fragments].some((hit) => hit.tier === "strong"),
    stacks,
    fragments,
  };
}
