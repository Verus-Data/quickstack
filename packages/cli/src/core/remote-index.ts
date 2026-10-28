import {
  bundleDigest,
  EntryBundle,
  type INDEX_PUBLIC_KEYS,
  type IndexEntry,
  RegistryIndex,
} from "@steamfield/stacks-format";
import { Clock, Context, Effect, FileSystem, Layer, Option, Path, Schema, Scope } from "effect";
import { HttpClient } from "effect/http";
import { AppConfig } from "../config";
import { RemoteStatus } from "../schemas/remote-index";
import { directoryMatches, extractBundle } from "./remote-index/files";
import { type RemoteFailure, verifyIndex } from "./remote-index/verification";

export { RemoteStatus } from "../schemas/remote-index";
export type VerifiedIndex = RegistryIndex;
const DAY = 24 * 60 * 60 * 1000;
const stateSchema = Schema.Struct({
  url: Schema.String,
  cachedAt: RemoteStatus.fields.cachedAt,
  lastAttempt: RemoteStatus.fields.lastAttempt,
  lastOutcome: RemoteStatus.fields.lastOutcome,
  backoffUntil: RemoteStatus.fields.backoffUntil,
  backoffs: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
const date = (value: string | null) => (value === null ? 0 : Date.parse(value) || 0);

type Cache = { fs: FileSystem.FileSystem; path: Path.Path; root: string };
type IndexState = {
  status: RemoteStatus;
  index: Option.Option<VerifiedIndex>;
  backoffs: Record<string, string>;
};
type Access = {
  cache: Cache;
  state: IndexState;
  client: HttpClient.HttpClient;
  url: string;
  offline: AppConfig["Service"]["offline"];
  initialize: Effect.Effect<void>;
};
type Verification = Parameters<typeof verifyIndex>[1];
type BundleAccess = Access & {
  temporary: ReturnType<FileSystem.FileSystem["makeTempDirectory"]>;
};

const io = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(Effect.orElseSucceed(() => undefined));

function initialStatus(url: string | null, isDefaultUrl: boolean): RemoteStatus {
  return {
    url,
    isDefaultUrl,
    offline: false,
    cachedAt: null,
    lastAttempt: null,
    lastOutcome: null,
    backoffUntil: null,
  };
}

const writeCache = Effect.fn("remoteIndex.writeCache")(function* (
  cache: Cache,
  file: string,
  text: string,
) {
  const { fs, path, root } = cache;
  yield* Effect.scoped(
    Effect.gen(function* () {
      yield* fs.makeDirectory(root, { recursive: true });
      const temporary = yield* fs.makeTempDirectoryScoped({ directory: root, prefix: ".write-" });
      const at = path.join(temporary, "value");
      yield* fs.writeFileString(at, text, { flag: "wx" });
      yield* fs.rename(at, path.join(root, file));
    }),
  );
});

const saveState = (cache: Cache, state: IndexState) =>
  io(
    writeCache(cache, "state.json", JSON.stringify({ ...state.status, backoffs: state.backoffs })),
  );

const readState = Effect.fn("remoteIndex.readState")(function* (
  cache: Cache,
  state: IndexState,
  verification: Verification,
) {
  const { fs, path, root } = cache;
  const saved = yield* io(
    fs
      .readFileString(path.join(root, "state.json"))
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(stateSchema)))),
  );
  if (!saved || saved.url !== state.status.url) return;
  const { backoffs: savedBackoffs, ...savedStatus } = saved;
  state.status = { ...state.status, ...savedStatus };
  state.backoffs = { ...savedBackoffs };
  const cached = yield* io(
    fs
      .readFileString(path.join(root, "index.json"))
      .pipe(Effect.flatMap((text) => verifyIndex(text, verification))),
  );
  if (cached) state.index = Option.some(cached);
});

const recordFailure = Effect.fn("remoteIndex.recordFailure")(function* (options: {
  cache: Cache;
  state: IndexState;
  outcome: RemoteFailure;
  at: string;
}) {
  const { cache, state, outcome, at } = options;
  const now = yield* Clock.currentTimeMillis;
  state.status = {
    ...state.status,
    lastOutcome: outcome,
    backoffUntil: new Date(now + (outcome === "not_found" ? DAY : 600_000)).toISOString(),
  };
  state.backoffs[at] = state.status.backoffUntil ?? "";
  yield* saveState(cache, state);
});

