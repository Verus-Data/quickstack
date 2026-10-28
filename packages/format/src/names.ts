import { Schema } from "effect";
import { Kebab } from "./entry.js";

export const NamedComposition = Schema.Struct({
  fragments: Schema.Array(Kebab),
  steps: Schema.Array(Schema.String),
});
export type NamedComposition = typeof NamedComposition.Type;

export const OfficialNames = Schema.Struct({
  formatVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  commit: Schema.String,
  sources: Schema.Array(
    Schema.Struct({
      origin: Schema.Literals(["release", "index"]),
      version: Schema.optionalKey(Schema.String),
      stacks: Schema.Array(
        Schema.Struct({ id: Kebab, compositions: Schema.Array(NamedComposition) }),
      ),
      fragments: Schema.Array(Kebab),
    }),
  ),
});
export type OfficialNames = typeof OfficialNames.Type;
