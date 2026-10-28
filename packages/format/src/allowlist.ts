import { Schema } from "effect";

export const Ecosystem = Schema.Literals(["npm", "pypi", "go", "crates"]);
export type Ecosystem = typeof Ecosystem.Type;

/** Strictly ascending by code unit, so sorted and free of duplicates. */
export function sortedUnique(names: ReadonlyArray<string>): boolean {
  let previous: string | undefined;
  for (const name of names) {
    if (previous !== undefined && previous >= name) return false;
    previous = name;
  }
  return true;
}

export const DependencyAllowlist = Schema.Struct({
  formatVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  names: Schema.Record(Ecosystem, Schema.Array(Schema.String)).check(
    Schema.makeFilter(
      (names) => Object.values(names).every(sortedUnique) || "names must be sorted and unique",
    ),
  ),
});
export type DependencyAllowlist = typeof DependencyAllowlist.Type;
