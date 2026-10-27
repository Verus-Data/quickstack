// A stand-in for bin.ts in tests/signals.test.ts: the real signal policy, the real Bun platform
// layer and the live Processes service, running one scenario instead of the command tree.
// Usage: bun tests/fixtures/signals.ts <interactive|start|slow> <dir>
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BunServices } from "@effect/platform-bun";
import { Duration, Effect, Layer } from "effect";
import { AppConfig } from "../../src/config";
import { installSignalPolicy } from "../../src/platform/signals";
import { runInvocation } from "../../src/runtime";
import { Foreground, Processes } from "../../src/services/processes";

const [scenario, dir] = process.argv.slice(2) as [string, string];
const mark = (name: string, value = "yes") =>
  Effect.sync(() => writeFileSync(join(dir, name), value));

const holder = Foreground.make();
const layer = Processes.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(AppConfig.layer(), Foreground.layer(holder))),
  Layer.provideMerge(BunServices.layer),
);
const program = Effect.gen(function* () {
  const processes = yield* Processes;
  const env = (yield* AppConfig).childEnv([]);
  if (scenario === "interactive") {
    const code = yield* processes.interactive({
      bin: process.execPath,
      args: [join(import.meta.dirname, "trap-child.ts"), dir],
      cwd: dir,
      env,
    });
    yield* mark("parent-done", String(code));
    // Stay, as a command does after a handoff, until the test has sent its late signal and says
    // so with a `release` file (at most 10 s), so a loaded machine can't close the window first.
    for (let waited = 0; waited < 10_000 && !existsSync(join(dir, "release")); waited += 20)
      yield* Effect.sleep(Duration.millis(20));
    return code;
  }
  yield* processes.start({ command: "echo $$ > leader; sleep 60", cwd: dir, env });
  if (scenario === "slow")
    yield* Effect.addFinalizer(() =>
      Effect.sleep(Duration.seconds(2)).pipe(Effect.andThen(mark("finalized"))),
    );
  yield* mark("ready");
  return yield* Effect.never;
}).pipe(Effect.provide(layer), Effect.scoped, Effect.orDie);

const controller = new AbortController();
const dispose = installSignalPolicy(holder, () => controller.abort());
try {
  process.exitCode = await runInvocation(program, controller.signal);
} finally {
  dispose();
}
