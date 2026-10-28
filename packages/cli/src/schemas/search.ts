import { Schema } from "effect";

const Words = Schema.Array(Schema.String);
const Source = Schema.Struct({
  digest: Schema.String.check(Schema.isPattern(/^sha256:[a-f0-9]{64}$/)),
  by: Schema.Literals(["author", "drafted"]),
  model: Schema.optionalKey(Schema.String),
  promptVersion: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  reviewedAt: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
});
const common = {
  schemaVersion: Schema.Literal(1),
  id: Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  source: Source,
  summary: Schema.String,
  requests: Words,
  useCases: Words,
  synonyms: Words,
  goodFor: Words,
  notFor: Words,
  caveats: Schema.optionalKey(Words),
};

/** Size limits are validation warnings; the two kinds have distinct closed fields. */
export const SearchMetadata = Schema.Union([
  Schema.Struct({
    ...common,
    kind: Schema.Literal("stack"),
    platforms: Words,
    productKinds: Words,
    languages: Words,
  }),
  Schema.Struct({ ...common, kind: Schema.Literal("fragment"), capabilities: Words }),
]);
export type SearchMetadata = typeof SearchMetadata.Type;

const Aliases = Schema.Record(
  Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  Words,
);
export const SearchVocabulary = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  platforms: Aliases,
  productKinds: Aliases,
  languages: Aliases,
  capabilities: Aliases,
});
export type SearchVocabulary = typeof SearchVocabulary.Type;

/** The signed publication may annotate cards stale against a carried-forward bundle. */
export const SearchIndex = Schema.Struct({
  formatVersion: Schema.Literal(1),
  entries: Schema.Array(
    Schema.Union(
      SearchMetadata.members.map((member) =>
        Schema.Struct({ ...member.fields, stale: Schema.optionalKey(Schema.Boolean) }),
      ),
    ),
  ),
});
export type SearchIndex = typeof SearchIndex.Type;
