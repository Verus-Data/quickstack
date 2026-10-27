import { Context, Effect, Layer } from "effect";
import {
  type AppError,
  BrokenPipe,
  detailLines,
  encodeDetails,
  PermissionDenied,
  retryable,
} from "../errors";
export type Writer = (text: string) => Promise<void>;
function write(writer: Writer, text: string) {
  return Effect.tryPromise({
    try: () => writer(text),
    catch: (error) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "EPIPE"
        ? new BrokenPipe()
        : new PermissionDenied({ details: { reason: "write" } }),
  });
}
export class Output extends Context.Service<
  Output,
  {
    result: (value: unknown, human: string) => Effect.Effect<void>;
    note: (text: string) => Effect.Effect<void, BrokenPipe | PermissionDenied>;
    /** A live line on stderr in human mode; nothing in JSON mode. Never fails. */
    progress: (text: string) => Effect.Effect<void>;
    /**
     * Encodes details and writes the envelope; details with excess properties are a defect.
     * `invocation` (`Host.invocation`) is quoted in human mode's `Next:` lines.
     */
    error: (
      error: AppError,
      invocation: string,
    ) => Effect.Effect<void, BrokenPipe | PermissionDenied>;
    flush: Effect.Effect<void, BrokenPipe | PermissionDenied>;
    /** Human mode: writes buffered results now (before a child takes the terminal). JSON: no-op. */
    flushNow: Effect.Effect<void, BrokenPipe | PermissionDenied>;
    clear: Effect.Effect<void>;
  }
>()("quickstacks/Output") {
  static layer = (json: boolean, stdout: Writer, stderr: Writer) =>
    Layer.sync(Output, () => {
      const results: string[] = [];
      let progressOpen = !json;
      const flush = Effect.suspend(() => {
        if (!results.length) return Effect.void;
        const text = `${results.join("\n")}\n`;
        results.length = 0;
        return write(stdout, text);
      });
      return {
        result: (value, human) =>
          Effect.sync(() => {
            results.push(json ? JSON.stringify(value) : human);
          }),
        note: (text) => write(stderr, `${text}\n`),
        progress: (text) =>
          Effect.suspend(() =>
            progressOpen
              ? write(stderr, `${text}\n`).pipe(
                  Effect.catch(() =>
                    Effect.sync(() => {
                      progressOpen = false;
                    }),
                  ),
                )
              : Effect.void,
          ),
        error: (error, invocation) =>
          encodeDetails(error).pipe(
            Effect.orDie,
            Effect.flatMap((details) =>
              write(
                stderr,
                json
                  ? `${JSON.stringify({
                      error: {
                        tag: error._tag,
                        message: error.message,
                        retryable: retryable(error),
                        ...(details === undefined ? {} : { details }),
                      },
                    })}\n`
                  : `${[error.message, ...detailLines(error, invocation).map((line) => `  ${line}`)].join("\n")}\n`,
              ),
            ),
          ),
        flush,
        flushNow: json ? Effect.void : flush,
        clear: Effect.sync(() => {
          results.length = 0;
        }),
      };
    });
  static memory = (json = false) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
      stdout,
      stderr,
      layer: Output.layer(
        json,
        async (s) => {
          stdout.push(s);
        },
        async (s) => {
          stderr.push(s);
        },
      ),
    };
  };
}
