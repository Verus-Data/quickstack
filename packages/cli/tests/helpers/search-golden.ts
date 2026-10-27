import { Schema } from "effect";

const EntryRef = Schema.Struct({
  kind: Schema.Literals(["stack", "fragment"]),
  id: Schema.String,
});

const Query = Schema.Struct({
  id: Schema.String,
  pool: Schema.Literals([
    "platform",
    "product",
    "paraphrase",
    "trap",
    "fragment",
    "combined",
    "no-match",
  ]),
  split: Schema.Literals(["tune", "holdout"]),
  query: Schema.String,
  first: Schema.optionalKey(EntryRef),
  noMatch: Schema.optionalKey(Schema.Boolean),
  relevant: Schema.Array(Schema.Struct({ ...EntryRef.fields, grade: Schema.Literals([1, 2]) })),
});

export const GoldenSet = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  gate: Schema.Struct({
    mrr: Schema.Number,
    recallAt3: Schema.Number,
    fragmentRecallAt5: Schema.Number,
  }),
  queries: Schema.Array(Query),
});
export type GoldenSet = typeof GoldenSet.Type;
