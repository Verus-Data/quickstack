import { Context, Effect, FileSystem, Layer, Path, type PlatformError } from "effect";
import { AppConfig } from "../../config";
import { EntryInvalid, NotFound, PermissionDenied } from "../../errors";
import { Host } from "../../services/host";
import { printable } from "../text";
import {
  decodeEntry,
  type Entry,
  type EntryFile,
  type Kind,
  markdownFile,
  type Origin,
  type RejectedEntry,
} from "./entry";

/**
 * One registry root. `overridden` marks a bundled root set by QUICKSTACKS_REGISTRY_DIR instead of
 * the one shipped with the CLI, whose entries are untrusted.
 */
export type RegistryRoot = { origin: Origin; path: string; overridden?: boolean };
/** Registry roots, highest precedence first (roadmap, Contracts: Registry view). */
export type RegistryRoots = ReadonlyArray<RegistryRoot>;
type Reason = "decode" | "symlink" | "id_mismatch" | "missing" | "unreadable";
/** A rejected entry plus what `get` needs to report it. */
type Rejection = { rejected: RejectedEntry; reason: Reason; path?: string };
type Found = Omit<Entry, "shadows" | "trusted">;
type Candidate = { _tag: "Entry"; entry: Found } | { _tag: "Rejected"; rejection: Rejection };
/** Every regular file under a directory, or the first symlink met (nothing past it is read). */
type Walked =
  | { _tag: "Files"; files: ReadonlyArray<{ rel: string; mode: number }> }
  | { _tag: "Link"; rel: string };

const kinds = [
  { kind: "stack", dir: "stacks" },
  { kind: "fragment", dir: "fragments" },
] as const satisfies ReadonlyArray<{ kind: Kind; dir: string }>;

/**
 * Whether an entry is trusted. By origin and root in 1.0: project entries never are, nor are
 * entries from a bundled root set by QUICKSTACKS_REGISTRY_DIR; user entries and the shipped
 * bundled ones are (Trust model, point 2; D19). 3.2a adds the trust store's digests.
 */
export function trustOf(entry: Omit<Entry, "trusted">, root: RegistryRoot): boolean {
  return entry.origin !== "project" && !root.overridden;
}

const notFound = (error: PlatformError.PlatformError) =>
  error.reason._tag === "NotFound" || error.reason._tag === "BadResource";

/**
 * The bundled root: QUICKSTACKS_REGISTRY_DIR resolved against the cwd when set, else
 * `Host.registry`. `found` when it is a directory; a variable naming no directory is a warning.
 */
export const bundledRoot = Effect.gen(function* () {
  const host = yield* Host;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const paths = yield* (yield* AppConfig).paths;
  const overridden = paths.registry !== undefined;
  const at = paths.registry === undefined ? host.registry : path.resolve(host.cwd, paths.registry);
  const found = yield* fs.stat(at).pipe(
    Effect.map((info) => info.type === "Directory"),
    Effect.orElseSucceed(() => false),
  );
  if (overridden && !found)
    yield* Effect.logWarning(`QUICKSTACKS_REGISTRY_DIR is not a directory: ${printable(at)}`);
  return { path: at, overridden, found };
});

/** `project`, `user`, `bundled`: `./.quickstacks/` in the cwd, the user directory, `bundledRoot`. */
export const defaultRoots = Effect.gen(function* () {
  const host = yield* Host;
  const path = yield* Path.Path;
  const paths = yield* (yield* AppConfig).paths;
  const bundled = yield* bundledRoot;
  return [
    { origin: "project", path: path.join(host.cwd, ".quickstacks") },
    { origin: "user", path: paths.user },
    { origin: "bundled", path: bundled.path, overridden: bundled.overridden },
  ] satisfies RegistryRoots;
});

export class Registry extends Context.Service<
  Registry,
  {
    /** Every winning entry and every rejected one: stacks first, then fragments, each by id. */
    readonly all: Effect.Effect<ReadonlyArray<Entry | RejectedEntry>, PermissionDenied>;
    /** An unreadable entry is `PermissionDenied`; any other rejected one is `EntryInvalid`. */
    readonly get: (
      kind: Kind,
      id: string,
    ) => Effect.Effect<Entry, NotFound | EntryInvalid | PermissionDenied>;
    /** `files/` and `adapters/` of an entry, sorted by `source`. */
    readonly files: (
      entry: Entry,
    ) => Effect.Effect<ReadonlyArray<EntryFile>, EntryInvalid | PermissionDenied>;
  }
