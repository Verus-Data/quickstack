import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import type { Environment } from "../../src/config";
import { hasFlag, main } from "../../src/main";
import { AppLayer, runInvocation } from "../../src/runtime";
import { Host } from "../../src/services/host";
import { Output } from "../../src/services/output";
export function tempDir() {
  const path = mkdtempSync(join(tmpdir(), "cli-base-"));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}
export function ndjson(text: string): unknown[] {
  return text.trim()
    ? text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as unknown)
    : [];
}
export async function runCli(
  args: readonly string[],
  options: {
    env?: Environment;
    home?: string;
    program?: Parameters<typeof main>[1];
    signal?: AbortSignal;
  } = {},
) {
  const temp = options.home ? undefined : tempDir();
  const home = options.home ?? temp?.path ?? "/invalid";
  const env = { HOME: home, XDG_CONFIG_HOME: join(home, "config"), NO_COLOR: "1", ...options.env };
  const captured = Output.memory(hasFlag(args, "--json"));
  const platform = Layer.mergeAll(
    NodeServices.layer,
    captured.layer,
    Host.layer({ platform: "test-node", compiled: false, executable: "/test/cli", cwd: home }),
  );
  try {
    const status = await runInvocation(
      main(args, options.program).pipe(
        Effect.provide(Layer.provideMerge(AppLayer(env), platform)),
        Effect.scoped,
      ),
      options.signal,
    );
    return { status, stdout: captured.stdout.join(""), stderr: captured.stderr.join("") };
  } finally {
    temp?.cleanup();
  }
}
