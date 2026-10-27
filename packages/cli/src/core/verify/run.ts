import { Cause, Clock, Effect, Exit, FileSystem } from "effect";
import { AGENT_MARKER_NAMES, AppConfig } from "../../config";
import type { Manifest } from "../../schemas/manifest";
import type { StepResult, VerifyResult } from "../../schemas/verify";
import { type PlannedStep, planVerify, type SelectOptions } from "./plan";
import { runStep } from "./step";

export type VerifyProject = { root: string; manifest: Manifest };
export type VerifyOptions = SelectOptions;
/**
 * What the runner knows about a run: the result without the tamper check's fields, which the
 * command adds (1.3b), and never `changed`, since a changed run doesn't reach the runner.
 */
export type RunResult = Omit<
  VerifyResult,
  "outcome" | "tamperCheck" | "changed" | "firstGreen" | "stateRecord"
> & { outcome: Exclude<VerifyResult["outcome"], "changed"> };

const SETUP_FAILED = "an earlier setup step failed";
const INTERRUPTED = "the run was interrupted";

/**
 * Runs a project's verify steps and returns the result. The manifest is taken as already checked
 * (`tamper.ts::checkTamper` runs before this). Setup stops at its first failure, which skips the check
 * and serve steps; every check runs; teardown always runs, and so does `onFinished`, both in the
 * finalizer of the run, so an interrupted run still tears down and reports to `onFinished` (with
 * outcome `interrupted`) before the interruption ends the command.
 */
export const runVerify = (
  project: VerifyProject,
  options: VerifyOptions,
  onFinished: (result: RunResult) => Effect.Effect<void> = () => Effect.void,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const config = yield* AppConfig;
    const plan = yield* planVerify(project.manifest.verify, options);
    const realRoot = yield* fs
      .realPath(project.root)
      .pipe(Effect.orElseSucceed(() => project.root));
    // The captured environment wins over the manifest's defaults (`PORT_WEB=5187 verify`), and no
    // agent marker reaches a step: it must behave the same whoever ran verify.
    const env = { ...project.manifest.env, ...config.childEnv(AGENT_MARKER_NAMES) };
    const context = { root: project.root, realRoot, env };
    const started = yield* Clock.currentTimeMillis;
    const results = new Map<string, StepResult>();
    let setupFailed = false;
    let current: { step: PlannedStep; started: number } | undefined;

    const skipped = (step: PlannedStep, reason: string): StepResult => ({
      name: step.name,
      phase: step.phase,
      ...(step.layer ? { layer: step.layer } : {}),
      command: step.run,
      status: "skipped",
      durationMs: 0,
      reason,
    });
    const runOne = (step: PlannedStep) =>
      Effect.gen(function* () {
        const skip =
          plan.skipped.get(step.name) ??
          (setupFailed && step.phase !== "teardown" ? SETUP_FAILED : undefined);
        if (skip !== undefined) {
          results.set(step.name, skipped(step, skip));
          return;
        }
        current = { step, started: yield* Clock.currentTimeMillis };
        const result = yield* runStep(step, context);
        current = undefined;
        results.set(step.name, result);
        if (step.phase === "setup" && result.status === "failed") setupFailed = true;
      });

    let finished: RunResult | undefined;
    const finish = (interrupted: boolean) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        if (interrupted && current) {
          const { step, started: at } = current;
          results.set(step.name, {
            ...skipped(step, INTERRUPTED),
            status: "failed",
            failureKind: "interrupted",
            durationMs: now - at,
          });
          current = undefined;
        }
        if (interrupted)
          for (const step of plan.steps)
            if (step.phase !== "teardown" && !results.has(step.name))
              results.set(step.name, skipped(step, INTERRUPTED));
        yield* Effect.forEach(
          plan.steps.filter((step) => step.phase === "teardown"),
          runOne,
          { discard: true },
        );
        const steps = plan.steps.map(
          (step) => results.get(step.name) ?? skipped(step, INTERRUPTED),
        );
        const ended = yield* Clock.currentTimeMillis;
        const count = (status: StepResult["status"]) =>
          steps.filter((step) => step.status === status).length;
        const created = Date.parse(project.manifest.createdAt);
        finished = {
          outcome: interrupted
            ? "interrupted"
            : count("failed")
              ? "failed"
              : plan.scope === "partial"
                ? "partial"
                : "green",
          scope: plan.scope,
          steps,
          totals: { passed: count("passed"), failed: count("failed"), skipped: count("skipped") },
          durationMs: ended - started,
          secondsSinceCreated: Number.isFinite(created)
            ? Math.max(0, Math.floor((ended - created) / 1000))
            : 0,
        };
        yield* onFinished(finished);
      });

    yield* Effect.forEach(
      plan.steps.filter((step) => step.phase !== "teardown"),
      runOne,
      { discard: true },
    ).pipe(
      Effect.onExit((exit) => finish(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause))),
    );
    return finished as RunResult;
  });
