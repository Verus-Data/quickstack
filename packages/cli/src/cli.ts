import { Command, Flag } from "effect/cli";
import { doctorCommand } from "./commands/doctor";
import { listCommand } from "./commands/list";
import { newCommand } from "./commands/new";
import { validateCommand } from "./commands/validate";
import { verifyCommand } from "./commands/verify";
import { SLUG } from "./version";
export const cli = Command.make(SLUG).pipe(
  Command.withSharedFlags({ json: Flag.Boolean("json").pipe(Flag.withDefault(false)) }),
  Command.withDescription("Start projects from stacks your coding agent builds and verifies."),
  Command.withSubcommands([doctorCommand, listCommand, newCommand, validateCommand, verifyCommand]),
);
