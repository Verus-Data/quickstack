import { EntryBundle } from "@stacks/format";
import { Effect, Schema } from "effect";
import { type BundleRef, bundlePath } from "./remote";

/** Decode an already selected immutable bundle for publication's auxiliary files. */
export const readBundle = Effect.fn("index.readBundle")(function* (
  ref: BundleRef,
  bundles: ReadonlyMap<string, Uint8Array>,
) {
  const bytes = bundles.get(bundlePath(ref));
  if (bytes === undefined)
    return yield* Effect.fail(new Error(`${bundlePath(ref)}: missing selected bundle.`));
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(EntryBundle))(
    new TextDecoder().decode(bytes),
  );
});
