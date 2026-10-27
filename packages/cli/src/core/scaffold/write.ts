import { Effect, Exit, FileSystem, Path, type PlatformError, type Scope } from "effect";
import { PermissionDenied, TargetNotEmpty } from "../../errors";

/**
 * The one way `new` (and later `add`) writes into a project (roadmap, Types and schemas: Safe
 * writer). Every file is created exclusively (never over an existing file or through a final
 * symlink), only after its parent directory's real path is checked to be the project root's real
 * path or under it. Everything it creates is tracked, and a scope finalizer removes it when the
 * scope closes with a failure or an interruption, so a failed `new` leaves no half project.
 */
export type ProjectWriter = {
  /** The project root's real path. */
  readonly root: string;
  /** Creates `rel` with `data`; `executable` adds execute bits wherever read bits are set. */
  readonly write: (
    rel: string,
    data: Uint8Array,
    executable?: boolean,
  ) => Effect.Effect<void, PermissionDenied | TargetNotEmpty>;
  /** Replaces a file this writer created, with the same checks. */
  readonly replace: (rel: string, data: Uint8Array) => Effect.Effect<void, PermissionDenied>;
  /** Creates a directory (and its parents) under the root. */
  readonly directory: (rel: string) => Effect.Effect<void, PermissionDenied | TargetNotEmpty>;
  /**
   * Hands a directory the CLI's own process just created (git's `.git`) to the rollback, which
   * removes it whole.
   */
  readonly adopt: (rel: string) => Effect.Effect<void>;
};

const missing = (error: PlatformError.PlatformError) =>
  error.reason._tag === "NotFound" || error.reason._tag === "BadResource";

/** Whether `path` is `root` or under it; both are real paths. */
export function within(root: string, path: string, separator: string): boolean {
  return path === root || path.startsWith(root.endsWith(separator) ? root : root + separator);
}

/**
 * Opens `dir` for writing, creating it and any missing parents (tracked for rollback), and
 * resolves its real path. The finalizer it adds to the current scope undoes every tracked write
 * unless the scope closes successfully.
 */