const boundedFetch = (options: Pick<Access, "client" | "state">, at: string) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    options.state.status = { ...options.state.status, lastAttempt: new Date(now).toISOString() };
    const response = yield* HttpClient.withScope(options.client)
      .get(at)
      .pipe(Effect.mapError((): RemoteFailure => "network"));
    if (response.status === 404) return yield* Effect.fail<RemoteFailure>("not_found");
    if (response.status < 200 || response.status >= 300)
      return yield* Effect.fail<RemoteFailure>("network");
    return yield* response.text.pipe(Effect.mapError((): RemoteFailure => "network"));
  }).pipe(
    Effect.scoped,
    Effect.timeoutOption(1500),
    Effect.flatMap((result) =>
      Option.isSome(result) ? Effect.succeed(result.value) : Effect.fail<RemoteFailure>("timeout"),
    ),
  );

const canFetch = Effect.fn("remoteIndex.canFetch")(function* (
  options: Pick<Access, "initialize" | "offline" | "state" | "url">,
  at: string,
) {
  yield* options.initialize;
  const now = yield* Clock.currentTimeMillis;
  return (
    !(yield* options.offline) &&
    date(options.state.backoffs[at] ?? null) <= now &&
    validUrl(options.url)
  );
});

const refreshIndex = Effect.fn("remoteIndex.refreshIndex")(function* (
  options: Pick<Access, "cache" | "state" | "client" | "url">,
  verification: Verification,
) {
  const { cache, state, url } = options;
  const text = yield* boundedFetch(options, url);
  const verified = yield* verifyIndex(text, verification);
  state.index = Option.some(verified);
  delete state.backoffs[url];
  state.status = {
    ...state.status,
    cachedAt: new Date(yield* Clock.currentTimeMillis).toISOString(),
    lastOutcome: "ok",
    backoffUntil: null,
  };
  yield* io(writeCache(cache, "index.json", text));
  yield* saveState(cache, state);
});

const currentIndex = Effect.fn("remoteIndex.currentIndex")(function* (
  options: Access,
  verification: Verification,
) {
  const { state, url } = options;
  yield* options.initialize;
  const now = yield* Clock.currentTimeMillis;
  if (Option.isSome(state.index) && now - date(state.status.cachedAt) < DAY) return state.index;
  if (!(yield* canFetch(options, url))) return state.index;
  const fresh = yield* Effect.result(refreshIndex(options, verification));
  if (fresh._tag === "Failure")
    yield* recordFailure({ cache: options.cache, state, outcome: fresh.failure, at: url });
  return state.index;
});

const readStatus = Effect.fn("remoteIndex.readStatus")(function* (
  options: Pick<Access, "initialize" | "state" | "offline">,
) {
  yield* options.initialize;
  return { ...options.state.status, offline: yield* options.offline };
});

const persistBundle = Effect.fn("remoteIndex.persistBundle")(function* (
  cache: Cache,
  bundle: EntryBundle,
  digest: string,
) {
  const { fs, path, root } = cache;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const parent = path.join(root, "entries");
      yield* fs.makeDirectory(parent, { recursive: true });
      const staging = yield* Effect.acquireRelease(
        fs.makeTempDirectory({ directory: parent, prefix: ".extract-" }),
        (at) => Effect.ignore(fs.remove(at, { recursive: true, force: true })),
      );
      yield* extractBundle(bundle, staging);
      const target = path.join(parent, digest);
      yield* fs.rename(staging, target);
      return target;
    }),
  );
});

const storeBundle = Effect.fn("remoteIndex.storeBundle")(function* (
  options: Pick<BundleAccess, "cache" | "temporary">,
  bundle: EntryBundle,
  digest: string,
) {
  const { fs, path } = options.cache;
  const cached = yield* Effect.result(persistBundle(options.cache, bundle, digest));
  if (cached._tag === "Success") return cached.success;
  const target = path.join(yield* options.temporary, digest);
  if (yield* directoryMatches({ id: bundle.id, kind: bundle.kind, digest, dir: target }))
    return target;
  yield* fs.makeDirectory(target, { recursive: true });
  yield* extractBundle(bundle, target);
  return target;
});

