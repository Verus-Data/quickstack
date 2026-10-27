import { Effect, Schema } from "effect";
import { Command, Flag } from "effect/cli";
import { shownPath } from "../core/shown-path";
import { installSkill } from "../core/skill";
import { printable } from "../core/text";
import { SkillResult } from "../schemas/skill";
import { Host } from "../services/host";
import { Output } from "../services/output";

const install = Command.make(
  "install",
  {
    project: Flag.Boolean("project").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Install under the git toplevel, or the working directory outside git."),
    ),
    force: Flag.Boolean("force").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Replace an installed SKILL.md whose content differs."),
    ),
    print: Flag.Boolean("print").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "Print the bundled skill without looking up or writing an install target.",
      ),
    ),
  },
  (options) =>
    Effect.gen(function* () {
      const result = yield* installSkill(options);
      const host = yield* Host;
      const output = yield* Output;
      let shown = result.path ?? "";
      if (result.path && output.audience === "agent")
        shown = yield* shownPath(host.cwd, result.path);
      yield* output.result(
        Schema.encodeSync(SkillResult)(result),
        result.action === "printed"
          ? (result.text ?? "").replace(/\n$/, "")
          : `${result.action === "written" ? "Installed" : "Unchanged"}: ${printable(shown)}`,
      );
    }),
).pipe(
  Command.withDescription(
    "Install the bundled Claude Code skill (default: $HOME/.claude/skills/quickstacks/SKILL.md). Other agents can take the text from --print. Exits 0 when written, unchanged or printed, 2 when a different SKILL.md is already there (TargetNotEmpty; --force replaces it) or the bundled skill is missing, 6 when HOME is unset or the target can't be written, 130 when interrupted.",
  ),
  Command.withShortDescription("Install the agent skill for Claude Code."),
  Command.withExamples(({ commandPath }) => [
    { command: commandPath.join(" "), description: "Install for your user" },
    {
      command: `${commandPath.join(" ")} --project`,
      description: "Install into the current repository's .claude/skills/",
    },
    {
      command: `${commandPath.join(" ")} --print`,
      description: "Print the skill to copy somewhere else",
    },
  ]),
);

export const skillCommand = Command.make("skill").pipe(
  Command.withDescription("Manage the bundled quickstacks agent skill."),
  Command.withShortDescription("Manage the bundled agent skill."),
  Command.withSubcommands([install]),
);
