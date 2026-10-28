import {
  DirectoryData,
  EntryBundle,
  type IndexEntry,
  Kebab,
  type OfficialNames,
  type RegistryIndex,
} from "@steamfield/stacks-format";
import { Effect, FileSystem, Path, Schema } from "effect";
import { type Entry, isRejected, markdownFile } from "../../src/core/registry/entry";
import { Registry } from "../../src/core/registry/registry";
import { addedEntries } from "./directory-added";
import { historicalMetadata, type Last, releasedContent, staticContent } from "./directory-history";
import { bundlePath } from "./remote";

const { id: _id, last: _last, ...removalFields } = DirectoryData.fields.removed.value.fields;
const RemovalFile = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  entries: Schema.Record(
    Kebab,
    Schema.Struct({
      ...removalFields,
      removedAt: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
      reason: Schema.String.check(Schema.isPattern(/\S/)),
    }),
  ),
});
type Removals = typeof RemovalFile.Type.entries;

const validRemovalDate = (date: string) => {
  const time = Date.parse(date);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
};

const readRemovals = Effect.fn("index.readRemovals")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const file = (yield* Path.Path).join(root, "removed.json");
  // Registries predating the removal manifest have no rows, rather than implicit removals.
  if (!(yield* fs.exists(file))) return {} satisfies Removals;
  const decoded = yield* fs.readFileString(file).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(Schema.fromJsonString(RemovalFile), { onExcessProperty: "error" }),
    ),
    Effect.mapError(() => new Error(`${file}: invalid removal manifest.`)),
  );
  return decoded.entries;
});

const checkRemovals = Effect.fn("index.checkRemovals")(function* (options: {
  root: string;
  names: OfficialNames;
  entries: ReadonlyArray<IndexEntry>;
  removals: Removals;
}) {
  const registry = yield* Registry;
  const current = [
    ...(yield* registry.all).filter((entry) => !isRejected(entry)),
    ...options.entries,
  ];
  const has = (kind: string, id: string) =>
    current.some((entry) => entry.kind === kind && entry.id === id);
  for (const source of options.names.sources) {
    const refs = [
      ...source.stacks.map(({ id }) => ({ kind: "stack", id })),
      ...source.fragments.map((id) => ({ kind: "fragment", id })),
    ];
    for (const ref of refs)
      if (!has(ref.kind, ref.id) && options.removals[ref.id]?.kind !== ref.kind)
        return yield* Effect.fail(
          new Error(
            `${options.root}/removed.json: missing removal record for ${ref.kind}/${ref.id}.`,
          ),
        );
  }
  for (const [id, row] of Object.entries(options.removals)) {
    if (has(row.kind, id))
      return yield* Effect.fail(new Error(`removed.json: ${row.kind}/${id} is still current.`));
    if (row.replacedBy !== undefined && !current.some((entry) => entry.id === row.replacedBy))
      return yield* Effect.fail(
        new Error(`removed.json: ${id}: replacement ${row.replacedBy} is not current.`),
      );
    if (!validRemovalDate(row.removedAt))
      return yield* Effect.fail(new Error(`removed.json: ${id}: invalid removedAt date.`));
  }
});

export const checkTags = Effect.fn("index.checkTags")(function* (
  entries: ReadonlyArray<Pick<IndexEntry, "kind" | "id" | "tags">>,
) {
  for (const entry of entries)
    for (const tag of entry.tags)
      if (!/^[a-z0-9-]+$/.test(tag))
        return yield* Effect.fail(
          new Error(
            `${entry.kind}/${entry.id}: invalid directory tag ${JSON.stringify(tag)}; expected ^[a-z0-9-]+$.`,
          ),
        );
});

const previousContent = Effect.fn("index.previousContent")(function* (options: {
  id: string;
  kind: IndexEntry["kind"];
  previous: RegistryIndex | null;
  directory: DirectoryData | null;
  bundles: ReadonlyMap<string, Uint8Array>;
}) {
  const entry = options.previous?.entries.find(
    (entry) => entry.id === options.id && entry.kind === options.kind,
  );
  if (entry === undefined)
    return options.directory?.removed.find(
      (entry) => entry.id === options.id && entry.kind === options.kind,
    )?.last;
  const bytes = options.bundles.get(bundlePath(entry));
  if (bytes === undefined) return undefined;
  const bundle = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(EntryBundle))(
    new TextDecoder().decode(bytes),
  );
  const markdown = bundle.files.find((file) => file.path === markdownFile(entry.kind));
  if (markdown === undefined) return undefined;
  const text =
    markdown.encoding === "utf8"
      ? markdown.content
      : Buffer.from(markdown.content, "base64").toString("utf8");
  const meta = yield* historicalMetadata(text);
  if (meta.id !== entry.id)
    return yield* Effect.fail(
      new Error(`${entry.id}: previous directory bundle identity mismatch.`),
    );
  return {
    ...staticContent(meta),
    ...(entry.lastRun === undefined ? {} : { lastRun: entry.lastRun }),
  } satisfies Last;
});

export const buildDirectory = Effect.fn("index.buildDirectory")(function* (options: {
  cwd: string;
  root: string;
  names: OfficialNames;
  entries: ReadonlyArray<IndexEntry>;
  previous: RegistryIndex | null;
  previousDirectory: DirectoryData | null;
  bundles: ReadonlyMap<string, Uint8Array>;
}) {
  const removals = yield* readRemovals(options.root);
  yield* checkRemovals({ ...options, removals });
  const registry = yield* Registry;
  const current = (yield* registry.all).filter((entry): entry is Entry => !isRejected(entry));
  yield* checkTags([
    ...current.map((entry) => ({ ...entry, tags: entry.meta.tags })),
    ...options.entries,
  ]);
  const refs = Object.entries(removals).map(([id, row]) => ({ id, ...row }));
  const historical = yield* releasedContent(options.cwd, refs, options.names);
  const removed: DirectoryData["removed"][number][] = [];
  for (const ref of refs.sort((a, b) => a.id.localeCompare(b.id, "en"))) {
    const last =
      historical.get(`${ref.kind}/${ref.id}`) ??
      (yield* previousContent({
        ...ref,
        previous: options.previous,
        directory: options.previousDirectory,
        bundles: options.bundles,
      }));
    if (last === undefined)
      return yield* Effect.fail(
        new Error(
          `removed.json: ${ref.kind}/${ref.id}: no release or previous index content; supply --previous with its last published index.`,
        ),
      );
    yield* checkTags([{ ...ref, tags: last.tags }]);
    removed.push({ ...ref, last });
  }
  return {
    formatVersion: 1,
    generatedAt: options.names.generatedAt,
    commit: options.names.commit,
    entries: yield* addedEntries(options),
    removed,
  } satisfies DirectoryData;
});
