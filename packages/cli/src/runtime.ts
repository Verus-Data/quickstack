import { Cause, Effect, Exit, Layer } from "effect";
import { AppConfig, type Environment } from "./config";
import { Logging } from "./logging";
export const AppLayer = (env?: Environment) =>
  Layer.merge(env === undefined ? AppConfig.layer() : AppConfig.memory(env), Logging.layer);

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
