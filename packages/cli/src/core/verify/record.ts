import { Clock, Effect, FileSystem, Path, type PlatformError, Schema } from "effect";
import { AppConfig } from "../../config";
import type { Manifest } from "../../schemas/manifest";
import { RunRecord, type RunStep, type VerifyResult } from "../../schemas/verify";
import { VERSION } from "../../version";
import { saveProjectState, warnUnwritten } from "../project-state";
import { printable } from "../text";
import type { RunResult } from "./run";
import type { Tamper } from "./tamper";

/** Where a project's run records go, relative to its root (ignored by its `.gitignore`). */
export const RUNS_PATH = ".quickstacks/state/runs.jsonl";

/** What a finished run settles in the state record, for the result's `firstGreen` and `stateRecord`. */
export type RecordFacts = Pick<VerifyResult, "firstGreen" | "stateRecord">;

export type RecordContext = {
  root: string;
  manifest: Manifest;
  tamper: Tamper;
  acceptedChanges: boolean;
};

type Finished = RunResult | VerifyResult;

const runStep = (step: Finished["steps"][number]): RunStep => ({
  name: step.name,
  phase: step.phase,
  ...(step.layer ? { layer: step.layer } : {}),
  status: step.status,
  ...(step.failureKind ? { failureKind: step.failureKind } : {}),
  ...(step.exitCode === undefined ? {} : { exitCode: step.exitCode }),
  durationMs: step.durationMs,
});

const reasonOf = (error: PlatformError.PlatformError) => error.reason._tag;

/**
 * Appends one encoded `RunRecord` line to `.quickstacks/state/runs.jsonl` with a single write. The
 * state directory must resolve inside the project, so a link there can't send the write elsewhere.
 * Any failure is one logged warning; the run's outcome and exit don't change.
 */
const appendRunRecord = (root: string, record: RunRecord) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(root, RUNS_PATH);
    const dir = path.dirname(file);
    const line = `${JSON.stringify(Schema.encodeSync(RunRecord)(record))}\n`;
    yield* Effect.gen(function* () {
      yield* fs.makeDirectory(dir, { recursive: true });
      const realRoot = yield* fs.realPath(root);
      const realDir = yield* fs.realPath(dir);
      if (realDir !== path.join(realRoot, ".quickstacks", "state"))
        return yield* Effect.logWarning(
          `Run record not written (outside the project): ${printable(file)}`,
        );
      yield* fs.writeFileString(path.join(realDir, "runs.jsonl"), line, { flag: "a" });
    }).pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.logWarning(`Run record not written (${reasonOf(error)}): ${printable(file)}`),
      ),
    );
  });

/**
 * After a run (verify's `onFinished`, so interrupted runs are recorded too, and after a changed
 * run): appends the run record, then sets the state record's `firstGreenAt` (first green run) and
 * `firstTestPassAt` (first run, of any scope, in which a `test`-layer step passed; never a
 * `changed` run), each written once and never overwritten. Only a record found by id is updated.
 * A write that fails logs one warning and leaves `stateRecord` false; nothing here fails.
 */
export const recordRun = (
  context: RecordContext,
  result: Finished,
): Effect.Effect<RecordFacts, never, FileSystem.FileSystem | Path.Path | AppConfig> =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const now = yield* Clock.currentTimeMillis;
    const record: RunRecord = {
      schemaVersion: 1,
      at: new Date(now - result.durationMs).toISOString(),
      cli: VERSION,
      agent: yield* config.agent,
      outcome: result.outcome,
      scope: result.scope,
      tamperCheck: context.tamper.tamperCheck,
      acceptedChanges: context.acceptedChanges,
      durationMs: result.durationMs,
      secondsSinceCreated: result.secondsSinceCreated,
      steps: result.steps.map(runStep),
    };
    yield* appendRunRecord(context.root, record);

    const found = context.tamper.record;
    if (!found) return { firstGreen: false, stateRecord: false };
    if (result.outcome === "changed") return { firstGreen: false, stateRecord: true };
    const at = new Date(now).toISOString();
    const green = result.outcome === "green" && found.state.firstGreenAt === null;
    const testPassed =
      found.state.firstTestPassAt === null &&
      result.steps.some((step) => step.layer === "test" && step.status === "passed");
    if (!green && !testPassed) return { firstGreen: false, stateRecord: true };
    const updated = {
      ...found.state,
      ...(green ? { firstGreenAt: at } : {}),
      ...(testPassed ? { firstTestPassAt: at } : {}),
    };
    return yield* saveProjectState(updated, found.path).pipe(
      Effect.as({ firstGreen: green, stateRecord: true }),
      Effect.catchTag("PlatformError", (error) =>
        warnUnwritten(error, found.path).pipe(Effect.as({ firstGreen: false, stateRecord: false })),
      ),
    );
  });
