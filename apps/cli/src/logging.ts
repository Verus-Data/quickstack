import { Context, Effect, FileSystem, Layer, Logger, Path, References } from "effect";
import type { LogSettings } from "./config";
import { type AppError, exitCode } from "./errors";
import { Output } from "./services/output";
export type LogEntry = {
  time: string;
  level: string;
  msg: string;
  detail: string[];
  cause?: { name: string; message: string; status: number; stack?: string };
  [key: string]: unknown;
};
const reserved = new Set(["time", "level", "msg", "detail", "cause"]);
const scalar = (v: unknown): string | number | boolean | null =>
  v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    ? v
    : "[redacted]";
export function entry(input: {
  date: Date;
  level: string;
  message: unknown;
  annotations?: Readonly<Record<string, unknown>>;
  error?: AppError;
}): LogEntry {
  const values = (Array.isArray(input.message) ? input.message : [input.message]).map((v) =>
    String(scalar(v)),
  );
  const result: LogEntry = {
    time: input.date.toISOString(),
    level: input.level.toLowerCase(),
    msg: values[0] ?? "",
    detail: values.slice(1),
  };
  for (const [key, value] of Object.entries(input.annotations ?? {}))
    result[reserved.has(key) ? `annotation_${key}` : key] =
      /password|secret|token|authorization/i.test(key) ? "[redacted]" : scalar(value);
  if (input.error)
    result.cause = {
      name: input.error._tag,
      message: input.error.message,
      status: exitCode(input.error),
      ...(input.error.stack ? { stack: input.error.stack } : {}),
    };
  return result;
}
export class Logging extends Context.Service<
  Logging,
  {
    logger: Logger.Logger<unknown, void>;
    records: LogEntry[];
    flush: (settings: LogSettings, quiet?: boolean) => Effect.Effect<void>;
  }
>()("quickstacks/Logging") {
  static layer = Layer.effect(
    Logging,
    Effect.gen(function* () {
      const output = yield* Output;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const records: LogEntry[] = [];
      let warned = false;
      const logger = Logger.make((o) => {
        records.push(
          entry({
            date: o.date,
            level: o.logLevel,
            message: o.message,
            annotations: o.fiber.getRef(References.CurrentLogAnnotations),
          }),
        );
      });
      return {
        logger,
        records,
        flush: (settings, quiet = false) =>
          Effect.gen(function* () {
            for (const record of records.splice(0)) {
              if (!quiet)
                yield* output
                  .note(
                    settings.format === "json"
                      ? JSON.stringify(record)
                      : `${record.time} ${record.level.toUpperCase()} ${record.msg} ${record.outcome ?? ""}`,
                  )
                  .pipe(Effect.catchCause(() => Effect.void));
              if (settings.file) {
                yield* fs.makeDirectory(path.dirname(settings.file), { recursive: true }).pipe(
                  Effect.andThen(
                    fs.writeFileString(settings.file, `${JSON.stringify(record)}\n`, { flag: "a" }),
                  ),
                  Effect.catchCause(() =>
                    Effect.gen(function* () {
                      if (!warned && !quiet) {
                        warned = true;
                        yield* output
                          .note("Log file unavailable; continuing with stderr.")
                          .pipe(Effect.catchCause(() => Effect.void));
                      }
                    }),
                  ),
                );
              }
            }
          }),
      };
    }),
  );
  static memory = () => Logging.layer;
}