const downloadBundle = Effect.fn("remoteIndex.downloadBundle")(function* (
  options: Pick<BundleAccess, "cache" | "state" | "client" | "url" | "temporary">,
  entry: IndexEntry,
) {
  const text = yield* boundedFetch(options, bundleUrl(options.url, entry));
  const decoded = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(EntryBundle))(text).pipe(
    Effect.mapError((): RemoteFailure => "invalid"),
  );
  if (
    decoded.id !== entry.id ||
    decoded.kind !== entry.kind ||
    (yield* bundleDigest(decoded)) !== entry.digest
  ) {
    yield* Effect.logWarning("Remote bundle integrity digest mismatch; using bundled entry.");
    return yield* Effect.fail<RemoteFailure>("invalid");
  }
  return yield* storeBundle(options, decoded, entry.digest).pipe(
    Effect.mapError((): RemoteFailure => "invalid"),
  );
});

const cachedBundle = Effect.fn("remoteIndex.cachedBundle")(function* (
  options: BundleAccess,
  entry: IndexEntry,
) {
  yield* options.initialize;
  if (!validUrl(options.url) || !Schema.is(RegistryIndex.fields.entries.value)(entry))
    return Option.none<string>();
  const dir = options.cache.path.join(options.cache.root, "entries", entry.digest);
  if (yield* directoryMatches({ ...entry, dir })) return Option.some(dir);
  const at = bundleUrl(options.url, entry);
  if (!(yield* canFetch(options, at))) return Option.none<string>();
  return yield* downloadBundle(options, entry).pipe(
    Effect.map(Option.some),
    Effect.catch((outcome) =>
      recordFailure({ cache: options.cache, state: options.state, outcome, at }).pipe(
        Effect.as(Option.none<string>()),
      ),
    ),
  );
});

function unconfiguredIndex(offline: AppConfig["Service"]["offline"]): RemoteIndex["Service"] {
  return {
    current: Effect.succeed(Option.none()),
    bundle: () => Effect.succeed(Option.none()),
    status: offline.pipe(Effect.map((offline) => ({ ...initialStatus(null, false), offline }))),
  };
}

export class RemoteIndex extends Context.Service<
  RemoteIndex,
  {
    readonly current: Effect.Effect<Option.Option<VerifiedIndex>>;
    readonly bundle: (entry: IndexEntry) => Effect.Effect<Option.Option<string>>;
    readonly status: Effect.Effect<RemoteStatus>;
  }
>()("stacks/RemoteIndex") {
  static layer = ({
    keys,
    officialUrl,
  }: {
    keys: typeof INDEX_PUBLIC_KEYS;
    officialUrl: string | undefined;
  }) =>
    Layer.effect(
      RemoteIndex,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const client = yield* HttpClient.HttpClient;
        const config = yield* AppConfig;
        const scope = yield* Scope.Scope;
        const url = (yield* config.indexUrl) ?? officialUrl;
        if (url === undefined) return unconfiguredIndex(config.offline);
        const cache = { fs, path, root: path.join((yield* config.paths).cache, "index") };
        const verification = { isDefaultUrl: url === officialUrl, keys };
        const state: IndexState = {
          status: initialStatus(url, verification.isDefaultUrl),
          index: Option.none(),
          backoffs: {},
        };
        const initialize = yield* Effect.cached(readState(cache, state, verification));
        // A scoped temporary root keeps this invocation usable if the cache cannot be written.
        const temporary = yield* Effect.cached(
          fs
            .makeTempDirectoryScoped({ prefix: "stacks-index-" })
            .pipe(Effect.provideService(Scope.Scope, scope)),
        );
        const access = { cache, state, client, url, offline: config.offline, initialize };
        return {
          current: currentIndex(access, verification),
          status: readStatus(access),
          bundle: (entry) =>
            cachedBundle({ ...access, temporary }, entry).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            ),
        };
      }),
    );
}

const bundleUrl = (url: string, entry: IndexEntry) =>
  new URL(`entries/${entry.kind}/${entry.id}/${entry.digest}.json`, url).href;

function validUrl(text: string): boolean {
  if (!URL.canParse(text)) return false;
  const url = new URL(text);
  return (
    !url.username &&
    !url.password &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))
  );
}
