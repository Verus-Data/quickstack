import { Effect, Schema } from "effect";
import { Command, Flag } from "effect/cli";
import { locateManifest, readManifest } from "../core/manifest";
import { renderVerify } from "../core/verify/report";
import { runVerify } from "../core/verify/run";
import { VerifyFailed } from "../errors";
import { VerifyResult } from "../schemas/verify";
import { Host } from "../services/host";
import { Output } from "../services/output";

/** Repeated flags, each value also split on commas: `--only a --only b,c`. */
const names = (values: ReadonlyArray<string>) =>
  values.flatMap((value) => value.split(",")).filter((value) => value !== "");

export const verifyCommand = Command.make(
  "verify",
  {
    only: Flag.String("only").pipe(
      Flag.withDescription(
        "Run only these check and serve steps, by name (repeatable or comma-separated); setup and teardown still run. The outcome is partial, never green.",
      ),
      Flag.atLeast(0),
    ),
    skipTag: Flag.String("skip-tag").pipe(
      Flag.withDescription(
        "Skip steps carrying this tag (repeatable or comma-separated). The outcome is partial, never green.",
      ),
      Flag.atLeast(0),
    ),
    all: Flag.Boolean("all").pipe(
      Flag.withDescription(
        "Also run steps skipped by default (prod steps in a --sandbox project).",
      ),
      Flag.withDefault(false),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const host = yield* Host;
      const output = yield* Output;
      const located = yield* locateManifest(host.cwd);
      const manifest = yield* readManifest(located.path);
      // 1.3b runs the tamper check before this and passes the run record writer as onFinished.
      const result = yield* runVerify(
        { root: located.root, manifest },
        { only: names(flags.only), skipTags: names(flags.skipTag), all: flags.all },
      );
      yield* output.result(
        Schema.encodeSync(VerifyResult)(result),
        renderVerify(result, host.invocation),
      );
      if (result.outcome === "failed")
        return yield* new VerifyFailed({
          details: {
            failed: result.steps.flatMap((step) =>
              step.status === "failed" && step.failureKind
                ? [
                    {
                      name: step.name,
                      failureKind: step.failureKind,
                      ...(step.exitCode === undefined ? {} : { exitCode: step.exitCode }),
                    },
                  ]
                : [],
            ),
          },
        });
    }),
).pipe(
  Command.withDescription(
    "Run this project's verify steps from .quickstacks/manifest.json (found from here or any directory above): setup, check, serve (each server probed, then stopped), then teardown, which always runs. Prints each command before running it. Exits 0 when green or partial, 5 with the report on stdout when a step fails.",
  ),
);
