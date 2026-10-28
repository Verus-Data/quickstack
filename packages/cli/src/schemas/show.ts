import { Category, VerifyStep } from "@steamfield/stacks-format";
import { Schema } from "effect";
import { LastRun } from "./ledger";
import { ListRow } from "./list";
import { NoticeFields } from "./notice";

/** An entry's complete review surface, with canonical sizes and bundled run evidence. */
export const ShowReport = Schema.Struct({
  ...NoticeFields,
  ...ListRow.fields,
  path: Schema.String,
  deps: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  tools: Schema.Array(Schema.String),
  decisions: Schema.Array(Schema.String),
  env: Schema.Record(Schema.String, Schema.String),
  commands: Schema.Record(Schema.String, Schema.String),
  fragments: Schema.optionalKey(
    Schema.Struct({
      required: Schema.Array(Schema.String),
      default: Schema.Array(Schema.String),
      optional: Schema.Array(Schema.String),
    }),
  ),
  category: Schema.optionalKey(Category),
  requires: Schema.optionalKey(Schema.Array(Schema.String)),
  conflicts: Schema.optionalKey(Schema.Array(Schema.String)),
  requiresTools: Schema.optionalKey(Schema.Array(Schema.String)),
  needsOwnRepo: Schema.optionalKey(Schema.Boolean),
  fits: Schema.optionalKey(Schema.Array(Schema.String)),
  verify: Schema.Array(VerifyStep),
  files: Schema.Array(
    Schema.Struct({
      source: Schema.String,
      path: Schema.String,
      agent: Schema.optionalKey(Schema.String),
    }),
  ),
  body: Schema.String,
  bodyWords: Schema.Number,
  bodyCap: Schema.Number,
  briefWords: Schema.NullOr(Schema.Number),
  briefCap: Schema.Number,
  lastRun: Schema.NullOr(
    Schema.Struct({
      ...LastRun.fields,
      sameContent: Schema.Boolean,
      /** Fragments only: the stack whose composition contained this fragment. */
      stack: Schema.optionalKey(Schema.String),
    }),
  ),
});
export type ShowReport = typeof ShowReport.Type;
