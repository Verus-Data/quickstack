import { NodeServices } from "@effect/platform-node";
import { Effect, type Exit, type FileSystem, Layer, type Path, type Scope } from "effect";
import { AppConfig, type Environment } from "../../src/config";
import { AppLayer } from "../../src/runtime";
import { Host } from "../../src/services/host";
import { Output, type Writer } from "../../src/services/output";
import { Foreground, Processes } from "../../src/services/processes";

/** Runs a program that needs FileSystem+Path (from NodeServices) only. */
export function runFs<A, E>(
  program: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
): Promise<Exit.Exit<A, E>> {
  return Effect.runPromiseExit(program.pipe(Effect.provide(NodeServices.layer)));
}

/** Runs a program that needs Processes, AppConfig, Foreground and NodeServices. */
export function runWithProcesses<A, E>(
  program: Effect.Effect<A, E, Processes | AppConfig | Foreground | Scope.Scope>,
  env: Environment = { PATH: process.env.PATH },
): Promise<Exit.Exit<A, E>> {
  const deps = Layer.mergeAll(AppConfig.memory(env), Foreground.layer(Foreground.make()));
  const layer = Processes.layer.pipe(
    Layer.provideMerge(deps),
    Layer.provideMerge(NodeServices.layer),
  );
  return Effect.runPromiseExit(program.pipe(Effect.scoped, Effect.provide(layer)));
}

/** Captured stdout/stderr from runAnalyze. */
export type AnalyzeCapture = { stdout: string; stderr: string };

/** Runs analyze() with real NodeServices, real Processes, in-memory Output, and captured env. */
export function runAnalyze<A, E>(
  program: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | Processes | AppConfig | Output | Scope.Scope
  >,
  env: Environment = { PATH: process.env.PATH ?? "" },
): Promise<{ exit: Exit.Exit<A, E>; capture: AnalyzeCapture }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writer =
    (into: string[]): Writer =>
    async (text) => {
      into.push(text);
    };
  const output = Output.layer(false, writer(stdout), writer(stderr));
  const platform = Layer.mergeAll(
    NodeServices.layer,
    Host.memory(),
    Foreground.layer(Foreground.make()),
  );
  const layer = Layer.provideMerge(AppLayer(output, env), platform);
  return Effect.runPromiseExit(program.pipe(Effect.scoped, Effect.provide(layer))).then((exit) => ({
    exit,
    capture: { stdout: stdout.join(""), stderr: stderr.join("") },
  }));
}
