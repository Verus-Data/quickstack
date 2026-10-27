// A stand-in for bin.ts in tests/handoff-signals.test.ts: the real command tree, signal policy,
// Bun platform and live Processes, with the TTY flags set as a terminal would set them (a test
// can't give the process a terminal) and the registry root from the first argument.
// Usage: bun tests/fixtures/handoff-bin.ts <registry> <cli args...>
import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { hasFlag, main } from "../../src/main";
import { NetLayer } from "../../src/platform/net";
import { installSignalPolicy } from "../../src/platform/signals";
import { AppLayer, runInvocation } from "../../src/runtime";
import { Host } from "../../src/services/host";
import { Output, type Writer } from "../../src/services/output";
import { Foreground } from "../../src/services/processes";

const [registry, ...args] = process.argv.slice(2) as [string, ...string[]];
const writer =
  (stream: NodeJS.WriteStream): Writer =>
  (text) =>
    new Promise((resolve, reject) => {
      stream.write(text, (error) => (error ? reject(error) : resolve()));
    });
const holder = Foreground.make();
const platform = Layer.mergeAll(
  BunServices.layer,
  Foreground.layer(holder),
  NetLayer,
  Host.layer({
    platform: process.platform,
    executable: process.execPath,
    compiled: false,
    cwd: process.cwd(),
    stdinIsTTY: true,
    stdoutIsTTY: true,
    registry,
    skill: "",
    authoring: "",
    invocation: "quickstack",
  }),
);
const controller = new AbortController();
const dispose = installSignalPolicy(holder, () => controller.abort());
try {
  process.exitCode = await runInvocation(
    main(args).pipe(
      Effect.provide(
        Layer.provideMerge(
          AppLayer(
            Output.layer(hasFlag(args, "--json"), writer(process.stdout), writer(process.stderr)),
          ),
          platform,
        ),
      ),
      Effect.scoped,
    ),
    controller.signal,
  );
} finally {
  dispose();
}
