import { Effect, Option, Path, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { readLedger } from "../core/ledger";
import { type Group, groups, listResult, projectChoices, toRow } from "../core/list";
import { renderAddable, renderList } from "../core/list-report";
import { MANIFEST_PATH, readManifest } from "../core/manifest";
import { type Entry, isRejected } from "../core/registry/entry";
import { defaultRoots, Registry } from "../core/registry/registry";
import { shellArg } from "../core/shell";
import { shownPath } from "../core/shown-path";
import { closest } from "../core/suggest";
import { printable } from "../core/text";
import { Usage } from "../errors";
import { METADATA_DIR } from "../project-layout";
import { ListResult } from "../schemas/list";
import { Host } from "../services/host";
import { Output } from "../services/output";

const isGroup = (value: string): value is Group =>
  (groups as ReadonlyArray<string>).includes(value);

export const listCommand = Command.make(
  "list",
  {
    dir: Flag.String("dir").pipe(
      Flag.withDescription("Project directory to list from. Defaults to the current directory."),
      Flag.optional,
    ),
    group: Argument.String("group").pipe(
      Argument.withDescription(
        "Show one group: stacks, fragments (apps excluded) or apps. Omit it to show all three.",
      ),
      Argument.optional,
    ),
  },
  ({ group, dir }) =>
    Effect.gen(function* () {
      const typed = yield* selectedGroup(group);
      const host = yield* Host;
      const path = yield* Path.Path;
      const projectRoot = path.resolve(
        host.cwd,
        Option.getOrElse(dir, () => "."),
      );
      const output = yield* Output;
      const manifestFile = path.join(projectRoot, MANIFEST_PATH);
      const manifest = yield* readManifest(manifestFile).pipe(
        Effect.catchTag("NotFound", () => Effect.succeed(undefined)),
        Effect.catchTags({
          InvalidConfig: () =>
            output
              .note(
                `Warning: invalid manifest or schema version at ${printable(manifestFile)}; using the full registry.`,
              )
              .pipe(Effect.as(undefined)),
          PermissionDenied: () =>
            output
              .note(
                `Warning: unreadable manifest at ${printable(manifestFile)}; using the full registry.`,
              )
              .pipe(Effect.as(undefined)),
        }),
      );
      const roots = (yield* defaultRoots).map((entry) =>
        entry.origin === "project"
          ? { ...entry, path: path.join(projectRoot, METADATA_DIR) }
          : entry,
      );
      const bundled = roots.find((root) => root.origin === "bundled");
      const ledger = bundled ? yield* readLedger(bundled.path) : undefined;
      const records = ledger?.records ?? [];
      const items = yield* Registry.pipe(
        Effect.flatMap((registry) => registry.all),
        Effect.provide(Registry.layer(roots)),
      );
      const result = listResult(items, typed, records);
      const all = items
        .filter((item): item is Entry => !isRejected(item))
        .map((entry) => toRow(entry, records));
      const { project, addable } = projectChoices(all, manifest);
      const agent = output.audience === "agent";
      // A human's descriptions wrap to the terminal; an agent's stay on one line each.
      const width = descriptionWidth(agent, host);
      const rejected = agent
        ? yield* Effect.forEach(result.rejected, (entry) =>
            Effect.map(shownPath(host.cwd, entry.dir), (dir) => ({ ...entry, dir })),
          )
        : result.rejected;
      const selectedDir = Option.getOrUndefined(dir);
      const dirFlag = selectedDir === undefined ? "" : ` --dir ${printable(shellArg(selectedDir))}`;
      yield* output.result(
        Schema.encodeSync(ListResult)({ ...result, ...(project ? { project } : {}) }),
        manifest && typed === undefined
          ? renderAddable({ addable, rejected, width, invocation: host.invocation, dirFlag })
          : renderList({ ...result, rejected }, all, {
              group: typed,
              width,
              invocation: host.invocation,
              ledgerPresent: ledger?.present ?? false,
            }),
      );
    }),
).pipe(
  Command.withDescription(
    "List the stacks, fragments and apps you can build from, with where each comes from and whether it is trusted. Inside a project, the default view shows the fragments you can still add. Exits 0, 2 on an unknown group, 6 when a registry root can't be read, 130 when interrupted.",
  ),
  Command.withShortDescription("List the stacks, fragments and apps you can build from."),
  Command.withExamples(({ commandPath }) => [
    {
      command: commandPath.join(" "),
      description: "Show every group, or addable fragments in a project",
    },
    { command: `${commandPath.join(" ")} stacks`, description: "Show only the stacks" },
    {
      command: `${commandPath.join(" ")} --json`,
      description: "Get the full registry as one ListResult object",
    },
  ]),
);

function descriptionWidth(
  agent: boolean,
  host: { stdoutIsTTY: boolean; stdoutColumns?: number },
): number {
  if (agent) return Number.POSITIVE_INFINITY;
  if (host.stdoutIsTTY && host.stdoutColumns) return Math.min(80, Math.max(20, host.stdoutColumns));
  return 80;
}
const selectedGroup = (group: Option.Option<string>) =>
  Effect.gen(function* () {
    const typed = Option.getOrUndefined(group);
    if (typed !== undefined && !isGroup(typed))
      return yield* new Usage({ details: { command: typed, suggestions: closest(typed, groups) } });
    return typed;
  });
