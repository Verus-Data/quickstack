import { Effect, Option, Schema } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { showReport } from "../core/show";
import { renderShow } from "../core/show-report";
import { shownPath } from "../core/shown-path";
import { ShowReport } from "../schemas/show";
import { Host } from "../services/host";
import { Output } from "../services/output";

export const showCommand = Command.make(
  "show",
  {
    id: Argument.String("id").pipe(Argument.withDescription("Stack or fragment id to review.")),
    kind: Flag.Literals("kind", ["stack", "fragment"]).pipe(
      Flag.withDescription("Select a kind when a stack and a fragment share an id."),
      Flag.optional,
    ),
  },
  ({ id, kind }) =>
    Effect.gen(function* () {
      const output = yield* Output;
      const host = yield* Host;
      const report = yield* showReport(id, Option.getOrUndefined(kind));
      const path =
        output.audience === "agent" ? yield* shownPath(host.cwd, report.path) : report.path;
      yield* output.result(
        Schema.encodeSync(ShowReport)(report),
        renderShow({ ...report, path }, host.invocation),
      );
    }),
).pipe(
  Command.withDescription(
    "Review a stack or fragment (apps are fragments): metadata, full guidance, shipped files and its last recorded run. Reads only; starts no processes. Exits 0, or 2 on an unknown id or an id that needs --kind.",
  ),
  Command.withShortDescription("Review one stack or fragment before you use it."),
  Command.withExamples(({ commandPath }) => [
    { command: `${commandPath.join(" ")} typescript-cli`, description: "Read a stack's guidance" },
    {
      command: `${commandPath.join(" ")} postgres --json`,
      description: "Get one ShowReport object, as an agent would",
    },
    {
      command: `${commandPath.join(" ")} effect --kind fragment`,
      description: "Pick the fragment when a stack shares its id",
    },
  ]),
);
