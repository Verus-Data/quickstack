import { Effect } from "effect";
import { Command } from "effect/cli";
import { doctor } from "../core/doctor";
import type { RemoteStatus } from "../schemas/remote-index";
import { Output } from "../services/output";
export const doctorCommand = Command.make("doctor", {}, () =>
  Effect.gen(function* () {
    const report = yield* doctor;
    const output = yield* Output;
    yield* output.result(
      report,
      `stacks ${report.version}\nPlatform: ${report.platform}\nConfig: ${report.paths.config}\nData: ${report.paths.data}\nUser entries: ${report.paths.user}\nRegistry: ${report.registry.path}${report.registry.found ? "" : " (not found)"}\nSkill: ${report.skill.path}${report.skill.found ? "" : " (not found)"}\nRemote index: ${remoteMode(report.remoteIndex)}; ${report.remoteIndex.lastOutcome ?? "not fetched"}\nIndex cached: ${report.remoteIndex.cachedAt ?? "never"}\n${report.configErrors.length ? report.configErrors.join("\n") : "Configuration: ok"}`,
    );
  }),
).pipe(
  Command.withDescription(
    "Inspect local runtime, paths and optional configuration: version, platform, config and data paths, the bundled registry and skill. A broken config file is reported, not fatal. Exits 0, 2 on a usage error, 130 when interrupted.",
  ),
  Command.withShortDescription("Inspect the local runtime, paths and configuration."),
  Command.withExamples(({ commandPath }) => [
    { command: commandPath.join(" "), description: "Print the diagnostics" },
    { command: `${commandPath.join(" ")} --json`, description: "Get one DoctorReport object" },
  ]),
);

function remoteMode(status: RemoteStatus): string {
  if (status.url === null) return "off";
  return status.offline ? "offline" : "enabled";
}