>()("quickstacks/Registry") {
  /**
   * Symlinks: an entry directory or anything inside one is never followed, in any root. The
   * project root and its `stacks/` and `fragments/` must be real directories too (a warning, and
   * that root or directory is skipped), since a checkout controls them. The user and bundled
   * roots may be symlinks, as may their `stacks/` and `fragments/`: the user put them there, or a
   * package manager linked the install.
   */
  static layer = (roots: RegistryRoots) =>
    Layer.effect(
      Registry,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        /** Names in a directory, sorted; a missing directory is empty. */
        const names = (dir: string) =>
          fs.readDirectory(dir).pipe(
            Effect.map((found) => [...found].sort()),
            Effect.catch((error) =>
              notFound(error)
                ? Effect.succeed([] as string[])
                : Effect.fail(new PermissionDenied({ details: { reason: "read", path: dir } })),
            ),
          );
        /** True when `dir` is a symlink; logs that it was skipped. */
        const linked = (dir: string) =>
          fs.lstat(dir).pipe(
            Effect.map((info) => info.type === "SymbolicLink"),
            Effect.orElseSucceed(() => false),
            Effect.tap((link) =>
              link
                ? Effect.logWarning(
                    `Skipped the project registry at ${printable(dir)}: it is a symlink`,
                  )
                : Effect.void,
            ),
          );
        /**
         * Regular files under `dir`, depth first by sorted name, stopping at the first symlink.
         * Each name is lstat'ed before anything descends into it, so a link is never followed.
         */
        const walk = (dir: string, rel = ""): Effect.Effect<Walked, PlatformError.PlatformError> =>
          Effect.gen(function* () {
            const files: Array<{ rel: string; mode: number }> = [];
            const found = yield* fs.readDirectory(rel ? path.join(dir, rel) : dir);
            for (const name of [...found].sort()) {
              const at = rel ? `${rel}/${name}` : name;
              const info = yield* fs.lstat(path.join(dir, at));
              if (info.type === "SymbolicLink") return { _tag: "Link", rel: at } as const;
              if (info.type === "Directory") {
                const inner = yield* walk(dir, at);
                if (inner._tag === "Link") return inner;
                files.push(...inner.files);
              } else if (info.type === "File") files.push({ rel: at, mode: info.mode & 0o777 });
            }
            return { _tag: "Files", files } as const;
          });

        const candidate = (origin: Origin, kind: Kind, dir: string, id: string) =>
          Effect.gen(function* () {
            const reject = (reason: Reason, error: string, at?: string): Candidate => ({
              _tag: "Rejected",
              rejection: {
                rejected: { id, kind, origin, dir, error },
                reason,
                ...(at === undefined ? {} : { path: at }),
              },
            });
            const self = yield* Effect.result(fs.lstat(dir));
            if (self._tag === "Failure")
              return reject("unreadable", "the entry directory is unreadable", ".");
            if (self.success.type === "SymbolicLink")
              return reject("symlink", "the entry directory is a symlink", ".");
            if (self.success.type !== "Directory") return undefined;
            const walked = yield* Effect.result(walk(dir));
            if (walked._tag === "Failure")
              return reject("unreadable", "the entry directory is unreadable", ".");
            if (walked.success._tag === "Link")
              return reject("symlink", `symlink: ${walked.success.rel}`, walked.success.rel);
            const file = markdownFile(kind);
            const text = yield* Effect.result(fs.readFileString(path.join(dir, file)));
            if (text._tag === "Failure")
              return notFound(text.failure)
                ? reject("missing", `${file} is missing`, file)
                : reject("unreadable", `${file} is unreadable`, file);
            const decoded = yield* decodeEntry(kind, text.success);
            switch (decoded._tag) {
              case "Newer":
                yield* Effect.logWarning(
                  `Skipped ${origin} ${kind} ${printable(id)}: schema_version ${decoded.version} is newer than this CLI reads`,
                );
                return undefined;
              case "Invalid":
                return reject("decode", decoded.error, file);
              case "Meta":
                if (decoded.meta.id !== id)
                  return reject(
                    "id_mismatch",
                    `id: ${JSON.stringify(decoded.meta.id)} must equal the directory name ${JSON.stringify(id)}`,
                    file,
                  );
                return {
                  _tag: "Entry",
                  entry: { id, kind, origin, dir, meta: decoded.meta, body: decoded.body },
                } satisfies Candidate;
            }
          });

        const load = Effect.gen(function* () {
          const found = new Map<string, Array<{ root: RegistryRoot; candidate: Candidate }>>();
          for (const root of roots) {
            const strict = root.origin === "project";
            if (strict && (yield* linked(root.path))) continue;
            for (const { kind, dir } of kinds) {
              const parent = path.join(root.path, dir);
              if (strict && (yield* linked(parent))) continue;
              for (const id of yield* names(parent)) {
                const loaded = yield* candidate(root.origin, kind, path.join(parent, id), id);
                if (!loaded) continue;
                const key = `${kind}/${id}`;
                found.set(key, [...(found.get(key) ?? []), { root, candidate: loaded }]);
              }
            }
          }
          const results: Array<Entry | Rejection> = [];
          for (const [winner, ...hidden] of found.values()) {
            if (!winner) continue;
            const shadows = [...new Set(hidden.map(({ root }) => root.origin))];
            const { candidate } = winner;
            if (candidate._tag === "Entry") {
              const entry = { ...candidate.entry, shadows };
              results.push({ ...entry, trusted: trustOf(entry, winner.root) });
            } else {
              const { rejected } = candidate.rejection;
              const hides = shadows.length
                ? `; hides ${shadows.join(" and ")} cop${shadows.length > 1 ? "ies" : "y"}`
                : "";
              results.push({
                ...candidate.rejection,
                rejected: { ...rejected, error: `${rejected.error}${hides}` },
              });
            }
          }
          const key = (value: Entry | Rejection) => ("rejected" in value ? value.rejected : value);
          return results.sort((a, b) => {
            const x = key(a);
            const y = key(b);
            return x.kind !== y.kind ? (x.kind === "stack" ? -1 : 1) : x.id < y.id ? -1 : 1;
          });
        });
        const loaded = yield* Effect.cached(load);

        return {
          all: loaded.pipe(
            Effect.map((items) => items.map((item) => ("rejected" in item ? item.rejected : item))),
          ),
          get: (kind, id) =>
            Effect.gen(function* () {
              const item = (yield* loaded).find((value) => {
                const at = "rejected" in value ? value.rejected : value;
                return at.kind === kind && at.id === id;
              });
              if (!item) return yield* new NotFound();
              if (!("rejected" in item)) return item;
              const { rejected, reason } = item;
              if (reason === "unreadable")
                return yield* new PermissionDenied({
                  details: { reason: "read", path: path.join(rejected.dir, item.path ?? ".") },
                });
              return yield* new EntryInvalid({
                details: {
                  id,
                  origin: rejected.origin,
                  reason,
                  ...(item.path === undefined ? {} : { path: item.path }),
                },
              });
            }),
          files: (entry) =>
            Effect.gen(function* () {
              const walked = yield* walk(entry.dir).pipe(
                Effect.mapError(
                  () => new PermissionDenied({ details: { reason: "read", path: entry.dir } }),
                ),
              );
              if (walked._tag === "Link")
                return yield* new EntryInvalid({
                  details: {
                    id: entry.id,
                    origin: entry.origin,
                    reason: "symlink",
                    path: walked.rel,
                  },
                });
              // `files/<path>` and `adapters/<agent>/<path>`; anything else in the entry ships nothing.
              const shipped = /^(?:files|adapters\/[^/]+)\/(.+)$/;
              return walked.files
                .flatMap(({ rel, mode }) => {
                  const match = shipped.exec(rel);
                  return match?.[1] ? [{ source: rel, path: match[1], mode }] : [];
                })
                .sort((a, b) => (a.source < b.source ? -1 : 1));
            }),
        };
      }),
    );
}
