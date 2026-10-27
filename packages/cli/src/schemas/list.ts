import { Schema } from "effect";
import { Category, Kind, Origin } from "./entry";

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
  /** Always null until the run ledger (2.0c) fills it. */
  lastRun: Schema.Null,
});
export type ListRow = typeof ListRow.Type;

export const ListResult = Schema.Struct({
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
