import {
  bundleDigest,
  EntryBundle,
  type IndexEntry,
  RegistryIndex,
  SignedIndex,
} from "@stacks/format";
import { Effect, Schema } from "effect";
import { decodeEntry } from "../../src/core/registry/entry";
import { verifySignature } from "./signing";

export type BundleRef = Pick<IndexEntry, "kind" | "id" | "digest">;
export const bundlePath = (entry: BundleRef) =>
  `v1/entries/${entry.kind}/${entry.id}/${entry.digest}.json`;

export function bundleRefs(entries: ReadonlyArray<IndexEntry>): BundleRef[] {
  const refs = new Map<string, BundleRef>();
  const add = (ref: BundleRef) => refs.set(bundlePath(ref), ref);
  for (const entry of entries) {
    add(entry);
    for (const [id, digest] of Object.entries(entry.composition ?? {}))
      add({ kind: "fragment", id, digest });
  }
  return [...refs.values()].sort((a, b) => bundlePath(a).localeCompare(bundlePath(b), "en"));
}

const fetchText = (url: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    },
    catch: () => new Error(`${url}: could not fetch file.`),
  });

export const fetchIndex = Effect.fn("index.fetchIndex")(function* (url: string) {
  const text = yield* fetchText(url);
  const envelope = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(SignedIndex))(text).pipe(
    Effect.mapError(() => new Error(`${url}: invalid SignedIndex.`)),
  );
  yield* verifySignature(envelope, url);
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(RegistryIndex))(
    envelope.payload,
  ).pipe(Effect.mapError(() => new Error(`${url}: invalid RegistryIndex payload.`)));
});

export const fetchBundle = Effect.fn("index.fetchBundle")(function* (base: string, ref: BundleRef) {
  const url = new URL(bundlePath(ref), base).href;
  const text = yield* fetchText(url);
  const bundle = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(EntryBundle))(text).pipe(
    Effect.mapError(() => new Error(`${url}: invalid EntryBundle.`)),
  );
  if (
    bundle.kind !== ref.kind ||
    bundle.id !== ref.id ||
    (yield* bundleDigest(bundle)) !== ref.digest
  )
    return yield* Effect.fail(new Error(`${url}: bundle digest or identity mismatch.`));
  return new TextEncoder().encode(text);
});

export const fetchFragment = Effect.fn("index.fetchFragment")(function* (
  base: string,
  ref: BundleRef,
) {
  const bytes = yield* fetchBundle(base, ref);
  const bundle = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(EntryBundle))(
    new TextDecoder().decode(bytes),
  );
  const file = bundle.files.find((file) => file.path === "FRAGMENT.md");
  const invalid = () => new Error(`${bundlePath(ref)}: invalid fragment metadata.`);
  if (file === undefined) return yield* Effect.fail(invalid());
  const text =
    file.encoding === "utf8" ? file.content : Buffer.from(file.content, "base64").toString("utf8");
  const decoded = yield* decodeEntry("fragment", text);
  if (decoded._tag !== "Meta" || decoded.meta.id !== ref.id) return yield* Effect.fail(invalid());
  const metadata: IndexEntry = {
    id: ref.id,
    kind: "fragment",
    digest: ref.digest,
    schemaVersion: decoded.meta.schemaVersion,
    name: decoded.meta.name,
    description: decoded.meta.description,
    tags: decoded.meta.tags,
  };
  return { metadata, bytes };
});

export const checkHost = Effect.fn("index.checkHost")(function* (base: URL) {
  const root = new URL(`${base.href.replace(/\/$/, "")}/`).href;
  const index = yield* fetchIndex(new URL("v1/index.json", root).href);
  const refs = bundleRefs(index.entries);
  for (const ref of refs) yield* fetchBundle(root, ref);
  return `Checked v1/index.json and ${refs.length} bundle(s).`;
});
