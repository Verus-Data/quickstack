#!/usr/bin/env bun
import { dirname, join } from "node:path";
import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { readStackInfos, shouldShowStacks, stackLines } from "./core/wizard";
import { hasFlag, main } from "./main";
import { NetLayer } from "./platform/net";
import { installSignalPolicy } from "./platform/signals";
import { AppLayer, runInvocation } from "./runtime";
import { Host } from "./services/host";
import { Output, type Writer } from "./services/output";
import { Foreground } from "./services/processes";

const writer =
  (stream: NodeJS.WriteStream): Writer =>
  (text) =>
    new Promise((resolve, reject) => {
      stream.write(text, (error) => (error ? reject(error) : resolve()));
    });
// Stream errors are also delivered to each write callback; this prevents Node's default uncaught event report.
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});
const args = process.argv.slice(2);
const output = Output.layer(
  hasFlag(args, "--json"),
  writer(process.stdout),
  writer(process.stderr),
);
// This invocation's process groups and interactive child, shared with the signal policy.
const holder = Foreground.make();
const platform = Layer.mergeAll(
  BunServices.layer,
  Foreground.layer(holder),
  NetLayer,
  Host.layer({
    platform: process.platform,
    executable: process.execPath,
    compiled: Bun.isStandaloneExecutable,
    cwd: process.cwd(),
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
    ...(process.stdout.isTTY && process.stdout.columns
      ? { stdoutColumns: process.stdout.columns }
      : {}),
    // A stub until 0.2 resolves the bundled registry inside the npm package. A compiled binary's
    // `import.meta.dirname` is Bun's virtual `/$bunfs`, so it looks beside its own `bin/`
    // directory instead: `dist/quickstacks` finds the package's `registry/`, and a copy installed
    // as `<prefix>/bin/quickstacks` finds `<prefix>/registry`.
    registry: Bun.isStandaloneExecutable
      ? join(dirname(process.execPath), "..", "registry")
      : join(import.meta.dirname, "..", "registry"),
    skill: Bun.isStandaloneExecutable
      ? join(dirname(process.execPath), "..", "skill")
      : join(import.meta.dirname, "..", "skill"),
    invocation: "quickstacks",
  }),
);
const layer = Layer.provideMerge(AppLayer(output), platform);
const controller = new AbortController();
const removeSignalPolicy = installSignalPolicy(holder, () => controller.abort());
// Before the framework wizard runs, show the available stacks for `new --wizard` (or `new` with
// no stack on a terminal). JSON mode is silent. Best effort: a registry that can't be read here
// will be reported by the command itself.
if (shouldShowStacks(args, process.stdin.isTTY === true)) {
  try {
    const stacks = await Effect.runPromise(
      readStackInfos.pipe(Effect.provide(layer), Effect.scoped),
    );
    const lines = stackLines(stacks);
    if (lines.length) await writer(process.stderr)(`Available stacks:\n${lines.join("\n")}\n\n`);
  } catch {
    // The command will report its own errors.
  }
}
try {
  process.exitCode = await runInvocation(
    main(args).pipe(Effect.provide(layer), Effect.scoped),
    controller.signal,
  );
} finally {
  removeSignalPolicy();
}
