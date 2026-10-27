import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Layer } from "effect";
import { invocationFor } from "./invocation";
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
const registry = fileURLToPath(new URL("../registry/", import.meta.url));
// Replaced by Bun at build time; source development has no escaped asset paths.
declare const PACKAGED_GITIGNORES: ReadonlyArray<string>;
// npm drops literal .gitignore members even when present in a tarball. Only this installed
// registry's reads translate the packer's escape; authors and core see the original names.
const packagedFiles = Layer.effect(
  FileSystem.FileSystem,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const escapedPaths = new Set(
      (typeof PACKAGED_GITIGNORES === "undefined" ? [] : PACKAGED_GITIGNORES).map(
        (file) => `${registry}${file}`,
      ),
    );
    const resolve = (file: string) =>
      escapedPaths.has(file)
        ? Effect.map(fs.exists(`${file}.quickstack`), (exists) =>
            exists ? `${file}.quickstack` : file,
          )
        : Effect.succeed(file);
    return {
      ...fs,
      exists: (file: string) => Effect.flatMap(resolve(file), fs.exists),
      lstat: (file: string) => Effect.flatMap(resolve(file), fs.lstat),
      stat: (file: string) => Effect.flatMap(resolve(file), fs.stat),
      realPath: (file: string) => Effect.flatMap(resolve(file), fs.realPath),
      readFile: (file: string) => Effect.flatMap(resolve(file), fs.readFile),
      readFileString: (file: string, encoding?: string) =>
        Effect.flatMap(resolve(file), (at) => fs.readFileString(at, encoding)),
      readDirectory: (file: string) =>
        fs
          .readDirectory(file)
          .pipe(
            Effect.map((names) =>
              escapedPaths.has(`${file}/.gitignore`)
                ? names.map((name) => (name === ".gitignore.quickstack" ? ".gitignore" : name))
                : names,
            ),
          ),
    };
  }),
).pipe(Layer.provide(NodeServices.layer));
const platform = Layer.mergeAll(
  NodeServices.layer,
  packagedFiles,
  Foreground.layer(holder),
  NetLayer,
  Host.layer({
    platform: process.platform,
    executable: process.execPath,
    cwd: process.cwd(),
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
    ...(process.stdout.isTTY && process.stdout.columns
      ? { stdoutColumns: process.stdout.columns }
      : {}),
    registry,
    skill: fileURLToPath(new URL("../skill/", import.meta.url)),
    authoring: fileURLToPath(new URL("../docs/authoring.md", import.meta.url)),
    invocation: invocationFor(process.argv[1] ?? ""),
  }),
);
const layer = Layer.provideMerge(AppLayer(output), platform);
const controller = new AbortController();
const removeSignalPolicy = installSignalPolicy(holder, () => controller.abort());
try {
  process.exitCode = await runInvocation(
    main(args).pipe(Effect.provide(layer), Effect.scoped),
    controller.signal,
  );
} finally {
  removeSignalPolicy();
}