export const openProject = (
  dir: string,
): Effect.Effect<
  ProjectWriter,
  PermissionDenied,
  FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const unwritable = (at: string) =>
      new PermissionDenied({ details: { reason: "unwritable", path: at } });
    const escapes = (at: string) =>
      new PermissionDenied({ details: { reason: "escape", path: at } });

    /** Files, then whole directories git made, then directories, each in creation order. */
    const files: string[] = [];
    const adopted: string[] = [];
    const dirs: string[] = [];
    let root = "";

    const rollback = Effect.gen(function* () {
      /** A path is only removed while its parent still resolves inside the project. */
      const inside = (at: string) =>
        fs.realPath(path.dirname(at)).pipe(
          Effect.map((real) => root !== "" && within(root, real, path.sep)),
          Effect.orElseSucceed(() => false),
        );
      for (const file of [...files].reverse())
        if (yield* inside(file)) yield* Effect.ignore(fs.remove(file));
      for (const dir of [...adopted].reverse()) {
        const info = yield* Effect.option(fs.lstat(dir));
        if (info._tag === "Some" && info.value.type === "Directory" && (yield* inside(dir)))
          yield* Effect.ignore(fs.remove(dir, { recursive: true }));
      }
      // Only an empty directory goes: anything else in it isn't ours.
      for (const dir of [...dirs].reverse()) {
        const names = yield* Effect.option(fs.readDirectory(dir));
        if (names._tag === "Some" && names.value.length === 0)
          yield* Effect.ignore(fs.remove(dir, { recursive: true }));
      }
    });
    yield* Effect.addFinalizer((exit) => (Exit.isSuccess(exit) ? Effect.void : rollback));

    // The root and its missing parents, top down, so each one created is tracked.
    const absolute = path.resolve(dir);
    const chain: string[] = [];
    for (let at = absolute; ; at = path.dirname(at)) {
      const info = yield* Effect.option(fs.lstat(at));
      if (info._tag === "Some") break;
      chain.unshift(at);
      if (path.dirname(at) === at) break;
    }
    for (const at of chain) {
      yield* fs.makeDirectory(at).pipe(Effect.mapError(() => unwritable(at)));
      dirs.push(at);
    }
    root = yield* fs.realPath(absolute).pipe(Effect.mapError(() => unwritable(absolute)));

    /** Splits a project-relative path, refusing anything that could leave the root by name. */
    const segments = (rel: string) => {
      const parts = rel.split("/");
      return rel.startsWith("/") ||
        parts.some((part) => part === "" || part === "." || part === "..")
        ? undefined
        : parts;
    };
    /** Creates the directories down to `parts`, then checks the deepest one's real path. */
    const ensure = (parts: ReadonlyArray<string>, rel: string) =>
      Effect.gen(function* () {
        let at = root;
        for (const part of parts) {
          at = path.join(at, part);
          const info = yield* fs.lstat(at).pipe(
            Effect.map((value) => value.type),
            Effect.catch((error) =>
              missing(error) ? Effect.succeed("Missing" as const) : Effect.fail(unwritable(at)),
            ),
          );
          if (info === "Missing") {
            yield* fs
              .makeDirectory(at)
              .pipe(
                Effect.mapError((error) =>
                  error.reason._tag === "AlreadyExists"
                    ? new TargetNotEmpty({ details: { path: root, entries: [rel] } })
                    : unwritable(at),
                ),
              );
            dirs.push(at);
          } else if (info !== "Directory" && info !== "SymbolicLink")
            return yield* new TargetNotEmpty({ details: { path: root, entries: [rel] } });
        }
        // Checked after creating, so a symlink planted on the way can't redirect the write.
        const real = yield* fs.realPath(at).pipe(Effect.mapError(() => unwritable(at)));
        if (!within(root, real, path.sep)) return yield* escapes(path.join(root, rel));
      });

    const create = (rel: string, data: Uint8Array, executable: boolean) =>
      Effect.gen(function* () {
        const parts = segments(rel);
        if (!parts) return yield* escapes(rel);
        yield* ensure(parts.slice(0, -1), rel);
        const file = path.join(root, ...parts);
        // `wx`: never over an existing file, and never through a symlink in the last segment.
        const written = yield* Effect.exit(fs.writeFile(file, data, { flag: "wx" }));
        if (Exit.isFailure(written)) {
          const exists = written.cause.reasons.some(
            (reason) => reason._tag === "Fail" && reason.error.reason._tag === "AlreadyExists",
          );
          if (exists) return yield* new TargetNotEmpty({ details: { path: root, entries: [rel] } });
          // Created exclusively, so whatever is there now (a partial write) is ours.
          files.push(file);
          return yield* unwritable(file);
        }
        files.push(file);
        if (executable) {
          const info = yield* fs.stat(file).pipe(Effect.mapError(() => unwritable(file)));
          yield* fs
            .chmod(file, (info.mode & 0o777) | ((info.mode & 0o444) >> 2))
            .pipe(Effect.mapError(() => unwritable(file)));
        }
      });

    return {
      root,
      write: (rel, data, executable = false) => create(rel, data, executable),
      replace: (rel, data) =>
        Effect.gen(function* () {
          const parts = segments(rel);
          const file = parts ? path.join(root, ...parts) : "";
          if (!parts || !files.includes(file)) return yield* escapes(rel);
          yield* fs.remove(file).pipe(Effect.mapError(() => unwritable(file)));
          files.splice(files.indexOf(file), 1);
          yield* create(rel, data, false).pipe(
            Effect.catchTag("TargetNotEmpty", () => Effect.fail(unwritable(file))),
          );
        }),
      directory: (rel) =>
        Effect.gen(function* () {
          const parts = segments(rel);
          if (!parts) return yield* escapes(rel);
          yield* ensure(parts, rel);
        }),
      adopt: (rel) =>
        Effect.sync(() => {
          adopted.push(path.join(root, rel));
        }),
    } satisfies ProjectWriter;
  });
