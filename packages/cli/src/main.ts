import { Cause, Clock, Console, Effect, Exit, Logger, References } from "effect";
import { CliError, Command } from "effect/cli";
import { cli } from "./cli";
import { AppConfig } from "./config";
import { closest } from "./core/suggest";
import {
  type AppError,
  BrokenPipe,
  Defect,
  exitCode,
  Interrupted,
  keepsResult,
  knownError,
  Usage,
} from "./errors";
import { defectTrace, entry, Logging } from "./logging";
import { Host } from "./services/host";
import { Output } from "./services/output";
import { VERSION } from "./version";
/** Whether one of `flags` comes before any `--`; what follows `--` belongs to the command. */
export function hasFlag(args: readonly string[], ...flags: readonly string[]): boolean {
  const end = args.indexOf("--");
  return (end === -1 ? args : args.slice(0, end)).some((arg) => flags.includes(arg));
}
/** The listed subcommand names (and aliases) under `path`, which starts with the root's name. */
function subcommandNames(root: Command.Command.Any, path: readonly string[]): string[] {
  let node: Command.Command.Any | undefined = root;
  for (const name of path.slice(1))
    node = node?.subcommands.flatMap((group) => group.commands).find((c) => c.name === name);
  return (node?.subcommands ?? [])
    .flatMap((group) => group.commands)
    .filter((command) => !command.unlisted)
    .flatMap((command) => (command.alias ? [command.name, command.alias] : [command.name]));
}
/**
 * A parser failure is Usage; an unknown subcommand also names close known subcommands. The
 * framework's own `UnknownSubcommand.suggestions` is discarded in favor of `closest`.
 */
function usage(error: CliError.CliError): Usage {
  const unknown =
    error._tag === "ShowHelp"
      ? error.errors.find((e) => e._tag === "UnknownSubcommand")
      : error._tag === "UnknownSubcommand"
        ? error
        : undefined;
  return unknown?._tag === "UnknownSubcommand"
    ? new Usage({
        details: {
          command: unknown.subcommand,
          suggestions: closest(unknown.subcommand, subcommandNames(cli, unknown.parent ?? [])),
        },
      })
    : new Usage();
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
      const { invocation } = yield* Host;
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
                (CliError.isCliError(failure.error) ? usage(failure.error) : new Defect()))
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
      // The tag of a write error that lost a kept result; the exit stays the failure's own.
      let unwritten: string | undefined;
      if (error) {
        // A keeps-result failure (a failing verify) writes its report first; the envelope still
        // comes last on stderr. A closed stdout or stderr can't turn it into a pass.
        const keep = keepsResult(error);
        if (keep) {
          const flushed = yield* Effect.exit(output.flush);
          const failure = Exit.isFailure(flushed)
            ? flushed.cause.reasons.find(Cause.isFailReason)
            : undefined;
          if (failure && !(failure.error instanceof BrokenPipe))
            unwritten = knownError(failure.error)?._tag ?? "Defect";
        } else yield* output.clear;
        const written = yield* Effect.exit(output.error(error, invocation));
        if (
          !keep &&
          Exit.isFailure(written) &&
          written.cause.reasons.some(
            (reason) => Cause.isFailReason(reason) && reason.error instanceof BrokenPipe,
          )
        )
          return 0;
        if (Exit.isFailure(written) && written.cause.reasons.some(Cause.isDieReason)) {
          // The details didn't encode against their closed schema: report a defect instead.
          error = new Defect();
          defect = defectTrace(Cause.squash(written.cause));
          status = exitCode(error);
          yield* output.error(error, invocation).pipe(Effect.catchCause(() => Effect.void));
        }
      } else {
        const flushed = yield* Effect.exit(output.flush);
        if (Exit.isFailure(flushed)) {
          const failure = flushed.cause.reasons.find(Cause.isFailReason);
          if (failure?.error instanceof BrokenPipe) return 0;
          error = failure ? (knownError(failure.error) ?? new Defect()) : new Defect();
          if (error instanceof Defect) defect = defectTrace(Cause.squash(flushed.cause));
          status = exitCode(error);
          yield* output.error(error, invocation).pipe(Effect.catchCause(() => Effect.void));
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
              ...(unwritten ? { result: "unwritten", resultError: unwritten } : {}),
            },
            error,
          }),
        );
      // Log lines reach stderr only for a human; an agent or JSON reader gets them in the file only.
      yield* logging.flush(settings, output.audience !== "human");
      return status;
    }),
  );
}
