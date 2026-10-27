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
      const shown = result.path
        ? output.audience === "agent"
          ? yield* shownPath(host.cwd, result.path)
          : result.path
        : "";
      yield* output.result(
        Schema.encodeSync(SkillResult)(result),
        result.action === "printed"
          ? (result.text ?? "").replace(/\n$/, "")
          : `${result.action === "written" ? "Installed" : "Unchanged"}: ${printable(shown)}`,
      );
    }),
).pipe(
  Command.withDescription(
    "Install the bundled Claude Code skill (default: $HOME/.claude/skills/quickstacks/SKILL.md).",
  ),
);

export const skillCommand = Command.make("skill").pipe(
  Command.withDescription("Manage the bundled quickstacks agent skill."),
  Command.withSubcommands([install]),
);
