import { Cache, Data, Effect } from "effect";
import type { Entry } from "../registry/entry";
import { Registry } from "../registry/registry";

class ReadRequest extends Data.Class<{ entry: Entry; source: string }> {}

/** Repeated compositions share checked reads within this validation, never across invocations. */
export const snapshotRegistry = Effect.gen(function* () {
  const registry = yield* Registry;
  const files = yield* Cache.make({ capacity: Number.MAX_SAFE_INTEGER, lookup: registry.files });
  const reads = yield* Cache.make({
    capacity: Number.MAX_SAFE_INTEGER,
    lookup: ({ entry, source }: { entry: Entry; source: string }) => registry.read(entry, source),
  });
  return Registry.of({
    ...registry,
    files: (entry) => Cache.get(files, entry),
    read: (entry, source) => Cache.get(reads, new ReadRequest({ entry, source })),
  });
});
