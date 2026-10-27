import { Effect, Option, Path, Schema } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";
import { defaultRoots, Registry } from "../core/registry/registry";
import { scaffold } from "../core/scaffold/new";
import { renderNew } from "../core/scaffold/report";
import { AgentId } from "../schemas/entry";
import { NewResult } from "../schemas/new";
import { Host } from "../services/host";
import { Output } from "../services/output";

/** Repeatable, comma-separated values: `--with a,b --with c` is `[a, b, c]`. */
const list = (values: ReadonlyArray<string>) =>
  values.flatMap((value) => value.split(",").map((part) => part.trim())).filter(Boolean);

const ids = (name: string, description: string) =>
  Flag.String(name).pipe(
    Flag.withDescription(description),
    Flag.atLeast(0),
    Flag.map((values) => list(values)),
  );

const isAgent = Schema.is(AgentId);

export const newCommand = Command.make(
  "new",
  {
    stack: Argument.String("stack").pipe(
      Argument.withDescription("The stack to start from (see `list stacks`)."),
    ),
    dir: Argument.String("dir").pipe(
      Argument.withDescription(
        "The project directory: missing, empty, or holding only .git and OS files such as .DS_Store. Defaults to ./<stack>; `.` is the current directory.",
      ),
      Argument.optional,
    ),
    with: ids("with", "Add optional fragments, comma-separated or repeated."),
    without: ids("without", "Leave out default fragments, comma-separated or repeated."),
    sandbox: Flag.Boolean("sandbox").pipe(
      Flag.withDescription(
        "Local only: every default, no deploy, release or app fragments unless named with --with, steps tagged prod skipped. Implies --yes.",
      ),
      Flag.withDefault(false),
    ),
    yes: Flag.Boolean("yes").pipe(
      Flag.withDescription(
        "The brief tells the agent to take every decision's default instead of asking you.",
      ),
      Flag.withDefault(false),
    ),
    agents: Flag.String("agents").pipe(
      Flag.withDescription(
        "Agents to write adapter files for: claude, codex, opencode, cursor (comma-separated). Default: the agents setting, else claude.",
      ),
      Flag.atLeast(0),
      Flag.mapEffect((values) => {
        const named = list(values);
        const bad = named.find((value) => !isAgent(value));
        return bad === undefined
          ? Effect.succeed(named.filter(isAgent))
          : Effect.fail(
              new CliError.InvalidValue({
                option: "agents",
                value: bad,
                expected: "claude, codex, opencode or cursor",
                kind: "flag",
              }),
            );
      }),
    ),
    scope: Flag.String("scope").pipe(
      Flag.withDescription(
        "npm scope for the package_scope template variable, with or without @. Default: the package_scope setting, else none.",
      ),
      Flag.optional,
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const host = yield* Host;
      const path = yield* Path.Path;
      const result = yield* scaffold({
        stack: flags.stack,
        dir: Option.getOrUndefined(flags.dir),
        with: flags.with,
        without: flags.without,
        sandbox: flags.sandbox,
        yes: flags.yes,
        agents: flags.agents.length ? flags.agents : undefined,
        scope: Option.getOrUndefined(flags.scope),
      }).pipe(Effect.provide(Registry.layer(yield* defaultRoots)));
      const relative = path.relative(host.cwd, result.project);
      const shown =
        relative === ""
          ? "."
          : relative.startsWith("..") || path.isAbsolute(relative)
            ? result.project
            : relative;
      yield* (yield* Output).result(
        Schema.encodeSync(NewResult)(result),
        renderNew(result, { shown }),
      );
    }),
).pipe(
  Command.withDescription(
    "Start a project from a stack: write its starter files and .quickstacks/BRIEF.md, the task for your coding agent. Runs nothing from the stack; verify is the definition of done.",
  ),
);
