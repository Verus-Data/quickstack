import { Command, Flag } from "effect/cli";
import { doctorCommand } from "./commands/doctor";
import { SLUG } from "./version";
export const cli = Command.make(SLUG).pipe(
  Command.withSharedFlags({ json: Flag.Boolean("json").pipe(Flag.withDefault(false)) }),
  Command.withDescription("Local Effect CLI foundation."),
  Command.withSubcommands([doctorCommand]),
);
