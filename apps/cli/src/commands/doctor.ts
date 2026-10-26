import { Effect } from "effect";
import { Command } from "effect/cli";
import { doctor } from "../core/doctor";
import { Output } from "../services/output";
export const doctorCommand = Command.make("doctor", {}, () =>
  Effect.gen(function* () {
    const report = yield* doctor;
    const output = yield* Output;
    yield* output.result(
      report,
      `quickstacks ${report.version}\nPlatform: ${report.platform}\nCompiled: ${report.compiled}\nConfig: ${report.paths.config}\nData: ${report.paths.data}\n${report.configErrors.length ? report.configErrors.join("\n") : "Configuration: ok"}`,
    );
  }),
).pipe(Command.withDescription("Inspect local runtime, paths and optional configuration."));
