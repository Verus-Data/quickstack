import { Effect, FileSystem, Path } from "effect";
import { PermissionDenied, TargetNotEmpty } from "../../errors";

/** Files an OS drops into any directory a person opened: treated as absent, left alone. */
export const isLitter = (name: string) =>
  name === ".DS_Store" || name === "Thumbs.db" || name === "desktop.ini" || name.startsWith("._");

export type Target = {
  /** Absolute. */
  path: string;
  exists: boolean;
  /** It holds a `.git` (a directory or a gitfile), and nothing else but litter. */
  git: boolean;
  /** The target if it exists, else its nearest existing parent: where git is asked about it. */
  nearest: string;
};

/**
 * Checks `dir` before anything is written: missing, empty, `.git`-only and litter-only are usable;
 * anything else is `TargetNotEmpty` with up to ten names (sorted, litter excluded). A path that
 * exists but isn't a directory (including a dangling symlink) is `TargetNotEmpty` with no names.
 */
export const inspectTarget = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const notEmpty = (entries: ReadonlyArray<string>) =>
      new TargetNotEmpty({ details: { path: dir, entries: [...entries] } });
    const present = yield* Effect.option(fs.lstat(dir));
    if (present._tag === "None") {
      let nearest = path.dirname(dir);
      while (
        (yield* Effect.option(fs.stat(nearest)))._tag === "None" &&
        path.dirname(nearest) !== nearest
      )
        nearest = path.dirname(nearest);
      return { path: dir, exists: false, git: false, nearest } satisfies Target;
    }
    const info = yield* Effect.option(fs.stat(dir));
    if (info._tag === "None" || info.value.type !== "Directory") return yield* notEmpty([]);
    const names = yield* fs
      .readDirectory(dir)
      .pipe(
        Effect.mapError(() => new PermissionDenied({ details: { reason: "read", path: dir } })),
      );
    const other = names.filter((name) => name !== ".git" && !isLitter(name)).sort();
    if (other.length) return yield* notEmpty(other.slice(0, 10));
    return { path: dir, exists: true, git: names.includes(".git"), nearest: dir } satisfies Target;
  });
