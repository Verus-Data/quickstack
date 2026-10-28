import { type Kind, StatsSummary } from "@stacks/format";
import { Effect, FileSystem, Path, Schema } from "effect";
import { AppConfig } from "../config";
import type { SearchEvidence } from "../schemas/search";

/** Read 4.2b's optional published summary. Search never refreshes it or writes a cache. */
export const readStatsCache = Effect.fn("statsCache.read")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const paths = yield* (yield* AppConfig).paths;
  return yield* fs.readFileString(path.join(paths.cache, "stats", "summary.json")).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(StatsSummary))),
    Effect.catch(() => Effect.succeed(undefined)),
  );
});
export function cachedStats(
  summary: StatsSummary | undefined,
  ref: { id: string; kind: Kind },
): SearchEvidence["stats"] {
  if (!summary?.published) return undefined;
  const row = summary.items.find((item) => item.kind === ref.kind && item.id === ref.id);
  if (!row || row.greenRate.suppressed || row.projects.suppressed) return undefined;
  return {
    greenRateLower: row.greenRate.lower,
    sample: row.greenRate.sample,
    projects: row.projects.value,
    window: summary.window,
  };
}
