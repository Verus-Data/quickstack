import { Schema } from "effect";
import { Kebab, Kind, Phase, StepLayer } from "./entry.js";
import { LastRun } from "./index-schema.js";

/** Static content retained for an entry after it leaves the directory. */
const DirectoryLast = Schema.Struct({
  version: Schema.optionalKey(Schema.String),
  name: Schema.String,
  description: Schema.String,
  tags: Schema.Array(Schema.String),
  steps: Schema.Array(
    Schema.Struct({
      name: Kebab,
      phase: Phase,
      layer: Schema.optionalKey(StepLayer),
      run: Schema.String,
    }),
  ),
  lastRun: Schema.optionalKey(LastRun),
});

/** Git-derived directory facts, wrapped in the same SignedIndex envelope as the index. */
export const DirectoryData = Schema.Struct({
  formatVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  commit: Schema.String,
  entries: Schema.Array(Schema.Struct({ id: Kebab, kind: Kind, addedAt: Schema.String })),
  removed: Schema.Array(
    Schema.Struct({
      id: Kebab,
      kind: Kind,
      removedAt: Schema.String,
      reason: Schema.String,
      replacedBy: Schema.optionalKey(Kebab),
      last: DirectoryLast,
    }),
  ),
});
export type DirectoryData = typeof DirectoryData.Type;
