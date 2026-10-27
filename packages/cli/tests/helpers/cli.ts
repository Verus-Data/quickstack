import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect, type Exit, Layer, type Scope } from "effect";
import { AppConfig, type Environment } from "../../src/config";
import { hasFlag, main } from "../../src/main";
import { AppLayer, runInvocation } from "../../src/runtime";
import { Host, type HostInfo } from "../../src/services/host";
import { Output, type Writer } from "../../src/services/output";
import { Foreground, Processes } from "../../src/services/processes";
export function tempDir() {
  const path = mkdtempSync(join(tmpdir(), "cli-base-"));
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}
/** A terminal on stdout: with no agent marker in `env`, the invocation's audience is human. */
export const terminal = { stdoutIsTTY: true } as const;
/** No log records, so a human-mode failure's stderr is only its message and detail lines. */
export const quiet = { LOG_LEVEL: "none" };
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
    /** Overrides for the Host fixture, such as the TTY flags. */
    host?: Partial<HostInfo>;
    /** Runs before each write is captured; a rejection fails that write as the real stream would. */
    stdout?: Writer;
    stderr?: Writer;
  } = {},
) {
  const temp = options.home ? undefined : tempDir();
  const home = options.home ?? temp?.path ?? "/invalid";
  const env = { HOME: home, XDG_CONFIG_HOME: join(home, "config"), NO_COLOR: "1", ...options.env };
  const stdout: string[] = [];
  const stderr: string[] = [];
  const capture =
    (into: string[], gate?: Writer): Writer =>
    async (text) => {
      await gate?.(text);
      into.push(text);
    };
  const output = Output.layer(
    hasFlag(args, "--json"),
    capture(stdout, options.stdout),
    capture(stderr, options.stderr),
  );
  const platform = Layer.mergeAll(
    NodeServices.layer,
    Host.memory({ platform: "test-node", cwd: home, ...options.host }),
    Foreground.layer(Foreground.make()),
  );
  try {
    const status = await runInvocation(
      main(args, options.program).pipe(
        Effect.provide(Layer.provideMerge(AppLayer(output, env), platform)),
        Effect.scoped,
      ),
      options.signal,
    );
    return { status, stdout: stdout.join(""), stderr: stderr.join("") };
  } finally {
    temp?.cleanup();
  }
}
/** A write error as Node reports it, with its errno code. */
export function writeError(code: "EPIPE" | "EACCES") {
  return Object.assign(new Error(code), { code });
}
/**
 * Runs `program` against the live Processes layer: real child processes, the real filesystem, and
 * an AppConfig that captured only `env` (by default just this machine's PATH).
 */
export function runProcesses<A, E>(
  program: Effect.Effect<A, E, Processes | AppConfig | Foreground | Scope.Scope>,
  env: Environment = { PATH: process.env.PATH },
): Promise<Exit.Exit<A, E>> {
  const deps = Layer.mergeAll(AppConfig.memory(env), Foreground.layer(Foreground.make()));
  const layer = Processes.layer.pipe(
    Layer.provideMerge(deps),
    Layer.provideMerge(NodeServices.layer),
  );
  return Effect.runPromiseExit(program.pipe(Effect.scoped, Effect.provide(layer)));
}
/**
 * `kill(pid, 0)` liveness, for a process or (with a negative pid) a process group: success or
 * EPERM is alive (a macOS zombie member answers EPERM), ESRCH is gone.
 */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
