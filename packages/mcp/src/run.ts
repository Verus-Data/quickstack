import { Context, Duration, Effect, Layer, Stream } from "effect";
import { ChildProcess } from "effect/process";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { cliPath } from "./config";

export interface CliOutput {
  readonly exit: number;
  readonly stdout: string;
  readonly stderr: string;
}

const DEFAULT_TIMEOUT = Duration.minutes(5);

function collectOutput(stream: Stream.Stream<Uint8Array, unknown, never>): Effect.Effect<string> {
  return stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (acc, chunk) => acc + chunk,
    ),
    Effect.catchCause(() => Effect.succeed("")),
  );
}

function runProcess(
  spawner: ChildProcessSpawner["Service"],
  path: string,
  args: ReadonlyArray<string>,
  options?: { readonly cwd?: string },
): Effect.Effect<CliOutput, never> {
  return Effect.gen(function* () {
    const command = ChildProcess.make("bun", [path, ...args, "--json"], {
      extendEnv: true,
      cwd: options?.cwd,
    });

    const result = yield* Effect.gen(function* () {
      const handle = yield* spawner.spawn(command);
      const [stdout, stderr, exitCode] = yield* Effect.all([
        collectOutput(handle.stdout),
        collectOutput(handle.stderr),
        handle.exitCode,
      ]);
      return {
        exit: Number(exitCode),
        stdout: stdout as string,
        stderr: stderr as string,
      } satisfies CliOutput;
    }).pipe(
      Effect.scoped,
      Effect.timeoutOption(DEFAULT_TIMEOUT),
      Effect.catchCause(() => Effect.succeed(undefined)),
    );

    if (result === undefined) {
      return { exit: -1, stdout: "", stderr: "Failed to spawn CLI" } satisfies CliOutput;
    }
    if (result._tag === "None") {
      return { exit: -1, stdout: "", stderr: "CLI timed out" } satisfies CliOutput;
    }
    return result.value;
  });
}

export class CliRunner extends Context.Service<
  CliRunner,
  {
    run(
      args: ReadonlyArray<string>,
      options?: { readonly cwd?: string },
    ): Effect.Effect<CliOutput, never>;
  }
>()("quickstacks/mcp/CliRunner") {
  static readonly Live = Layer.effect(
    CliRunner,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      return CliRunner.of({
        run: (args, options) => runProcess(spawner, cliPath, args, options),
      });
    }),
  );

  static readonly test = (scriptPath: string) =>
    Layer.effect(
      CliRunner,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner;
        return CliRunner.of({
          run: (args, options) => runProcess(spawner, scriptPath, args, options),
        });
      }),
    );
}
