import { Command } from "effect/cli";
import { addCommand } from "./commands/add";
import { doctorCommand } from "./commands/doctor";
import { guideCommand, printGuide } from "./commands/guide";
import { listCommand } from "./commands/list";
import { newCommand } from "./commands/new";
import { root } from "./commands/root";
import { runsCommand } from "./commands/runs";
import { skillCommand } from "./commands/skill";
import { validateCommand } from "./commands/validate";
import { verifyCommand } from "./commands/verify";
export const cli = root.pipe(
  Command.withDescription("Start projects from stacks your coding agent builds and verifies."),
  // No subcommand: the agent guide instead of the framework's help (`--help` keeps that).
  Command.withHandler(() => printGuide),
  Command.withSubcommands([
    addCommand,
    doctorCommand,
    guideCommand,
    listCommand,
    newCommand,
    runsCommand,
    skillCommand,
    validateCommand,
    verifyCommand,
  ]),
);
