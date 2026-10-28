import { Effect, Option, Schema } from "effect";
import { Command } from "effect/cli";
import { guideCommands, guideText, humanLead } from "../core/guide";
import { wrap } from "../core/wrap";
import { GuideResult } from "../schemas/guide";
import { Host } from "../services/host";
import { Output } from "../services/output";

/**
 * Prints the agent guide; the root with no subcommand runs the same handler. A human first gets
 * one line saying who the guide is for and how to start a project yourself.
 */
export const printGuide = Effect.gen(function* () {
  const host = yield* Host;
  const { invocation } = host;
  const output = yield* Output;
  const text = guideText(invocation);
  const human = `${humanLead(invocation)}\n\n${text}`;
  const wrapped = Option.isSome(host.columns)
    ? wrap(human, host.columns.value, host.stringWidth)
    : human;
  yield* output.result(
    Schema.encodeSync(GuideResult)({ guide: text, commands: guideCommands(invocation) }),
    output.audience === "human" ? wrapped : text,
  );
});

export const guideCommand = Command.make("guide", {}, () => printGuide).pipe(
  Command.withDescription(
    "Print the guide for coding agents: the list, new, verify loop and the rules. Same as running stacks with no arguments. Exits 0, 2 on a usage error, 130 when interrupted.",
  ),
  Command.withShortDescription("Print the guide for coding agents."),
  Command.withExamples(({ commandPath }) => [
    { command: commandPath.join(" "), description: "Print the guide" },
    {
      command: `${commandPath.join(" ")} --json`,
      description: "Get the guide and its commands as one object",
    },
  ]),
);
