import type { IndexEntry } from "@stacks/format";
import { Effect } from "effect";
import { decodeEntry, markdownFile } from "../../src/core/registry/entry";
import { searchSourceDigest } from "../../src/core/search/digest";
import { decodeSidecar, readSearchFile, sidecarPath } from "../../src/core/search/sidecar";
import type { SearchIndex } from "../../src/schemas/search";
import { readBundle } from "./bundle";

export const indexSearch = Effect.fn("index.search")(function* (options: {
  root: string;
  entries: ReadonlyArray<IndexEntry>;
  bundles: ReadonlyMap<string, Uint8Array>;
  previous: SearchIndex | null;
}) {
  const entries: SearchIndex["entries"][number][] = [];
  for (const ref of options.entries) {
    const bytes = yield* readSearchFile(options.root, sidecarPath(ref));
    const card =
      bytes === undefined
        ? options.previous?.entries.find((card) => card.kind === ref.kind && card.id === ref.id)
        : yield* decodeSidecar(bytes);
    const invalid = () =>
      new Error(`${sidecarPath(ref)}: missing or invalid indexed search metadata.`);
    if (card === undefined || card.kind !== ref.kind || card.id !== ref.id)
      return yield* Effect.fail(invalid());
    const bundle = yield* readBundle(ref, options.bundles);
    const file = bundle.files.find((file) => file.path === markdownFile(ref.kind));
    if (file === undefined) return yield* Effect.fail(invalid());
    const text =
      file.encoding === "utf8"
        ? file.content
        : Buffer.from(file.content, "base64").toString("utf8");
    const decoded = yield* decodeEntry(ref.kind, text);
    if (decoded._tag !== "Meta") return yield* Effect.fail(invalid());
    const digest = searchSourceDigest({
      kind: ref.kind,
      id: ref.id,
      meta: decoded.meta,
      body: decoded.body,
    });
    // Drop any previous publication's stale annotation before comparing with this bundle.
    const { stale: _stale, ...current } = { stale: false, ...card };
    entries.push({ ...current, ...(card.source.digest === digest ? {} : { stale: true }) });
  }
  return { formatVersion: 1, entries } satisfies SearchIndex;
});
