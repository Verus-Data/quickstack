import { type IndexEntry, IndexEntry as IndexEntrySchema } from "@stacks/format";
import { Effect, FileSystem, Option, Path, Schema } from "effect";
import { RemoteIndex } from "../remote-index";
import { directoryMatches } from "../remote-index/files";
import {
  type CatalogEntry,
  decodeEntry,
  type Entry,
  markdownFile,
  type Origin,
  type RejectedEntry,
} from "./entry";

const key = (entry: Pick<Entry, "kind" | "id">) => `${entry.kind}/${entry.id}`;
const higher = (entry: Entry | RejectedEntry | undefined) =>
  entry?.origin === "project" || entry?.origin === "user";

const readEntry = Effect.fn("registry.remoteEntry")(function* (
  remote: RemoteIndex["Service"],
  ref: IndexEntry,
  trusted: boolean,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* remote.bundle(ref);
  if (Option.isNone(dir)) return undefined;
  const text = yield* fs
    .readFileString(path.join(dir.value, markdownFile(ref.kind)))
    .pipe(Effect.orElseSucceed(() => ""));
  const decoded = yield* decodeEntry(ref.kind, text);
  if (decoded._tag !== "Meta" || decoded.meta.id !== ref.id) return undefined;
  return {
    id: ref.id,
    kind: ref.kind,
    origin: "index",
    dir: dir.value,
    trusted,
    shadows: [],
    meta: decoded.meta,
    body: decoded.body,
    indexEntry: ref,
  } satisfies Entry;
});

const pinnedFragments = Effect.fn("registry.pinnedFragments")(function* (
  remote: RemoteIndex["Service"],
  ref: IndexEntry,
  options: { trusted: boolean; bundled: ReadonlyArray<Entry> },
) {
  const fragments: Entry[] = [];
  for (const [id, digest] of Object.entries(ref.composition ?? {})) {
    const original = options.bundled.find((entry) => entry.kind === "fragment" && entry.id === id);
    if (
      original &&
      (yield* directoryMatches({ id, kind: "fragment", digest, dir: original.dir }))
    ) {
      fragments.push(original);
      continue;
    }
    const fragment = yield* readEntry(
      remote,
      {
        id,
        digest,
        kind: "fragment",
        schemaVersion: 1,
        name: "",
        description: "",
        tags: [],
      },
      options.trusted,
    );
    if (!fragment) return undefined;
    fragments.push(fragment);
  }
  return fragments;
});

function bundledComposition(original: Entry | undefined, bundled: ReadonlyArray<Entry>) {
  if (original?.meta.kind !== "stack") return original;
  const fragments = new Map(
    bundled.filter((entry) => entry.kind === "fragment").map((entry) => [entry.id, entry]),
  );
  const selected = new Map<string, Entry>();
  const pending = [...original.meta.fragments.required, ...original.meta.fragments.default];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    const fragment = fragments.get(id);
    if (!fragment || selected.has(id) || fragment.meta.kind !== "fragment") continue;
    selected.set(id, fragment);
    pending.push(...fragment.meta.requires);
  }
  return { ...original, composition: [...selected.values()] };
}

const resolveReference = Effect.fn("registry.resolveReference")(function* (
  ref: IndexEntry,
  options: {
    remote: RemoteIndex["Service"];
    trusted: boolean;
    original: Entry | undefined;
    bundled: ReadonlyArray<Entry>;
  },
) {
  const { remote, trusted, original, bundled } = options;
  const same = original && (yield* directoryMatches({ ...ref, dir: original.dir }));
  const entry = same ? original : yield* readEntry(remote, ref, trusted);
  if (!entry) return ref.kind === "stack" ? bundledComposition(original, bundled) : undefined;
  const shadows: Entry["shadows"] = original ? ["bundled"] : [];
  if (ref.kind === "fragment") return same ? original : { ...entry, shadows };
  const pinned = yield* pinnedFragments(remote, ref, { trusted, bundled });
  if (pinned === undefined) {
    return bundledComposition(original, bundled);
  }
  return { ...entry, composition: pinned, ...(same ? {} : { shadows }) };
});

const order: ReadonlyArray<Origin> = ["project", "user", "index", "bundled"];
function shadowIndex(entry: Entry | RejectedEntry | undefined) {
  if (!entry || !("meta" in entry)) return entry;
  const shadows: Origin[] = [...entry.shadows, "index"];
  return {
    ...entry,
    shadows: [...new Set(shadows)].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
  };
}

function catalogRow(entry: Entry | RejectedEntry): CatalogEntry {
  return {
    id: entry.id,
    kind: entry.kind,
    origin: entry.origin,
    tags: "meta" in entry ? entry.meta.tags : [],
    rejected: !("meta" in entry),
  };
}

/** Bundle effects are cached per entry; reading names never evaluates them. */
export const remoteRegistry = Effect.fn("registry.remoteRegistry")(function* (
  local: ReadonlyArray<Entry | RejectedEntry>,
  bundled: ReadonlyArray<Entry>,
  enabled: boolean,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const catalog = new Map(local.map((entry) => [key(entry), catalogRow(entry)]));
  const resolutions = new Map<string, Effect.Effect<Entry | RejectedEntry | undefined>>(
    local.map((entry) => [key(entry), Effect.succeed(entry)]),
  );
  const service = enabled ? yield* Effect.serviceOption(RemoteIndex) : Option.none();
  if (Option.isSome(service)) {
    const remote = service.value;
    const index = yield* remote.current;
    const trusted = (yield* remote.status).isDefaultUrl;
    const originals = new Map(bundled.map((entry) => [key(entry), entry]));
    const locals = new Map(local.map((entry) => [key(entry), entry]));
    for (const ref of Option.isSome(index) ? index.value.entries : []) {
      if (ref.schemaVersion > 1 || !Schema.is(IndexEntrySchema)(ref)) continue;
      const existing = locals.get(key(ref));
      if (higher(existing)) {
        resolutions.set(key(ref), Effect.succeed(shadowIndex(existing)));
        continue;
      }
      catalog.set(key(ref), {
        id: ref.id,
        kind: ref.kind,
        origin: "index",
        tags: ref.tags,
        rejected: false,
      });
      const resolve = yield* Effect.cached(
        resolveReference(ref, {
          remote,
          trusted,
          original: originals.get(key(ref)),
          bundled,
        }).pipe(
          Effect.map((entry) => entry ?? existing),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
      );
      resolutions.set(key(ref), resolve);
    }
  }
  return {
    catalog: [...catalog.values()].sort(compareEntries),
    all: Effect.forEach([...resolutions.values()], (effect) => effect).pipe(
      Effect.map((entries) => entries.filter((entry) => entry !== undefined).sort(compareEntries)),
    ),
    get: (kind: Entry["kind"], id: string) =>
      resolutions.get(key({ kind, id })) ?? Effect.succeed(undefined),
  };
});

function compareEntries(a: Pick<Entry, "id" | "kind">, b: Pick<Entry, "id" | "kind">): number {
  if (a.kind !== b.kind) return a.kind === "stack" ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}
