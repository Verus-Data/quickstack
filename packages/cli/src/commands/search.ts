import { Effect, Option, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { AppConfig } from "../config";
import { readLedger } from "../core/ledger";
import { toRow } from "../core/list";
import { type Entry, isRejected } from "../core/registry/entry";
import { defaultRoots, Registry, remoteRoots } from "../core/registry/registry";
import { rank } from "../core/search/rank";
import { renderSearch } from "../core/search/report";
import { decodeSidecar, decodeVocabulary } from "../core/search/sidecar";
import { cachedStats, readStatsCache } from "../core/stats-cache";
import { textWidth } from "../core/wrap";
import { BadInput } from "../errors";
import { SearchResult, type SearchVocabulary } from "../schemas/search";
import { Host } from "../services/host";
import { Invocation } from "../services/invocation";
import { Output } from "../services/output";

const emptyVocabulary: SearchVocabulary = {
  schemaVersion: 1,
  platforms: {},
  productKinds: {},
  languages: {},
  capabilities: {},
};
const search = Effect.fn("search.run")(function* (
  request: string,
  options: { limit: number; kind?: "stack" | "fragment" },
) {
  const registry = yield* Registry;
  const roots = yield* defaultRoots;
  const bundled = roots.find((root) => root.origin === "bundled");
  const ledger = bundled ? yield* readLedger(bundled.path) : undefined;
  const stats = yield* readStatsCache();
  const bytes = yield* registry.vocabulary;
  const vocabulary = bytes
    ? yield* decodeVocabulary(bytes).pipe(Effect.catch(() => Effect.succeed(emptyVocabulary)))
    : emptyVocabulary;
  const entries = yield* Effect.forEach(
    (yield* registry.all).filter((item): item is Entry => !isRejected(item)),
    (entry) =>
      Effect.gen(function* () {
        const bytes = yield* registry.search(entry);
        const decoded = bytes
          ? yield* decodeSidecar(bytes).pipe(Effect.catch(() => Effect.succeed(undefined)))
          : undefined;
        const search =
          decoded?.id === entry.id && decoded.kind === entry.kind ? decoded : undefined;
        const statsRow = cachedStats(stats, entry);
        return {
          entry,
          ...(search ? { search } : {}),
          evidence: {
            lastRun: toRow(entry, ledger?.records).lastRun,
            ...(statsRow ? { stats: statsRow } : {}),
          },
        };
      }),
  );
  return rank({ request, entries, vocabulary, ...options });
});
export const searchCommand = Command.make(
  "search",
  {
    request: Argument.String("request").pipe(
      Argument.withDescription("What you want to build, in your own words (1 to 500 characters)."),
      Argument.atLeast(1),
    ),
    kind: Flag.Literals("kind", ["stack", "fragment"]).pipe(
      Flag.withDescription("Search only stacks or only fragments."),
      Flag.optional,
    ),
    limit: Flag.Int("limit").pipe(
      Flag.withDescription("Maximum hits per list, from 1 to 20 (default 5)."),
      Flag.withDefault(5),
    ),
  },
  ({ request: words, kind, limit }) =>
    Effect.gen(function* () {
      const request = words.join(" ").trim();
      const length = [...request].length;
      if (length === 0 || length > 500)
        return yield* new BadInput({ details: { flag: "request", id: "", length } });
      if (limit < 1 || limit > 20)
        return yield* new BadInput({ details: { flag: "limit", id: String(limit) } });
      // Search reads cached index entries too, but never refreshes or downloads a bundle.
      yield* (yield* AppConfig).setOffline(true);
      const roots = yield* remoteRoots;
      const result = yield* search(request, { limit, kind: Option.getOrUndefined(kind) }).pipe(
        Effect.provide(Registry.layer(roots)),
      );
      const output = yield* Output;
      const host = yield* Host;
      yield* (yield* Invocation).annotate({
        requestLength: String(length),
        stacks: String(result.stacks.length),
        fragments: String(result.fragments.length),
      });
      yield* output.result(
        Schema.encodeSync(SearchResult)(result),
        renderSearch(result, {
          invocation: host.invocation,
          width: textWidth(output.audience === "human", host.columns),
          measure: host.stringWidth,
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Rank visible stacks and fragments for a request, locally and without sending it anywhere. Exits 0 even when nothing fits strongly, 2 for invalid input (Usage; BadInput), 6 for unreadable registries (PermissionDenied), 130 when interrupted.",
  ),
  Command.withShortDescription("Find stacks and fragments for what you want to build."),
  Command.withExamples(({ commandPath }) => [
    {
      command: `${commandPath.join(" ")} "an iOS health app" --json`,
      description: "Compare fit, explanations and cached evidence.",
    },
    {
      command: `${commandPath.join(" ")} go cli --kind stack --limit 3`,
      description: "Find a stack for a Go command-line tool.",
    },
  ]),
);
