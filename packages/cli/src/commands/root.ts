import { Command, Flag } from "effect/cli";
import { SLUG } from "../version";

/**
 * The root command with its shared flags, before its handler and subcommands are attached in
 * `cli.ts`. A subcommand reads the shared flags with `yield* root` (`new` needs `--json` to
 * decide its handoff); the context is keyed by the command's name, so it is the same one.
 */
export const root = Command.make(SLUG).pipe(
  Command.withSharedFlags({
    json: Flag.Boolean("json").pipe(
      Flag.withDescription(
        "Write one JSON result to stdout; a failure writes one JSON error envelope as the last stderr line.",
      ),
      Flag.withDefault(false),
    ),
  }),
);
