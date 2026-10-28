import { SearchMetadata } from "@steamfield/stacks-format";
import { Schema } from "effect";

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
