import { Effect, FileSystem, Path, type PlatformError, Random, Schema } from "effect";
import { AppConfig } from "../config";
import { PermissionDenied } from "../errors";
import type { Manifest } from "../schemas/manifest";
import { digestSettings, digestStep } from "./manifest";
import { printable } from "./text";

/**
 * The second copy of a project's verify digest, outside the project, at
 * `$XDG_STATE_HOME/quickstacks/projects/<projectId>.json`. `stepDigests` and `settingsDigest`
 * only explain a changed `verifyDigest` (1.3b's `VerifyChanged`); the whole-set digest decides.
 */
export const ProjectState = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  projectId: Schema.String,
  /** Real path of `.quickstacks/manifest.json`, so a lookup by path matches however it was reached. */
  manifestPath: Schema.String,
  verifyDigest: Schema.String,
  /** Step name to `digestStep` of that step. */
  stepDigests: Schema.Record(Schema.String, Schema.String),
  /** `digestSettings` over the manifest's `env` and `preset`. */
  settingsDigest: Schema.String,
  createdAt: Schema.String,
  /** Filled by 1.3b. */
  firstGreenAt: Schema.NullOr(Schema.String),
  /** Filled by 1.3b. */
  firstTestPassAt: Schema.NullOr(Schema.String),
});
export type ProjectState = typeof ProjectState.Type;

/** Whether the record was written, and where: `new` reports `stateRecord` and rolls back `path`. */
export type StateWrite = { written: true; path: string } | { written: false };

/** The record a manifest gets; `manifestPath` must already be a real path. */
export function projectStateFor(manifest: Manifest, manifestPath: string): ProjectState {
  return {
    schemaVersion: 1,
    projectId: manifest.projectId,
    manifestPath,
    verifyDigest: manifest.verifyDigest,
    stepDigests: Object.fromEntries(manifest.verify.map((step) => [step.name, digestStep(step)])),
    settingsDigest: digestSettings(manifest),
    createdAt: manifest.createdAt,
    firstGreenAt: null,
    firstTestPassAt: null,
  };
}

/** Where a project's record lives. The manifest schema limits ids to letters, digits and `-`. */
export const projectStatePath = (projectId: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const paths = yield* (yield* AppConfig).paths;
    return path.join(paths.state, "projects", `${projectId}.json`);
  });

const reasonOf = (error: PlatformError.PlatformError) => error.reason._tag;

/**
 * Writes the state record for a manifest that is already on disk at `manifestPath`. The record
 * holds that file's real path. A manifest that can't be resolved is `PermissionDenied` (`read`).
 * The state directory being unwritable is not an error: the result is `{ written: false }` and a
 * warning is logged, since some agent sandboxes allow writes only inside the project.
 *
 * The record is written to a fresh temporary file (exclusive create, so nothing planted there is
 * followed) and renamed over `<projectId>.json`, which replaces a link rather than writing
 * through it. `removeProjectState` undoes it.
 */
export const writeProjectState = (
  manifest: Manifest,
  manifestPath: string,
): Effect.Effect<StateWrite, PermissionDenied, FileSystem.FileSystem | Path.Path | AppConfig> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const real = yield* fs
      .realPath(manifestPath)
      .pipe(
        Effect.mapError(
          () => new PermissionDenied({ details: { reason: "read", path: manifestPath } }),
        ),
      );
    const target = yield* projectStatePath(manifest.projectId);
    const text = `${JSON.stringify(Schema.encodeSync(ProjectState)(projectStateFor(manifest, real)), null, 2)}\n`;
    const suffix = (yield* Random.nextIntBetween(0, 0xffffff)).toString(16);
    const temporary = `${target}.${suffix}.tmp`;
    return yield* Effect.gen(function* () {
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs
        .writeFileString(temporary, text, { flag: "wx" })
        .pipe(Effect.onError(() => Effect.ignore(fs.remove(temporary))));
      yield* fs
        .rename(temporary, target)
        .pipe(Effect.onError(() => Effect.ignore(fs.remove(temporary))));
      return { written: true, path: target } as const;
    }).pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.logWarning(
          `Project state record not written (${reasonOf(error)}): ${printable(target)}`,
        ).pipe(Effect.as({ written: false } as const)),
      ),
    );
  });

/** Rollback for `writeProjectState`: removes the record if it is there; never fails. */
export const removeProjectState = (
  write: StateWrite,
): Effect.Effect<void, never, FileSystem.FileSystem> =>
  write.written
    ? Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* Effect.ignore(fs.remove(write.path));
      })
    : Effect.void;

/**
 * The record for a project id, or `undefined` when there is none or it can't be read or decoded
 * (Schema versions: an unreadable record is treated as missing).
 */
export const readProjectState = (
  projectId: string,
): Effect.Effect<ProjectState | undefined, never, FileSystem.FileSystem | Path.Path | AppConfig> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const target = yield* projectStatePath(projectId);
    return yield* fs.readFileString(target).pipe(
      Effect.flatMap((text) =>
        Effect.try({ try: () => JSON.parse(text) as unknown, catch: () => undefined }),
      ),
      Effect.flatMap(Schema.decodeUnknownEffect(ProjectState, { onExcessProperty: "error" })),
      Effect.orElseSucceed(() => undefined),
    );
  });
