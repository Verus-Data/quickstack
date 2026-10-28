import type { NamedComposition, OfficialNames } from "@stacks/format";

type Source = OfficialNames["sources"][number];
type Stack = Source["stacks"][number];

const compositionKey = (value: NamedComposition) =>
  JSON.stringify([[...value.fragments].sort(), [...value.steps].sort()]);

function mergeStack(previous: Stack | undefined, current: Stack): Stack {
  const compositions = new Map(
    [...(previous?.compositions ?? []), ...current.compositions].map((value) => [
      compositionKey(value),
      value,
    ]),
  );
  return { id: current.id, compositions: [...compositions.values()] };
}

function mergeSource(previous: Source | undefined, current: Source): Source {
  const stacks = new Map<string, Stack>();
  for (const stack of [...(previous?.stacks ?? []), ...current.stacks])
    stacks.set(stack.id, mergeStack(stacks.get(stack.id), stack));
  return {
    ...current,
    fragments: [...new Set([...(previous?.fragments ?? []), ...current.fragments])].sort(),
    stacks: [...stacks.values()].sort((a, b) => a.id.localeCompare(b.id, "en")),
  };
}

/** Preserve published names, including entries and step names that never reached a release tag. */
export function mergeNames(current: OfficialNames, previous: OfficialNames | null): OfficialNames {
  const sources = new Map<string, Source>();
  for (const source of [...(previous?.sources ?? []), ...current.sources]) {
    const key = JSON.stringify([source.origin, source.version]);
    sources.set(key, mergeSource(sources.get(key), source));
  }
  return { ...current, sources: [...sources.values()] };
}
