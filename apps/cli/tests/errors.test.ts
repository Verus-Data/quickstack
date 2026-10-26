import { Effect } from "effect";
import { expect, test } from "vitest";
import {
  BadInput,
  Defect,
  exitCode,
  Interrupted,
  InvalidConfig,
  NotConfigured,
  NotFound,
  PermissionDenied,
  retryable,
  UpstreamUnavailable,
  Usage,
} from "../src/errors";
import { runCli } from "./helpers/cli";

const cases = [
  [new Usage(), 2, false],
  [new BadInput(), 2, false],
  [new NotFound(), 2, false],
  [new NotConfigured(), 3, false],
  [new InvalidConfig(), 3, false],
  [new UpstreamUnavailable(), 4, true],
  [new PermissionDenied(), 6, false],
  [new Interrupted(), 130, false],
  [new Defect(), 1, true],
] as const;
test.each(cases)(
  "maps %s exhaustively and main preserves failure output",
  async (error, status, retry) => {
    expect(exitCode(error)).toBe(status);
    expect(retryable(error)).toBe(retry);
    const result = await runCli(["--json"], { program: Effect.fail(error) });
    expect(result.status).toBe(status);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      error: { tag: error._tag, message: error.message, retryable: retry },
    });
  },
);
test("an observed cancellation returns 130 and disposes its scope", async () => {
  let released = false;
  const controller = new AbortController();
  const program = Effect.acquireRelease(
    Effect.sync(() => {
      controller.abort();
    }),
    () =>
      Effect.sync(() => {
        released = true;
      }),
  ).pipe(Effect.andThen(Effect.never), Effect.scoped);
  const result = await runCli(["--json"], { program, signal: controller.signal });
  expect(result.status).toBe(130);
  expect(released).toBe(true);
  expect(result.stdout).toBe("");
});
