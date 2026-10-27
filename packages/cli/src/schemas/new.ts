import { Schema } from "effect";
import { AgentId, Kind, Origin } from "./entry";

const EntryRef = Schema.Struct({ kind: Kind, id: Schema.String });

/** What `new` wrote and what to do next; `new --json` prints one. */
export const NewResult = Schema.Struct({
  /** The project root, absolute. */
  project: Schema.String,
  stack: Schema.String,
  /** Composition order. */
  fragments: Schema.Array(Schema.String),
  preset: Schema.Literals(["default", "sandbox"]),
  agents: Schema.Array(AgentId),
  /** Every file written, relative to the project root, sorted; OS litter is never listed. */
  written: Schema.Array(Schema.String),
  brief: Schema.Literal(".quickstacks/BRIEF.md"),
  /** `countWords` of the whole brief. */
  briefWords: Schema.Number,
  /** `countWords` of the brief's fixed text. */
  fixedWords: Schema.Number,
  /**
   * Tools not on PATH: who needs them, and the flags that would leave each out (`--without` for
   * a default fragment, dropping `--with` for one you added); empty when no flag can.
   */
  missingTools: Schema.Array(
    Schema.Struct({
      tool: Schema.String,
      owners: Schema.Array(EntryRef),
      drop: Schema.Array(
        Schema.Struct({ id: Schema.String, flag: Schema.Literals(["without", "with"]) }),
      ),
    }),
  ),
  /** Entries quickstacks doesn't trust; the brief makes the agent ask before using them. */
  untrusted: Schema.Array(
    Schema.Struct({ id: Schema.String, kind: Kind, origin: Origin, dir: Schema.String }),
  ),
  /** Composition warnings, and `git_init_failed` (`id: "git"`, with git's exit code). */
  warnings: Schema.Array(
    Schema.Struct({
      code: Schema.Literals([
        "always_not_applicable",
        "always_unknown",
        "with_not_applicable",
        "without_not_selected",
        "git_init_failed",
      ]),
      id: Schema.String,
      exitCode: Schema.optionalKey(Schema.Number),
    }),
  ),
  git: Schema.Literals(["fresh", "parent", "none"]),
  /** Whether the out-of-project state record was written; always false until 1.2b. */
  stateRecord: Schema.Boolean,
  /** `print` until 1.4: show `next` to the user or act on it. */
  handoff: Schema.Struct({ kind: Schema.Literal("print"), next: Schema.String }),
}).annotate({
  title: "New result",
  description: "A project quickstacks wrote, with its brief and the next step",
});
export type NewResult = typeof NewResult.Type;
