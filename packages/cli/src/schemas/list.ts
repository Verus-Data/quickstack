import { Category, Kind } from "@steamfield/stacks-format";
import { Schema } from "effect";
import { LastRun } from "./ledger";
import { NoticeFields } from "./notice";
import { Origin } from "./origin";

export const ListRow = Schema.Struct({
  id: Schema.String,
  kind: Kind,
  name: Schema.String,
  description: Schema.String,
  tags: Schema.Array(Schema.String),
  /** Fragments only; "app" for an app. */
  category: Schema.optionalKey(Category),
  /** Fragments only. */
  appliesTo: Schema.optionalKey(Schema.Array(Schema.String)),
  origin: Origin,
  trusted: Schema.Boolean,
  shadows: Schema.Array(Origin),
  /** Latest bundled default-composition run, over every preset and agent. */
  lastRun: Schema.NullOr(LastRun),
});
export type ListRow = typeof ListRow.Type;

export const ListResult = Schema.Struct({
  ...NoticeFields,
  project: Schema.optionalKey(
    Schema.Struct({
      stack: Schema.NullOr(Schema.String),
      applied: Schema.Array(Schema.String),
      addable: Schema.Array(Schema.String),
    }),
  ),
  /** Stacks first, then fragments; each group sorted by id. */
  entries: Schema.Array(ListRow),
  /** Entries that failed to load; an agent iterating `entries` never meets one. */
  rejected: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Kind,
      origin: Origin,
      dir: Schema.String,
      error: Schema.String,
    }),
  ),
}).annotate({
  title: "List result",
  description: "Stacks and fragments an agent can choose from, and entries that failed to load",
});
export type ListResult = typeof ListResult.Type;
