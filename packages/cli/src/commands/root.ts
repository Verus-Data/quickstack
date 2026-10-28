import { Command, Flag } from "effect/cli";

/**
 * The root command with its shared flags, before its handler and subcommands are attached in
 * `cli.ts`. A subcommand reads the shared flags with `yield* root` (`new` needs `--json` to
 * decide its handoff); the context is keyed by the command's name, so it is the same one.
 */
export const root = Command.make("stacks").pipe(
  Command.withSharedFlags({
    offline: Flag.Boolean("offline").pipe(
      Flag.withDescription("Use cached and bundled entries without network requests."),
      Flag.withDefault(false),
    ),
    json: Flag.Boolean("json").pipe(
      Flag.withDescription(
        "Write one JSON result to stdout; a failure writes one JSON error envelope as the last stderr line.",
      ),
      Flag.withDefault(false),
    ),
  }),
);
