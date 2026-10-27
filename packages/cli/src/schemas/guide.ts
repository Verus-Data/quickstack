import { Schema } from "effect";

/** What `quickstack --json` with no subcommand, and `quickstack guide --json`, print. */
export const GuideResult = Schema.Struct({
  /** The guide's text, as human mode prints it. */
  guide: Schema.String,
  /** The commands the guide's loop uses, each with a command line to run. */
  commands: Schema.Array(
    Schema.Struct({ name: Schema.String, run: Schema.String, purpose: Schema.String }),
  ),
}).annotate({ title: "Guide result", description: "The agent guide and the commands it uses" });
export type GuideResult = typeof GuideResult.Type;
