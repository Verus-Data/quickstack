import { Schema } from "effect";
import { NoticeFields } from "./notice";

/** What `stacks --json` with no subcommand, and `stacks guide --json`, print. */
export const GuideResult = Schema.Struct({
  ...NoticeFields,
  /** The guide's text, as human mode prints it. */
  guide: Schema.String,
  /** The commands the guide's loop uses, each with a command line to run. */
  commands: Schema.Array(
    Schema.Struct({ name: Schema.String, run: Schema.String, purpose: Schema.String }),
  ),
}).annotate({ title: "Guide result", description: "The agent guide and the commands it uses" });
export type GuideResult = typeof GuideResult.Type;
