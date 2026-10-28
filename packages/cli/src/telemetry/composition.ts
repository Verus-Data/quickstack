import type { EntryRef } from "@stacks/format";
import { Effect } from "effect";
import { compose } from "../core/compose/compose";
import { fingerprint } from "../core/fingerprint";
import { Registry } from "../core/registry/registry";
import { official, type ScaffoldFacts } from "./events";

const resolve = Effect.fn("telemetry.resolveEntry")(function* (input: {
  registry: Registry["Service"];
  kind: "stack" | "fragment";
  ref: EntryRef;
}): Effect.fn.Return<EntryRef> {
  const entry = yield* input.registry.get(input.kind, input.ref.id).pipe(Effect.option);
  if (entry._tag === "None") return { id: input.ref.id, origin: "unknown", trusted: false };
  return { id: entry.value.id, origin: entry.value.origin, trusted: entry.value.trusted };
});

/** An edited manifest cannot authorize ids or reuse the original scaffold's fingerprint. */
export const completeAddFacts = Effect.fn("telemetry.completeAddFacts")(function* (
  input: ScaffoldFacts,
) {
  const registry = yield* Registry;
  const stack = input.manifest.stack
    ? yield* resolve({ registry, kind: "stack", ref: input.manifest.stack })
    : null;
  const fragments = yield* Effect.forEach(input.manifest.fragments, (ref) =>
    resolve({ registry, kind: "fragment", ref }),
  );
  const { fingerprint: _previous, ...previous } = input.manifest;
  const manifest = { ...previous, stack, fragments };
  const entries = [...(stack ? [stack] : []), ...fragments];
  if (!stack || !entries.every(official)) return { ...input, manifest };
  const entry = yield* registry.get("stack", stack.id);
  const defaults = entry.meta.kind === "stack" ? entry.meta.fragments.default : [];
  const selected = new Set(fragments.map((fragment) => fragment.id));
  const composition = yield* compose({
    stack: stack.id,
    with: [...selected],
    without: defaults.filter((id) => !selected.has(id)),
    preset: manifest.preset,
    agents: manifest.agents,
    always: [],
    mode: "new",
  });
  if (composition.fragments.some((fragment) => !selected.has(fragment.id)))
    return { ...input, manifest };
  return { ...input, manifest: { ...manifest, fingerprint: yield* fingerprint(composition) } };
});
