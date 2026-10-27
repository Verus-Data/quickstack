import { Effect, Schema } from "effect";
import { Command } from "effect/cli";
import { guideCommands, guideText } from "../core/guide";
import { GuideResult } from "../schemas/guide";
import { Host } from "../services/host";
import { Output } from "../services/output";

/** Prints the agent guide; the root with no subcommand runs the same handler. */
export const printGuide = Effect.gen(function* () {
  const { invocation } = yield* Host;
  const text = guideText(invocation);
  yield* (yield* Output).result(
    Schema.encodeSync(GuideResult)({ guide: text, commands: guideCommands(invocation) }),
    text,
  );
});

export const guideCommand = Command.make("guide", {}, () => printGuide).pipe(
  Command.withDescription(
    "Print the guide for coding agents: the list, new, verify loop and the rules. Same as running quickstacks with no arguments.",
  ),
);
