import { EntryBundle, type IndexEntry, type OfficialNames } from "@stacks/format";
import { Effect, Schema } from "effect";
import { decodeEntry, markdownFile } from "../../src/core/registry/entry";
import { type BundleRef, bundlePath } from "./remote";

const readBundle = Effect.fn("index.namesBundle")(function* (
  ref: BundleRef,
  bundles: ReadonlyMap<string, Uint8Array>,
) {
  const bytes = bundles.get(bundlePath(ref));
  if (bytes === undefined)
    return yield* Effect.fail(new Error(`${bundlePath(ref)}: missing names source bundle.`));
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(EntryBundle))(
    new TextDecoder().decode(bytes),
  );
});

const bundleSteps = Effect.fn("index.namesSteps")(function* (
  ref: BundleRef,
  bundles: ReadonlyMap<string, Uint8Array>,
) {
  const bundle = yield* readBundle(ref, bundles);
  const markdown = bundle.files.find((file) => file.path === markdownFile(ref.kind));
  const invalid = () => new Error(`${bundlePath(ref)}: invalid metadata for pinned names.`);
  if (markdown === undefined) return yield* Effect.fail(invalid());
  const text =
    markdown.encoding === "utf8"
      ? markdown.content
      : Buffer.from(markdown.content, "base64").toString("utf8");
  const decoded = yield* decodeEntry(ref.kind, text);
  if (decoded._tag !== "Meta" || decoded.meta.id !== ref.id) return yield* Effect.fail(invalid());
  return decoded.meta.verify.map((step) => step.name);
});

const indexedStack = Effect.fn("index.namedStack")(function* (
  stack: IndexEntry,
  bundles: ReadonlyMap<string, Uint8Array>,
) {
  const fragments = Object.keys(stack.composition ?? {}).sort();
  // Selection is already pinned by the proof; omitted sandbox defaults need not be published.
  const steps = yield* bundleSteps(stack, bundles);
  for (const [id, digest] of Object.entries(stack.composition ?? {}))
    steps.push(...(yield* bundleSteps({ kind: "fragment", id, digest }, bundles)));
  return {
    id: stack.id,
    compositions: [{ fragments, steps }],
  };
});

export const indexNames = Effect.fn("index.indexNames")(function* (
  entries: ReadonlyArray<IndexEntry>,
  bundles: ReadonlyMap<string, Uint8Array>,
) {
  const stacks: OfficialNames["sources"][number]["stacks"][number][] = [];
  for (const stack of entries.filter((entry) => entry.kind === "stack"))
    stacks.push(yield* indexedStack(stack, bundles));
  return {
    origin: "index",
    stacks,
    fragments: entries.filter((entry) => entry.kind === "fragment").map((entry) => entry.id),
  } satisfies OfficialNames["sources"][number];
});
