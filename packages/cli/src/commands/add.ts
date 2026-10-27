import { Effect, Option, Path, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { add } from "../core/add";
import { renderAdd } from "../core/add/report";
import { defaultRoots, Registry } from "../core/registry/registry";
import { INCOMING, METADATA_DIR } from "../project-layout";
import { AddResult } from "../schemas/add";
import { Host } from "../services/host";
import { completeHandoff, prepareHandoff, projectFlags } from "./handoff";
import { root } from "./root";

export const addCommand = Command.make(
  "add",
  {
    fragments: Argument.String("fragment").pipe(
      Argument.withDescription("One or more fragments to apply (see list fragments)."),
      Argument.atLeast(1),
    ),
    dir: Flag.String("dir").pipe(
      Flag.withDescription("Existing project directory. Defaults to the current directory."),
      Flag.optional,
    ),
    ...projectFlags("add"),
  },
  (flags) =>
    Effect.gen(function* () {
      const host = yield* Host;
      const path = yield* Path.Path;
      const { json } = yield* root;
      const handoff = yield* prepareHandoff(flags, json);
      const project = path.resolve(
        host.cwd,
        Option.getOrElse(flags.dir, () => "."),
      );
      const roots = (yield* defaultRoots).map((entry) =>
        entry.origin === "project" ? { ...entry, path: path.join(project, METADATA_DIR) } : entry,
      );
      const { result, decision } = yield* add({
        root: project,
        fragments: flags.fragments,
        sandbox: flags.sandbox,
        yes: flags.yes,
        agents: flags.agents.length ? flags.agents : undefined,
        handoff,
      }).pipe(Effect.provide(Registry.layer(roots)));
      yield* completeHandoff({
        project: result.project,
        untrusted: result.untrusted,
        decision,
        render: (context) =>
          renderAdd(
            { ...result, untrusted: context.untrusted },
            { ...context, invocation: host.invocation },
          ),
        encode: (handoff) => Schema.encodeSync(AddResult)({ ...result, handoff }),
      });
    }),
).pipe(
  Command.withDescription(
    `Apply fragments to an existing repository without overwriting live files. Conflicts are parked under ${INCOMING}/ for your agent to merge; verify checks the whole project.`,
  ),
);
