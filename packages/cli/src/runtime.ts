import { Cause, Effect, Exit, Layer } from "effect";
import { AppConfig, type Environment } from "./config";
import { Logging } from "./logging";
import type { Host } from "./services/host";
import type { Output } from "./services/output";
import { Processes } from "./services/processes";
/**
 * Config, `output` (built over config and Host, so it can resolve the audience), logging and
 * Processes; the platform supplies FileSystem, Path, Host and Foreground.
 */
export const AppLayer = (
  output: Layer.Layer<Output, never, Host | AppConfig>,
  env?: Environment,
  releaseBuild = false,
) =>
  Layer.mergeAll(Processes.layer, Logging.layer).pipe(
    Layer.provideMerge(output),
    Layer.provideMerge(
      env === undefined ? AppConfig.layer(releaseBuild) : AppConfig.memory(env, releaseBuild),
    ),
  );

// An interrupted fiber remains interrupted after main finishes its masked cleanup.
// Map that final runtime outcome at the sole promise boundary as well.
export async function runInvocation(
  program: Effect.Effect<number>,
  signal?: AbortSignal,
): Promise<number> {
  const exit = await Effect.runPromiseExit(program, { signal });
  if (Exit.isSuccess(exit)) return exit.value;
  if (Cause.hasInterruptsOnly(exit.cause)) return 130;
  throw Cause.squash(exit.cause);
}
