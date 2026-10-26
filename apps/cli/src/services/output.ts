import { Context, Effect, Layer } from "effect";
import { type AppError, BrokenPipe, PermissionDenied, retryable } from "../errors";
export type Writer = (text: string) => Promise<void>;
function write(writer: Writer, text: string) {
  return Effect.tryPromise({
    try: () => writer(text),
    catch: (error) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "EPIPE"
        ? new BrokenPipe()
        : new PermissionDenied(),
  });
}
export class Output extends Context.Service<
  Output,
  {
    result: (value: unknown, human: string) => Effect.Effect<void>;
    note: (text: string) => Effect.Effect<void, BrokenPipe | PermissionDenied>;
    error: (error: AppError) => Effect.Effect<void, BrokenPipe | PermissionDenied>;
    flush: Effect.Effect<void, BrokenPipe | PermissionDenied>;
    clear: Effect.Effect<void>;
  }
>()("quickstacks/Output") {
  static layer = (json: boolean, stdout: Writer, stderr: Writer) =>
    Layer.sync(Output, () => {
      const results: string[] = [];
      return {
        result: (value, human) =>
          Effect.sync(() => {
            results.push(json ? JSON.stringify(value) : human);
          }),
        note: (text) => write(stderr, `${text}\n`),
        error: (error) =>
          write(
            stderr,
            json
              ? `${JSON.stringify({ error: { tag: error._tag, message: error.message, retryable: retryable(error) } })}\n`
              : `${error.message}\n`,
          ),
        flush: Effect.suspend(() =>
          results.length ? write(stdout, `${results.join("\n")}\n`) : Effect.void,
        ),
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
