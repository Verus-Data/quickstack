import { Duration, Effect, FileSystem, Option, Path } from "effect";
import { AppConfig } from "../../config";
import { isNpxPath } from "../../invocation";
import { Host } from "../../services/host";
import { Processes } from "../../services/processes";
import { PACKAGE } from "../../version";

type Installation = { install: "npm-global"; npm: string } | { install: "npx" | "other" };

const detectGlobal = Effect.fn("update.detectGlobal")(function* (
  timeout: Duration.Duration,
): Effect.fn.Return<
  Installation,
  never,
  AppConfig | Host | Processes | FileSystem.FileSystem | Path.Path
> {
  const host = yield* Host;
  const config = yield* AppConfig;
  const processes = yield* Processes;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const npm = yield* processes.which("npm");
  if (Option.isNone(npm)) return { install: "other" };
  const { home } = yield* config.paths;
  const prefix = yield* processes
    .exec({
      argv: [npm.value, "prefix", "-g"],
      cwd: home,
      env: config.childEnv([]),
      timeout,
    })
    .pipe(Effect.catchTag("SpawnFailed", () => Effect.succeed(undefined)));
  if (prefix?.exitCode !== 0 || prefix.timedOut || !prefix.stdout.trim())
    return { install: "other" };
  const real = (at: string) => fs.realPath(at).pipe(Effect.option);
  const installed = yield* real(path.join(prefix.stdout.trim(), "lib", "node_modules", PACKAGE));
  const running = yield* real(host.packageRoot);
  if (Option.isSome(installed) && Option.isSome(running) && installed.value === running.value)
    return { install: "npm-global", npm: npm.value };
  return { install: "other" };
});

/** Optional detection never prevents the version report; defects and interruption still propagate. */
export const installMethod = Effect.fn("update.installMethod")(function* (
  timeout = Duration.seconds(10),
) {
  if (isNpxPath((yield* Host).packageRoot)) return { install: "npx" } satisfies Installation;
  const found = yield* detectGlobal(timeout);
  if (found.install === "other") yield* Effect.logDebug("npm global install not detected");
  return found;
});
