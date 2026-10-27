import { Effect, Option, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { createEntry } from "../core/create";
import { shownPath } from "../core/shown-path";
import { printable } from "../core/text";
import { CreateResult } from "../schemas/create";
import { Category, type Kind, Origin } from "../schemas/entry";
import { Host } from "../services/host";
import { Output } from "../services/output";

const entryCommand = (kind: Kind) =>
  Command.make(
    kind,
    {
      id: Argument.String("id").pipe(Argument.withDescription("A lowercase kebab-case entry id.")),
      from: Flag.Literals("from", Origin.literals).pipe(
        Flag.withDescription(
          "Copy this id from bundled or project into the user registry; user is refused.",
        ),
        Flag.optional,
      ),
      ...(kind === "fragment"
        ? {
            category: Flag.Literals("category", Category.literals).pipe(
              Flag.withDescription(
                "Category for a fresh fragment. Apps need applies_to filled before validation.",
              ),
              Flag.withDefault("tooling"),
            ),
          }
        : {}),
      yes: Flag.Boolean("yes").pipe(
        Flag.withDescription(
          "Skip the trust question after the full report; requires a person and terminal for untrusted copies.",
        ),
        Flag.withDefault(false),
      ),
    },
    (flags) =>
      Effect.gen(function* () {
        const result = yield* createEntry({
          kind,
          id: flags.id,
          from: Option.getOrUndefined(flags.from),
          category: flags.category ?? "tooling",
          yes: flags.yes,
        });
        const output = yield* Output;
        const host = yield* Host;
        const path =
          output.audience === "agent" ? yield* shownPath(host.cwd, result.path) : result.path;
        const directory = `'${path.replaceAll("'", "'\\''")}'`;
        yield* output.result(
          Schema.encodeSync(CreateResult)(result),
          [
            `Created ${kind} ${printable(result.id)}: ${printable(path)}`,
            `Guide: ${printable(result.guide)}`,
            `Next: edit the entry, then run ${host.invocation} validate ${printable(directory)}.`,
          ].join("\n"),
        );
      }),
  ).pipe(
    Command.withDescription(
      `Create a ${kind} in the user registry without running any tools: a skeleton, or with --from a copy of an existing entry. Prints the entry path and the authoring guide. Exits 0, 2 on a bad id, an occupied target or an unknown source, 6 when an untrusted copy can't be confirmed by a person at a terminal, 130 when interrupted.`,
    ),
    Command.withShortDescription(`Create a ${kind} in the user registry.`),
    Command.withExamples(({ commandPath }) =>
      kind === "stack"
        ? [
            { command: `${commandPath.join(" ")} my-api`, description: "Start a stack skeleton" },
            {
              command: `${commandPath.join(" ")} go-cli --from bundled`,
              description: "Copy a bundled stack to edit",
            },
          ]
        : [
            {
              command: `${commandPath.join(" ")} my-ci --category ci`,
              description: "Start a fragment skeleton",
            },
            {
              command: `${commandPath.join(" ")} postgres --from bundled --json`,
              description: "Copy a bundled fragment and get its paths",
            },
          ],
    ),
  );

export const createCommand = Command.make("create").pipe(
  Command.withDescription("Start a stack or fragment, or copy an existing entry for editing."),
  Command.withShortDescription("Create or copy a stack or fragment for editing."),
  Command.withSubcommands([entryCommand("stack"), entryCommand("fragment")]),
);
