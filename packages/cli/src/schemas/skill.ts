import { Schema } from "effect";

export const SkillResult = Schema.Struct({
  path: Schema.NullOr(Schema.String),
  action: Schema.Literals(["written", "unchanged", "printed"]),
  text: Schema.optionalKey(Schema.String),
});
export type SkillResult = typeof SkillResult.Type;
