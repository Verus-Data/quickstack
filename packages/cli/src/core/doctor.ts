import { Effect, FileSystem, Path, Schema } from "effect";
import { AppConfig } from "../config";
import { DoctorReport } from "../schemas";
import { Host } from "../services/host";
import { VERSION } from "../version";
import { bundledRoot } from "./registry/registry";
export const doctor = Effect.gen(function* () {
  const host = yield* Host;
  const config = yield* AppConfig;
  const paths = yield* config.paths;
  const registry = yield* bundledRoot;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const skillFound = yield* fs.stat(path.join(host.skill, "SKILL.md")).pipe(
    Effect.map((info) => info.type === "File"),
    Effect.orElseSucceed(() => false),
  );
  const result = yield* Effect.result(config.get);
  const configErrors = result._tag === "Failure" ? [result.failure.message] : [];
  const data = result._tag === "Success" ? (result.success.dataDir ?? paths.data) : paths.data;
  return Schema.encodeSync(DoctorReport)({
    version: VERSION,
    platform: host.platform,
    executable: host.executable,
    paths: { config: paths.config, data, cache: paths.cache, cwd: host.cwd, user: paths.user },
    registry: { path: registry.path, found: registry.found },
    skill: { path: host.skill, found: skillFound },
    configErrors,
  });
});
