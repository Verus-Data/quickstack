import { Clock, Effect, type FileSystem, type Path, Schema } from "effect";
import { Command, Flag } from "effect/cli";
import { AppConfig } from "../config";
import { locateManifest, readManifest } from "../core/manifest";
import { planVerify } from "../core/verify/plan";
import { type RecordFacts, recordRun } from "../core/verify/record";
import { renderVerify } from "../core/verify/report";
import { runVerify } from "../core/verify/run";
import { acceptChanges, changedResult, checkTamper, createdAtOf } from "../core/verify/tamper";
import { PermissionDenied, VerifyChanged, VerifyFailed } from "../errors";
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
    acceptChanges: Flag.Boolean("accept-changes").pipe(
      Flag.withDescription(
        "For a person who changed the verify steps on purpose: record them as they are now, then run them. Refused (exit 6) under a detected agent or without a terminal on stdin.",
      ),
      Flag.withDefault(false),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const host = yield* Host;
      const output = yield* Output;
      const config = yield* AppConfig;
      const started = yield* Clock.currentTimeMillis;
      const located = yield* locateManifest(host.cwd);
      let manifest = yield* readManifest(located.path);
      if (flags.acceptChanges) {
        if ((yield* config.agent) !== "none")
          return yield* new PermissionDenied({ details: { reason: "agent" } });
        if (!host.stdinIsTTY) return yield* new PermissionDenied({ details: { reason: "no-tty" } });
      }
      const options = { only: names(flags.only), skipTags: names(flags.skipTag), all: flags.all };
      const plan = yield* planVerify(manifest.verify, options);
      let tamper = yield* checkTamper(manifest, located.path);
      // The report names what was accepted (`result.changed`), in every audience.
      if (flags.acceptChanges)
        ({ manifest, tamper } = yield* acceptChanges(manifest, located.path, tamper));
      const context = {
        root: located.root,
        manifest,
        tamper,
        acceptedChanges: flags.acceptChanges,
      };
      const write = (result: VerifyResult) =>
        output.result(
          Schema.encodeSync(VerifyResult)(result),
          renderVerify(result, { invocation: host.invocation, audience: output.audience }),
        );

      const { changed } = tamper;
      if (changed && !flags.acceptChanges) {
        const result = yield* changedResult(plan, manifest, { ...tamper, changed }, started);
        yield* recordRun(context, result);
        yield* write(result);
        return yield* new VerifyChanged({ details: changed });
      }

      // The record is written in the runner's finalizer, so interrupted runs are recorded too; its
      // services are captured here, before the callback leaves this context.
      const services = yield* Effect.context<FileSystem.FileSystem | Path.Path | AppConfig>();
      let facts: RecordFacts = { firstGreen: false, stateRecord: false };
      const project = { root: located.root, manifest, createdAt: createdAtOf(manifest, tamper) };
      const run = yield* runVerify(project, options, (finished) =>
        recordRun(context, finished).pipe(
          Effect.tap((settled) =>
            Effect.sync(() => {
              facts = settled;
            }),
          ),
          Effect.asVoid,
          Effect.provideContext(services),
        ),
      );
      const result: VerifyResult = {
        ...run,
        tamperCheck: tamper.tamperCheck,
        ...(changed ? { changed } : {}),
        ...facts,
      };
      yield* write(result);
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
    "Run this project's verify steps from .quickstacks/manifest.json (found from here or any directory above): setup, check, serve (each server probed, then stopped), then teardown, which always runs. Prints each command before running it. First checks the steps against the copy recorded when the project was made; changed steps run nothing and exit 5 (VerifyChanged) until a person runs --accept-changes. Every run appends a record to .quickstacks/state/runs.jsonl. Exits 0 when green or partial, 5 with the report on stdout when a step fails or the steps changed.",
  ),
);
