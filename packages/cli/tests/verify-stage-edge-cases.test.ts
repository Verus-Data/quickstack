import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  decodeResult,
  readRecord,
  recordPath,
  runRecords,
  splitEvents,
  startedSteps,
  stateEnv,
  verify,
  workspace,
  writeRecordedProject,
} from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());

test.each(["base", "app"])(
  "a failed %s teardown still runs its remaining cleanup and keeps every failure",
  async (stage) => {
    const home = space.dir();
    const root = space.dir();
    const manifest = writeRecordedProject(root, home, [
      { name: "base-test", layer: "test", run: "true" },
      {
        name: "base-first-clean",
        phase: "teardown",
        run: stage === "base" ? "exit 7" : "true",
      },
      { name: "base-last-clean", phase: "teardown", run: "echo base > base-cleaned" },
      { name: "app-test", tags: ["app"], layer: "test", run: "touch app-started" },
      {
        name: "app-first-clean",
        tags: ["app"],
        phase: "teardown",
        run: "exit 8",
      },
      {
        name: "app-last-clean",
        tags: ["app"],
        phase: "teardown",
        run: "echo app > app-cleaned",
      },
    ]);
    const result = await verify(["--json"], { home, cwd: root, env: stateEnv(home) });
    expect(result.status).toBe(5);
    const name = `${stage}-first-clean`;
    const report = decodeResult(result.stdout);
    expect(report).toMatchObject({
      outcome: "failed",
      stages: stage === "base" ? { base: "failed", app: null } : { base: "green", app: "failed" },
      totals: { passed: stage === "base" ? 2 : 5, failed: 1, skipped: stage === "base" ? 3 : 0 },
      firstGreen: false,
    });
    expect(startedSteps(result.stderr)).toEqual(
      stage === "base"
        ? ["base-test", "base-first-clean", "base-last-clean"]
        : [
            "base-test",
            "base-first-clean",
            "base-last-clean",
            "app-test",
            "app-first-clean",
            "app-last-clean",
          ],
    );
    expect(JSON.parse(splitEvents(result.stderr).rest)).toEqual({
      error: {
        tag: "VerifyFailed",
        message: "Verify failed.",
        retryable: false,
        next:
          stage === "base"
            ? "fix the code or config these steps exercise, not the steps, then run stacks verify again."
            : 'follow the application section ("Then: the application") of .quickstack/BRIEF.md, fix the code or config these steps exercise, then run stacks verify again.',
        details: {
          failed: [{ name, failureKind: "step", exitCode: stage === "base" ? 7 : 8 }],
          stages: report.stages,
        },
      },
    });
    expect(readFileSync(join(root, "base-cleaned"), "utf8")).toBe("base\n");
    expect(existsSync(join(root, "app-started"))).toBe(stage === "app");
    expect(existsSync(join(root, "app-cleaned"))).toBe(stage === "app");
    if (stage === "app") expect(readFileSync(join(root, "app-cleaned"), "utf8")).toBe("app\n");
    expect(runRecords(root)).toMatchObject([{ outcome: "failed", stages: report.stages }]);
    expect(readRecord(recordPath(home, manifest.projectId)).firstGreenAt).toBeNull();
  },
);

test("an app-only project treats the empty base as complete and runs app setup and cleanup", async () => {
  const home = space.dir();
  const root = space.dir();
  writeRecordedProject(root, home, [
    { name: "app-setup", tags: ["app"], phase: "setup", run: "echo setup > order" },
    { name: "app-test", tags: ["app"], run: "echo test >> order" },
    { name: "app-clean", tags: ["app"], phase: "teardown", run: "echo clean >> order" },
  ]);
  const result = await verify(["--json"], { home, cwd: root, env: stateEnv(home) });
  expect(result.status).toBe(0);
  expect(splitEvents(result.stderr).rest).toBe("");
  expect(startedSteps(result.stderr)).toEqual(["app-setup", "app-test", "app-clean"]);
  expect(decodeResult(result.stdout)).toMatchObject({
    outcome: "green",
    stages: { base: "green", app: "green" },
    totals: { passed: 3, failed: 0, skipped: 0 },
    firstGreen: true,
  });
  expect(readFileSync(join(root, "order"), "utf8")).toBe("setup\ntest\nclean\n");
  expect(runRecords(root)).toMatchObject([
    { outcome: "green", stages: { base: "green", app: "green" } },
  ]);
});
