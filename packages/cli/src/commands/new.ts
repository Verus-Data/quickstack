import { Effect, Option, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { defaultRoots, Registry } from "../core/registry/registry";
import { scaffold } from "../core/scaffold/new";
import { renderNew } from "../core/scaffold/report";
import { Usage } from "../errors";
import { BRIEF_PATH } from "../project-layout";
import { NewResult } from "../schemas/new";
import { completeHandoff, prepareHandoff, projectFlags, splitValues } from "./handoff";
import { root } from "./root";

const ids = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.atLeast(0), Flag.map(splitValues));

const { launch, noLaunch, ...sharedFlags } = projectFlags("new");

export const newCommand = Command.make(
  "new",
  {
    stack: Argument.String("stack").pipe(
      Argument.withDescription("The stack to start from (see `list stacks`)."),
    ),
    dir: Argument.String("dir").pipe(
      Argument.withDescription(
        "The project directory: missing, empty, or holding only .git and OS files such as .DS_Store. Defaults to the slug of --name, else ./<stack>; `.` is the current directory.",
      ),
      Argument.optional,
    ),
    name: Flag.String("name").pipe(
      Flag.withDescription("Project name for templates. Default: the directory's base name."),
      Flag.optional,
    ),
    author: Flag.String("author").pipe(
      Flag.withDescription(
        "Author for templates. Default: the author setting, then git user.name, else empty. An empty value suppresses the fallback.",
      ),
      Flag.optional,
    ),
    dryRun: Flag.Boolean("dry-run").pipe(
      Flag.withDescription(
        "Compose and render the plan without writing anything or starting an agent.",
      ),
      Flag.withDefault(false),
    ),
    preset: Flag.Literals("preset", ["default", "sandbox"]).pipe(
      Flag.withDescription(
        "Composition preset. Default: the preset setting, else default. Sandbox implies --yes.",
      ),
      Flag.optional,
    ),
    with: ids("with", "Add optional fragments, comma-separated or repeated."),
    without: ids("without", "Leave out default fragments, comma-separated or repeated."),
    ...sharedFlags,
    scope: Flag.String("scope").pipe(
      Flag.withDescription(
        "npm scope for the package_scope template variable, with or without @. Default: the package_scope setting, else none.",
      ),
      Flag.optional,
    ),
    launch,
    noLaunch,
  },
  (flags) =>
    Effect.gen(function* () {
      const { json } = yield* root;
      const preset = Option.getOrUndefined(flags.preset);
      if (flags.sandbox && preset === "default")
        return yield* new Usage({ details: { flags: ["--sandbox", "--preset default"] } });
      const handoff = yield* prepareHandoff(flags, json);
      const { result, decision } = yield* scaffold({
        stack: flags.stack,
        dir: Option.getOrUndefined(flags.dir),
        name: Option.getOrUndefined(flags.name),
        author: Option.getOrUndefined(flags.author),
        dryRun: flags.dryRun,
        with: flags.with,
        without: flags.without,
        sandbox: flags.sandbox,
        preset,
        yes: flags.yes,
        agents: flags.agents.length ? flags.agents : undefined,
        scope: Option.getOrUndefined(flags.scope),
        handoff,
      }).pipe(Effect.provide(Registry.layer(yield* defaultRoots)));
      yield* completeHandoff({
        project: result.project,
        agent: result.agents[0],
        untrusted: result.untrusted,
        decision,
        preview: result.dryRun,
        render: (context) => renderNew({ ...result, untrusted: context.untrusted }, context),
        encode: (handoff) => Schema.encodeSync(NewResult)({ ...result, handoff }),
      });
    }),
).pipe(
  Command.withDescription(
    `Start a project from a stack: write its starter files and ${BRIEF_PATH}, the task for your coding agent. Runs nothing from the stack; verify is the definition of done.`,
  ),
);
