import { Cause, Clock, Console, Effect, Exit, Logger, References } from "effect";
import { CliError, Command } from "effect/cli";
import { cli } from "./cli";
import { AppConfig } from "./config";
import {
  type AppError,
  BrokenPipe,
  Defect,
  exitCode,
  Interrupted,
  knownError,
  Usage,
} from "./errors";
import { defectTrace, entry, Logging } from "./logging";
import { Output } from "./services/output";
import { VERSION } from "./version";
/** Whether one of `flags` comes before any `--`; what follows `--` belongs to the command. */
export function hasFlag(args: readonly string[], ...flags: readonly string[]): boolean {
  const end = args.indexOf("--");
  return (end === -1 ? args : args.slice(0, end)).some((arg) => flags.includes(arg));
}
export function main(
  args: readonly string[],
  program: Effect.Effect<
    void,
    unknown,
    Command.Services<typeof cli> | Command.Environment
  > = Command.runWith(cli, { version: VERSION, renderErrors: false })(args),
) {
  return Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const output = yield* Output;
      const logging = yield* Logging;
      const config = yield* AppConfig;
      const settings = yield* config.logging;
      const started = yield* Clock.currentTimeMillis;
      const invocationId = `${started}-${Math.random().toString(36).slice(2, 10)}`;
      const framework: string[] = [];
      const capture = (...values: ReadonlyArray<unknown>) => {
        framework.push(values.map(String).join(" "));
      };
      const captured: Console.Console = {
        assert: (_condition, ...values) => capture(...values),
        clear: () => {},
        count: capture,
        countReset: () => {},
        debug: capture,
        dir: capture,
        dirxml: capture,
        error: capture,
        group: capture,
        groupCollapsed: capture,
        groupEnd: () => {},
        info: capture,
        log: capture,
        table: capture,
        time: () => {},
        timeEnd: () => {},
        timeLog: capture,
        trace: capture,
        warn: capture,
      };
      const exit = yield* Effect.exit(
        restore(
          program.pipe(
            Effect.provideService(Console.Console, captured),
            Effect.provide(Logger.layer([logging.logger])),
            Effect.provideService(References.MinimumLogLevel, settings.level),
            Effect.annotateLogs({ invocationId }),
          ),
        ),
      );
      let error: AppError | undefined;
      let defect: string | undefined;
      let help = false;
      if (Exit.isFailure(exit)) {
        const failure = exit.cause.reasons.find(Cause.isFailReason);
        if (
          failure &&
          CliError.isCliError(failure.error) &&
          failure.error._tag === "ShowHelp" &&
          failure.error.errors.length === 0
        )
          help = true;
        else
          error = Cause.hasInterruptsOnly(exit.cause)
            ? new Interrupted()
            : failure
              ? (knownError(failure.error) ??
                (CliError.isCliError(failure.error) ? new Usage() : new Defect()))
              : new Defect();
        if (error instanceof Defect && !knownError(failure?.error))
          defect = defectTrace(Cause.squash(exit.cause));
      }
      if (error instanceof BrokenPipe) return 0;
      if (!error && (help || framework.length)) {
        const text = framework
          .join("\n")
          .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
        yield* output.result(
          hasFlag(args, "--version", "-v") ? { version: VERSION } : { help: text },
          hasFlag(args, "--version", "-v") ? VERSION : text,
        );
      }
      let status = error ? exitCode(error) : 0;
      if (error) {
        yield* output.clear;
        const written = yield* Effect.exit(output.error(error));
        if (
          Exit.isFailure(written) &&
          written.cause.reasons.some(
            (reason) => Cause.isFailReason(reason) && reason.error instanceof BrokenPipe,
          )
        )
          return 0;
      } else {
        const flushed = yield* Effect.exit(output.flush);
        if (Exit.isFailure(flushed)) {
          const failure = flushed.cause.reasons.find(Cause.isFailReason);
          if (failure?.error instanceof BrokenPipe) return 0;
          error = failure ? (knownError(failure.error) ?? new Defect()) : new Defect();
          if (error instanceof Defect) defect = defectTrace(Cause.squash(flushed.cause));
          status = exitCode(error);
          yield* output.error(error).pipe(Effect.catchCause(() => Effect.void));
        }
      }
      const finished = yield* Clock.currentTimeMillis;
      const rank = { Trace: 0, Debug: 1, Info: 2, Warn: 3, Error: 4, Fatal: 5, None: 6 };
      if (rank[settings.level] <= (error ? 4 : 2))
        logging.records.push(
          entry({
            date: new Date(finished),
            level: error ? "Error" : "Info",
            message: "command",
            annotations: {
              invocationId,
              duration: finished - started,
              outcome: status === 0 ? "success" : "failure",
              status,
              ...(defect ? { defect } : {}),
            },
            error,
          }),
        );
      yield* logging.flush(settings, hasFlag(args, "--json"));
      return status;
    }),
  );
}
