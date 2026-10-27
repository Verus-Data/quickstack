import { Command } from "effect/cli";
import { doctorCommand } from "./commands/doctor";
import { guideCommand, printGuide } from "./commands/guide";
import { listCommand } from "./commands/list";
import { newCommand } from "./commands/new";
import { root } from "./commands/root";
import { validateCommand } from "./commands/validate";
import { verifyCommand } from "./commands/verify";
export const cli = root.pipe(
  Command.withDescription("Start projects from stacks your coding agent builds and verifies."),
  // No subcommand: the agent guide instead of the framework's help (`--help` keeps that).
  Command.withHandler(() => printGuide),
  Command.withSubcommands([
    doctorCommand,
    guideCommand,
    listCommand,
    newCommand,
    validateCommand,
    verifyCommand,
  ]),
);
