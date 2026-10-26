#!/usr/bin/env bun
import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { hasFlag, main } from "./main";
import { AppLayer, runInvocation } from "./runtime";
import { Host } from "./services/host";
import { Output, type Writer } from "./services/output";

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
const platform = Layer.mergeAll(
  BunServices.layer,
  output,
  Host.layer({
    platform: process.platform,
    executable: process.execPath,
    compiled: Bun.isStandaloneExecutable,
    cwd: process.cwd(),
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
  }),
);
const layer = Layer.provideMerge(AppLayer(), platform);
const controller = new AbortController();
const abort = () => controller.abort();
process.on("SIGINT", abort);
process.on("SIGTERM", abort);
try {
  process.exitCode = await runInvocation(
    main(args).pipe(Effect.provide(layer), Effect.scoped),
    controller.signal,
  );
} finally {
  process.off("SIGINT", abort);
  process.off("SIGTERM", abort);
}
