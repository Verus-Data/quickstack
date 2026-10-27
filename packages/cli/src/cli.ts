import { Command, Flag } from "effect/cli";
import { doctorCommand } from "./commands/doctor";
import { listCommand } from "./commands/list";
import { newCommand } from "./commands/new";
import { validateCommand } from "./commands/validate";
import { SLUG } from "./version";
export const cli = Command.make(SLUG).pipe(
  Command.withSharedFlags({
    json: Flag.Boolean("json").pipe(
      Flag.withDescription(
        "Write one JSON result to stdout; a failure writes one JSON error envelope as the last stderr line.",
      ),
      Flag.withDefault(false),
    ),
  }),
  Command.withDescription("Start projects from stacks your coding agent builds and verifies."),
  Command.withSubcommands([doctorCommand, listCommand, newCommand, validateCommand]),
);
