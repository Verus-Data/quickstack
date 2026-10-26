// The one place the CLI spawns, signals and probes processes through Node's process APIs (Bun
// implements the same `node:child_process` and `process.kill`). `services/processes.ts` builds
// the Processes service on top of these and touches no process API itself.
import { spawn } from "node:child_process";
import { constants } from "node:os";
import { Deferred, Effect, Exit } from "effect";

export type ChildExit = {
  /** The exit status, or 128 + n when signal n killed the process. */
  code: number;
  signal?: string;
  /** From spawn to exit, by the wall clock. */
  durationMs: number;
};
export type Child = {
  readonly pid: number;
  /** The process exited. */
  readonly exited: Effect.Effect<ChildExit>;
  /** The process exited and its stdout and stderr have closed. */
  readonly closed: Effect.Effect<void>;
  readonly running: () => boolean;
};
/**
 * One invocation's live processes, shared by the Processes service and bin.ts's signal policy:
 * the process groups started and not yet seen gone (SIGKILLed before a forced exit), the
 * interactive child holding the terminal, if any, and a callback the policy sets to hear when
 * that child is gone.
 */
export type ProcessHolder = {
  readonly groups: Set<number>;
  foreground: number | undefined;
  onForegroundCleared: (() => void) | undefined;
};
export type SpawnRequest = {
  file: string;
  args: readonly string[];
  cwd: string;
  env: Record<string, string>;
  /** `true` makes the child the leader of a new process group. */
  detached: boolean;
  /** `pipe`: stdin ignored, stdout and stderr piped to `onData`. `inherit`: all three inherited. */
  stdio: "pipe" | "inherit";
  onData?: (stream: "stdout" | "stderr", chunk: Uint8Array) => void;
};

/** Spawns `file` with `args` as a list, never through a shell. Fails with the errno code. */
export function spawnChild(request: SpawnRequest): Effect.Effect<Child, { errno: string }> {
  return Effect.gen(function* () {
    const exit = yield* Deferred.make<ChildExit>();
    const close = yield* Deferred.make<void>();
    return yield* Effect.callback<Child, { errno: string }>((resume) => {
      const started = Date.now();
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(request.file, request.args, {
          cwd: request.cwd,
          env: request.env,
          detached: request.detached,
          stdio: request.stdio === "pipe" ? ["ignore", "pipe", "pipe"] : "inherit",
        });
      } catch (error) {
        // Node rejects some arguments synchronously, such as a NUL byte in argv or env.
        resume(Effect.fail({ errno: (error as NodeJS.ErrnoException).code ?? "UNKNOWN" }));
        return;
      }
      let spawned = false;
      child.on("error", (error: NodeJS.ErrnoException) => {
        if (!spawned) resume(Effect.fail({ errno: error.code ?? "UNKNOWN" }));
      });
      child.stdout?.on("data", (chunk: Uint8Array) => request.onData?.("stdout", chunk));
      child.stderr?.on("data", (chunk: Uint8Array) => request.onData?.("stderr", chunk));
      child.on("exit", (code, signal) => {
        Deferred.doneUnsafe(
          exit,
          Exit.succeed({
            code: code ?? 128 + signalNumber(signal),
            ...(signal ? { signal } : {}),
            durationMs: Date.now() - started,
          }),
        );
      });
      child.on("close", () => Deferred.doneUnsafe(close, Exit.void));
      child.on("spawn", () => {
        spawned = true;
        resume(
          Effect.succeed({
            pid: child.pid as number,
            exited: Deferred.await(exit),
            closed: Deferred.await(close),
            running: () => child.exitCode === null && child.signalCode === null,
          }),
        );
      });
    });
  });
}

function signalNumber(signal: string | null): number {
  return signal ? (constants.signals[signal as NodeJS.Signals] ?? 0) : 0;
}

/** Sends `signal` to every process in the group `pid` leads. False when none could be signaled. */
export function killGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

/** Sends `signal` to the one process `pid`. False when it couldn't be signaled. */
export function killProcess(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether any process in the group `pid` leads still exists. Success or EPERM is alive (a macOS
 * zombie member can answer EPERM); ESRCH is gone.
 */
export function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** SIGKILLs every group, synchronously, ignoring failures: for an exit that skips finalizers. */
export function killGroupsNow(groups: Iterable<number>): void {
  for (const pid of groups) killGroup(pid, "SIGKILL");
}
