import { Effect, Schema } from "effect";
import { Command } from "effect/cli";
import { projectRuns, renderRuns } from "../core/runs";
import { ProjectRuns } from "../schemas/runs";
import { Host } from "../services/host";
import { Output } from "../services/output";

export const runsCommand = Command.make("runs", {}, () =>
  Effect.gen(function* () {
    const result = yield* projectRuns((yield* Host).cwd);
    yield* (yield* Output).result(Schema.encodeSync(ProjectRuns)(result), renderRuns(result));
  }),
).pipe(Command.withDescription("Show this project's verify history, timings and interventions."));
