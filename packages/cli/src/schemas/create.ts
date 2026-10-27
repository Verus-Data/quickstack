import { Schema } from "effect";
import { Kind } from "./entry";

/** The entry written in the user registry, and its companion guide; both paths are absolute. */
export const CreateResult = Schema.Struct({
  kind: Kind,
  id: Schema.String,
  path: Schema.String,
  guide: Schema.String,
});
export type CreateResult = typeof CreateResult.Type;
