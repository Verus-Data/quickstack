import { Effect } from "effect";
import { Command } from "effect/cli";
import { addCommand } from "./commands/add";
import { createCommand } from "./commands/create";
import { doctorCommand } from "./commands/doctor";
import { guideCommand, printGuide } from "./commands/guide";
import { listCommand } from "./commands/list";
import { newCommand } from "./commands/new";
import { root } from "./commands/root";
import { runsCommand } from "./commands/runs";
import { schemaCommand } from "./commands/schema";
import { showCommand } from "./commands/show";
import { skillCommand } from "./commands/skill";
import { updateCommand } from "./commands/update";
import { validateCommand } from "./commands/validate";
import { verifyCommand } from "./commands/verify";
import { AppConfig } from "./config";
export const cli = root.pipe(
  Command.withDescription("Start projects from stacks your coding agent builds and verifies."),
  // No subcommand: the agent guide instead of the framework's help (`--help` keeps that).
  Command.withHandler(() => printGuide),
  Command.withSubcommands([
    addCommand,
    createCommand,
    doctorCommand,
    guideCommand,
    listCommand,
    newCommand,
    runsCommand,
    schemaCommand,
    showCommand,
    skillCommand,
    updateCommand,
    validateCommand,
    verifyCommand,
  ]),
  Command.provideEffectDiscard(({ offline }) =>
    Effect.flatMap(AppConfig, (config) => config.setOffline(offline)),
  ),
);
