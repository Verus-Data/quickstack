import { Context, Effect, Layer } from "effect";
import { AppConfig } from "../config";
import {
  type AppError,
  BrokenPipe,
  encodeDetails,
  failureGuide,
  keepsResult,
  PermissionDenied,
  retryable,
} from "../errors";
import type { DetectedAgent } from "../schemas/entry";
import { Host } from "./host";
/**
 * Who reads this invocation's output. `json`: `--json` was given. `human`: stdout is a terminal
 * and no agent is detected. `agent`: everything else (an agent's shell, a pipe, CI). The three
 * never behave differently; only the rendering changes.
 */
export type Audience = "json" | "agent" | "human";
export function resolveAudience(
  json: boolean,
  stdoutIsTTY: boolean,
  agent: DetectedAgent,
): Audience {
  if (json) return "json";
  return stdoutIsTTY && agent === "none" ? "human" : "agent";
}
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
    /** Resolved once when the layer is built; commands pick their text rendering by it. */
    audience: Audience;
    /** `value` in JSON mode; otherwise `text`, the rendering for this audience. */
    result: (value: unknown, text: string) => Effect.Effect<void>;
    note: (text: string) => Effect.Effect<void, BrokenPipe | PermissionDenied>;
    /** A live line on stderr in human mode; nothing for an agent or in JSON mode. Never fails. */
    progress: (text: string) => Effect.Effect<void>;
    /**
     * A live event on stderr for machine readers while a long command runs: `value` as one JSON
     * line in JSON mode, `agentText` (when given) as one line in agent mode, nothing for a human,
     * who gets `progress` lines instead. Never fails; stops after the first failed write. The
     * error envelope, written after it, stays the last stderr line.
     */
    event: (value: unknown, agentText?: string) => Effect.Effect<void>;
    /**
     * Encodes details and writes the envelope; details with excess properties are a defect.
     * `invocation` (`Host.invocation`) is quoted in the failure's guide (`errors.ts::failureGuide`):
     * the envelope's `next`, and the text modes' detail and `Next:` lines.
     */
    error: (
      error: AppError,
      invocation: string,
    ) => Effect.Effect<void, BrokenPipe | PermissionDenied>;
    flush: Effect.Effect<void, BrokenPipe | PermissionDenied>;
    /** Text modes: writes buffered results now (before a child takes the terminal). JSON: no-op. */
    flushNow: Effect.Effect<void, BrokenPipe | PermissionDenied>;
    clear: Effect.Effect<void>;
  }
>()("stacks/Output") {
  /**
   * This invocation's Output: the audience comes from `--json` (`json`), `Host.stdoutIsTTY` and
   * `AppConfig.agent`, resolved once here.
   */
  static layer = (json: boolean, stdout: Writer, stderr: Writer) =>
    Layer.effect(
      Output,
      Effect.gen(function* () {
        const host = yield* Host;
        const agent = yield* (yield* AppConfig).agent;
        return make(resolveAudience(json, host.stdoutIsTTY, agent), stdout, stderr);
      }),
    );
  /** An Output for a fixed audience, for tests that bypass the resolution. */
  static fixed = (audience: Audience, stdout: Writer, stderr: Writer) =>
    Layer.sync(Output, () => make(audience, stdout, stderr));
  static memory = (audience: Audience = "human") => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
      stdout,
      stderr,
      layer: Output.fixed(
        audience,
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
type ErrorView = {
  error: AppError;
  details: unknown;
  guide: ReturnType<typeof failureGuide>;
  json: boolean;
};
/**
 * The envelope (`errors.ts::ErrorEnvelope`) in JSON mode; otherwise the message, the guide's
 * lines and its `Next:` line. A keeps-result failure's report already ends with that `Next:` line.
 */
function renderError({ error, details, guide, json }: ErrorView): string {
  if (json)
    return `${JSON.stringify({
      error: {
        tag: error._tag,
        message: error.message,
        retryable: retryable(error),
        ...(guide.next === undefined ? {} : { next: guide.next }),
        ...(details === undefined ? {} : { details }),
      },
    })}\n`;
  const next = guide.next === undefined || keepsResult(error) ? [] : [`Next: ${guide.next}`];
  return `${[error.message, ...[...guide.lines, ...next].map((line) => `  ${line}`)].join("\n")}\n`;
}
function make(audience: Audience, stdout: Writer, stderr: Writer): Output["Service"] {
  const json = audience === "json";
  const results: string[] = [];
  // Live stderr lines (progress for a human, events otherwise) stop after the first failed write.
  let liveOpen = true;
  const live = (text: string) =>
    Effect.suspend(() =>
      liveOpen
        ? write(stderr, `${text}\n`).pipe(
            Effect.catch(() =>
              Effect.sync(() => {
                liveOpen = false;
              }),
            ),
          )
        : Effect.void,
    );
  const flush = Effect.suspend(() => {
    if (!results.length) return Effect.void;
    const text = `${results.join("\n")}\n`;
    results.length = 0;
    return write(stdout, text);
  });
  return {
    audience,
    result: (value, text) =>
      Effect.sync(() => {
        results.push(json ? JSON.stringify(value) : text);
      }),
    note: (text) => write(stderr, `${text}\n`),
    progress: (text) => (audience === "human" ? live(text) : Effect.void),
    event: (value, agentText) => {
      if (json) return live(JSON.stringify(value));
      return audience === "agent" && agentText !== undefined ? live(agentText) : Effect.void;
    },
    error: (error, invocation) =>
      encodeDetails(error).pipe(
        Effect.orDie,
        Effect.flatMap((details) =>
          write(
            stderr,
            renderError({ error, details, guide: failureGuide(error, invocation), json }),
          ),
        ),
      ),
    flush,
    flushNow: json ? Effect.void : flush,
    clear: Effect.sync(() => {
      results.length = 0;
    }),
  };
}
