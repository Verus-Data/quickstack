import { Schema } from "effect";
import { NoticeFields } from "./notice";

export const SkillResult = Schema.Struct({
  ...NoticeFields,
  path: Schema.NullOr(Schema.String),
  action: Schema.Literals(["written", "unchanged", "printed"]),
  text: Schema.optionalKey(Schema.String),
});
export type SkillResult = typeof SkillResult.Type;
