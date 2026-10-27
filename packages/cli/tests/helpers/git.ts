import { type SpawnSyncOptions, spawnSync } from "node:child_process";
import { GIT_REPOSITORY_VARIABLES } from "../../src/config";

/**
 * This process's environment without the variables that point git at a repository. A git hook
 * (lefthook's pre-push runs the tests) exports `GIT_DIR`, and a test's own git call would
 * otherwise work on this checkout instead of its temporary directory.
 */
export function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of GIT_REPOSITORY_VARIABLES) delete env[name];
  return env;
}

/** `git ...args` on the real PATH, with `gitEnv()` unless `options.env` is given. */
export function spawnGit(args: readonly string[], options: SpawnSyncOptions = {}) {
  return spawnSync("git", args, { env: gitEnv(), ...options });
}
