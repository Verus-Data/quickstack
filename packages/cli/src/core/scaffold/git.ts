import { Duration, Effect, FileSystem, Option } from "effect";
import { AppConfig, GIT_REPOSITORY_VARIABLES } from "../../config";
import { Processes } from "../../services/processes";
import type { GitState } from "../brief/render";
import type { Target } from "./target";

/**
 * Every git command `new` runs is one of these constants; no entry content reaches git. Each runs
 * without `GIT_REPOSITORY_VARIABLES`, so git finds the repository from `cwd` alone.
 */
const TIMEOUT = Duration.seconds(10);
const TOPLEVEL = "git rev-parse --show-toplevel 2>/dev/null";
const HAS_COMMIT = "git rev-parse --verify --quiet HEAD >/dev/null 2>&1";
const INIT = "git init --quiet";
const USER_NAME = "git config user.name 2>/dev/null";

/** A constant git command in `cwd`; `undefined` when it couldn't start. */
const git = (command: string, cwd: string) =>
  Effect.gen(function* () {
    const processes = yield* Processes;
    const env = (yield* AppConfig).childEnv(GIT_REPOSITORY_VARIABLES);
    return yield* processes
      .run({ command, cwd, env, timeout: TIMEOUT })
      .pipe(Effect.catchTag("SpawnFailed", () => Effect.succeed(undefined)));
  });

const ok = (finished: { exitCode: number; timedOut: boolean } | undefined) =>
  finished !== undefined && finished.exitCode === 0 && !finished.timedOut;

/** Whether git is on the captured PATH (`Processes.which`, the only PATH search). */
export const gitInstalled = Effect.gen(function* () {
  return Option.isSome(yield* (yield* Processes).which("git"));
});

/**
 * Where the target stands with git, before anything is written: `none` without git; `parent`
 * inside another work tree, or in its own `.git` that already has commits; otherwise `fresh`.
 * `init` says whether `new` should run `git init` (not when the target's own `.git` exists).
 */
export const probeGit = (target: Target, installed: boolean) =>
  Effect.gen(function* () {
    if (!installed) return { state: { kind: "none" } as GitState, init: false };
    const fs = yield* FileSystem.FileSystem;
    const found = yield* git(TOPLEVEL, target.nearest);
    const toplevel = ok(found) ? (found?.tail.trim().split("\n").at(-1) ?? "") : "";
    if (!toplevel) return { state: { kind: "fresh" } as GitState, init: true };
    const real = (at: string) => fs.realPath(at).pipe(Effect.orElseSucceed(() => at));
    const own = target.exists && (yield* real(toplevel)) === (yield* real(target.path));
    if (!own) return { state: { kind: "parent", toplevel } as GitState, init: false };
    // The target's own repository: still fresh until something is committed in it.
    const committed = ok(yield* git(HAS_COMMIT, target.path));
    return {
      state: (committed ? { kind: "parent", toplevel } : { kind: "fresh" }) as GitState,
      init: false,
    };
  });

/** `git init --quiet` in the project root: its exit code, or 127 when git couldn't start. */
export const gitInit = (root: string) =>
  Effect.gen(function* () {
    const finished = yield* git(INIT, root);
    if (!finished) return 127;
    return finished.timedOut && finished.exitCode === 0 ? 124 : finished.exitCode;
  });

/** `git config user.name` from `cwd` (the target's nearest existing directory), else empty. */
export const gitUserName = (cwd: string) =>
  Effect.gen(function* () {
    const finished = yield* git(USER_NAME, cwd);
    return ok(finished) ? (finished?.tail.split("\n")[0]?.trim() ?? "") : "";
  });
