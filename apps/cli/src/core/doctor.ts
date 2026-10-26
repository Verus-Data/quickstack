import { Effect, Schema } from "effect";
import { AppConfig } from "../config";
import { DoctorReport } from "../schemas";
import { Host } from "../services/host";
import { VERSION } from "../version";
export const doctor = Effect.gen(function* () {
  const host = yield* Host;
  const config = yield* AppConfig;
  const paths = yield* config.paths;
  const result = yield* Effect.result(config.get);
  const configErrors = result._tag === "Failure" ? [result.failure.message] : [];
  const data = result._tag === "Success" ? (result.success.dataDir ?? paths.data) : paths.data;
  return Schema.encodeSync(DoctorReport)({
    version: VERSION,
    platform: host.platform,
    executable: host.executable,
    compiled: host.compiled,
    paths: { config: paths.config, data, cwd: host.cwd },
    configErrors,
  });
});
