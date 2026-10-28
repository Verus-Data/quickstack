import { type Kind, StatsDetail, StatsSummary } from "@steamfield/stacks-format";
import { Context, Effect, FileSystem, Layer, Option, Path, Schema, type Scope } from "effect";
import { HttpClient } from "effect/http";
import { AppConfig } from "../config";
import { type CacheFailure, makeCachedFetch } from "./cached-fetch";

const decodeWireSummary = (text: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(StatsSummary))(text).pipe(
    Effect.mapError((): CacheFailure => "invalid"),
  );
const decodeWireDetail = (text: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(StatsDetail))(text).pipe(
    Effect.mapError((): CacheFailure => "invalid"),
  );

function sameRecord(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
) {
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(([key, value]) => right[key] === value)
  );
}

function sameHeader(left: StatsSummary, right: StatsSummary): boolean {
  return (
    left.generatedAt === right.generatedAt &&
    left.through === right.through &&
    left.population === right.population &&
    left.window === right.window &&
    left.published === right.published &&
    (left.published && right.published
      ? sameRecord(left.entryPoints.handoff, right.entryPoints.handoff) &&
        sameRecord(left.entryPoints.source, right.entryPoints.source)
      : true)
  );
}

const summaryPages = Effect.fn("stats.summaryPages")(function* (
  url: string,
  request: (at: string) => Effect.Effect<string, CacheFailure, Scope.Scope>,
) {
  const seen = new Set<string>();
  let at = url;
  let joined: StatsSummary | undefined;
  while (true) {
    const page = yield* decodeWireSummary(yield* request(at));
    if (joined && !sameHeader(joined, page)) return yield* Effect.fail<CacheFailure>("invalid");
    joined = joined
      ? yield* Schema.decodeUnknownEffect(Schema.toType(StatsSummary))({
          ...joined,
          items: [...joined.items, ...page.items],
        }).pipe(Effect.mapError((): CacheFailure => "invalid"))
      : page;
    if (page.nextCursor === undefined) break;
    if (seen.has(page.nextCursor)) return yield* Effect.fail<CacheFailure>("invalid");
    seen.add(page.nextCursor);
    const next = new URL(url);
    next.searchParams.set("cursor", page.nextCursor);
    at = next.href;
  }
  if (!joined) return yield* Effect.fail<CacheFailure>("invalid");
  const { nextCursor: _nextCursor, ...value } = joined;
  return { value, cacheText: JSON.stringify(Schema.encodeSync(StatsSummary)(value)) };
});

export class Stats extends Context.Service<
  Stats,
  {
    readonly summary: Effect.Effect<Option.Option<StatsSummary>>;
    readonly detail: (kind: Kind, id: string) => Effect.Effect<Option.Option<StatsDetail>>;
  }
>()("stacks/Stats") {
  static layer = Layer.effect(
    Stats,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const client = yield* HttpClient.HttpClient;
      const config = yield* AppConfig;
      const apiUrl = yield* config.apiUrl;
      const indexUrl = yield* config.indexUrl;
      const enabled = apiUrl !== undefined && indexUrl === undefined;
      const cache = { fs, path, root: path.join((yield* config.paths).cache, "stats") };
      if (!enabled || apiUrl === undefined)
        return {
          summary: Effect.succeed(Option.none<StatsSummary>()),
          detail: () => Effect.succeed(Option.none<StatsDetail>()),
        };
      const base = new URL("/v1/", apiUrl).href;
      const url = new URL("stats", base).href;
      const summary = yield* makeCachedFetch({
        cache,
        client,
        url,
        bodyFile: "summary.json",
        stateFile: "summary.state.json",
        decode: decodeWireSummary,
        offline: config.offline,
        load: (request) => summaryPages(url, request),
      });
      return {
        summary: Effect.gen(function* () {
          if (yield* config.offline) return Option.none<StatsSummary>();
          return yield* summary.current();
        }),
        detail: (kind: Kind, id: string) =>
          Effect.gen(function* () {
            if (yield* config.offline) return Option.none<StatsDetail>();
            const detailUrl = new URL(`${kind}s/${encodeURIComponent(id)}/stats`, base).href;
            const file = `${kind}-${id}`;
            const decode = (text: string) =>
              decodeWireDetail(text).pipe(
                Effect.flatMap((value) =>
                  value.kind === kind && value.id === id
                    ? Effect.succeed(value)
                    : Effect.fail<CacheFailure>("invalid"),
                ),
              );
            const detail = yield* makeCachedFetch({
              cache,
              client,
              url: detailUrl,
              bodyFile: `${file}.json`,
              stateFile: `${file}.state.json`,
              decode,
              offline: config.offline,
              load: (request) =>
                Effect.map(request(detailUrl).pipe(Effect.flatMap(decode)), (value) => ({
                  value,
                  cacheText: JSON.stringify(Schema.encodeSync(StatsDetail)(value)),
                })),
            });
            return yield* detail.current();
          }),
      };
    }),
  );
}
