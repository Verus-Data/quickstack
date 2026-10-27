import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Clock, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { afterAll, afterEach, expect, test } from "vitest";
import { runBench } from "../scripts/bench";
import { agents } from "../scripts/bench/agents";
import { NetLayer } from "../src/platform/net";
import { AppLayer, runInvocation } from "../src/runtime";
import { Host } from "../src/services/host";
import { Output } from "../src/services/output";
import { Foreground } from "../src/services/processes";
import { benchCli, benchFixture, passed, sample } from "./helpers/bench";
import { runRecords, workspace } from "./helpers/verify";

const space = workspace();
const artifacts = workspace();
const compiled = benchCli(artifacts);
afterAll(() => artifacts.release());
afterEach(() => space.release());

test.each(["claude", "codex"] as const)(
  "%s accepts diagnostics around structured results",
  (id) => {
    const adapter = agents.find((candidate) => candidate.id === id);
    if (!adapter) throw new Error("Missing adapter");
    const success = sample(id === "claude" ? "claude-success.json" : "codex-success.jsonl");
    expect(
      adapter.readResult(`Warning: continuing without an optional feature\n${success}`),
    ).toMatchObject({ ended: "exit" });
    expect(adapter.readResult(`${success}\nWarning: cleanup completed\n`)).toMatchObject({
      ended: "exit",
    });
  },
);

test("a run crossing UTC midnight retains its start date", async () => {
  const f = benchFixture(space, compiled);
  let ended = false;
  const adapters = agents.map((adapter) => ({
    ...adapter,
    readResult: (tail: string) => {
      ended = true;
      return adapter.readResult(tail);
    },
  }));
  const output = Output.memory("agent");
  const platform = Layer.mergeAll(
    NodeServices.layer,
    NetLayer,
    Foreground.layer(Foreground.make()),
    Host.memory({ cwd: f.root, registry: f.registry }),
  );
  const program = Effect.gen(function* () {
    const live = yield* Clock.Clock;
    const before = yield* TestClock.make();
    const after = yield* TestClock.make();
    yield* before.setTime(Date.parse("2026-10-27T23:59:59Z"));
    yield* after.setTime(Date.parse("2026-10-28T00:00:01Z"));
    const current = () => (ended ? after : before);
    const millis = () => current().currentTimeMillisUnsafe();
    return yield* runBench(["sample", "--cli", compiled()], adapters).pipe(
      f.observeChildren,
      Effect.provideService(Clock.Clock, {
        monotonicTimeNanosUnsafe: () => live.monotonicTimeNanosUnsafe(),
        monotonicTimeNanos: live.monotonicTimeNanos,
        sleep: (duration) => live.sleep(duration),
        currentTimeMillisUnsafe: millis,
        currentTimeMillis: Effect.sync(millis),
        currentTimeNanosUnsafe: () => BigInt(millis()) * 1_000_000n,
        currentTimeNanos: Effect.sync(() => BigInt(millis()) * 1_000_000n),
      }),
    );
  });
  const status = await runInvocation(
    program.pipe(
      Effect.tap(() => Effect.flatMap(Output, (out) => out.flush)),
      Effect.orDie,
      Effect.provide(Layer.provideMerge(AppLayer(output.layer, f.env), platform)),
      Effect.scoped,
    ),
  );
  passed({ status, stdout: output.stdout.join(""), stderr: output.stderr.join("") });
  expect(f.ledger()).toMatchObject([
    { date: "2026-10-27", note: "plans/runs/2026-10-27-sample.md" },
  ]);
}, 60_000);

test("time to a green base uses the elapsed completion time once", async () => {
  const f = benchFixture(space, compiled);
  const entry = join(f.registry, "fragments/extra/FRAGMENT.md");
  writeFileSync(
    entry,
    readFileSync(entry, "utf8").replace(
      "category: tooling",
      "category: app\napplies_to: [sample]\nverify:\n  - name: application\n    layer: test\n    run: 'true'",
    ),
  );
  f.git("add", "packages/cli/registry");
  f.git("commit", "--quiet", "-m", "fixture: add application stage");
  passed(await f.invoke(["--with", "extra", "--keep"]));
  const first = runRecords(f.observe().cwd)[0];
  const note = f.ledger()[0]?.note;
  if (!first || !note) throw new Error("Missing run evidence");
  expect(first.stages?.base).toBe("green");
  expect(first.durationMs).toBeGreaterThan(0);
  const markdown = readFileSync(join(f.root, note), "utf8");
  expect(markdown).toContain(
    `| Time to green base | ${(first.secondsSinceCreated / 60).toFixed(1)} min |`,
  );
}, 60_000);

test("requesting a default fragment preserves the default ledger key [2.0b#1]", async () => {
  const f = benchFixture(space, compiled);
  const entry = join(f.registry, "stacks/sample/STACK.md");
  writeFileSync(
    entry,
    readFileSync(entry, "utf8").replace(
      "  optional: [extra]",
      "  default: [extra]\n  optional: [extra]",
    ),
  );
  f.git("add", "packages/cli/registry");
  f.git("commit", "--quiet", "-m", "fixture: select extra by default");
  passed(await f.invoke(["--with", "extra"]));
  expect(f.ledger()).toMatchObject([{ with: [], result: "pass" }]);
}, 60_000);

test("an agent replacing the metadata directory still records a failed run [2.0b#4]", async () => {
  const f = benchFixture(space, compiled);
  f.configure("write-error");
  const binary = join(f.bin, "claude");
  writeFileSync(
    binary,
    readFileSync(binary, "utf8").replace(
      "  const error =",
      '  rmSync(".quickstacks", { recursive: true, force: true });\n' +
        '  writeFileSync(".quickstacks", "broken metadata\\n");\n  const error =',
    ),
  );
  passed(await f.invoke());
  expect(f.cliCalls().some((call) => call.args.includes("verify"))).toBe(true);
  expect(f.ledger()).toMatchObject([
    {
      result: "fail",
      agentEnded: "error",
      run: null,
      interventions: null,
    },
  ]);
}, 60_000);
