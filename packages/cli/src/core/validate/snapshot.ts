import { Cache, Data, Effect } from "effect";
import { type Entry, isRejected } from "../registry/entry";
import { Registry } from "../registry/registry";

class ReadRequest extends Data.Class<{ entry: Entry; source: string }> {}

/** Repeated compositions share checked reads within this validation, never across invocations. */
export const snapshotRegistry = Effect.gen(function* () {
  const registry = yield* Registry;
  // Composition resolves bodies into fresh objects; file identity stays the loaded entry.
  const entries = new Map(
    (yield* registry.all).flatMap((entry) =>
      isRejected(entry) ? [] : [[entry.dir, entry] as const],
    ),
  );
  const original = (entry: Entry) => entries.get(entry.dir) ?? entry;
  const files = yield* Cache.make({ capacity: Number.MAX_SAFE_INTEGER, lookup: registry.files });
  const reads = yield* Cache.make({
    capacity: Number.MAX_SAFE_INTEGER,
    lookup: ({ entry, source }: { entry: Entry; source: string }) => registry.read(entry, source),
  });
  const bytes = yield* Cache.make({
    capacity: Number.MAX_SAFE_INTEGER,
    lookup: ({ entry, source }: { entry: Entry; source: string }) => registry.bytes(entry, source),
  });
  return Registry.of({
    ...registry,
    files: (entry) => Cache.get(files, original(entry)),
    read: (entry, source) => Cache.get(reads, new ReadRequest({ entry: original(entry), source })),
    bytes: (entry, source) => Cache.get(bytes, new ReadRequest({ entry: original(entry), source })),
  });
});
