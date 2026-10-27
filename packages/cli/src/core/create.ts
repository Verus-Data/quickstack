import { Effect, FileSystem, Option, Path, Schema, Terminal } from "effect";
import { AppConfig } from "../config";
import { BadInput, Interrupted, NotFound, PermissionDenied } from "../errors";
import type { CreateResult } from "../schemas/create";
import type { Category, Kind, Origin } from "../schemas/entry";
import { Host } from "../services/host";
import { Output } from "../services/output";
import { skeleton, starterFiles, trustQuestion } from "./create-text";
import { isRejected, markdownFile } from "./registry/entry";
import { defaultRoots, Registry } from "./registry/registry";
import { openProject } from "./scaffold/write";
import { renderShow, showReport } from "./show";
import { closest } from "./suggest";

const EntryId = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));

export type CreateOptions = {
  kind: Kind;
  id: string;
  from: Origin | undefined;
  category: Category;
  yes: boolean;
};

/** Creates a skeleton or an exact working copy, never executing anything from an entry. */
export const createEntry = (options: CreateOptions) =>
  Effect.gen(function* () {
    const { kind, id, from, category, yes } = options;
    if (!Schema.is(EntryId)(id)) return yield* new BadInput({ details: { id, flag: "create_id" } });
    if (from === "user") return yield* new BadInput({ details: { id: from, flag: "from" } });
    const config = yield* AppConfig;
    const paths = yield* config.paths;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const host = yield* Host;
    const target = path.resolve(
      host.cwd,
      paths.user,
      kind === "stack" ? "stacks" : "fragments",
      id,
    );
    const occupied = new BadInput({ details: { id: target, flag: "create_target" } });
    const existing = yield* fs.lstat(target).pipe(
      Effect.map(Option.some),
      Effect.catch((error) =>
        error.reason._tag === "NotFound" || error.reason._tag === "BadResource"
          ? Effect.succeed(Option.none())
          : Effect.fail(new PermissionDenied({ details: { reason: "read", path: target } })),
      ),
    );
    if (Option.isSome(existing)) return yield* occupied;

    const { directories, files } = from
      ? yield* copySnapshot(kind, id, from, yes)
      : skeletonSnapshot(kind, id, category);

    yield* Effect.scoped(
      Effect.gen(function* () {
        const writer = yield* openProject(target, { exclusive: true });
        for (const directory of directories) yield* writer.directory(directory);
        for (const file of files) yield* writer.write(file.source, file.bytes, file.permissions);
      }),
    ).pipe(Effect.catchTag("TargetNotEmpty", () => Effect.fail(occupied)));
    return {
      kind,
      id,
      path: target,
      guide: host.authoring,
    } satisfies CreateResult;
  });

type Snapshot = {
  directories: ReadonlyArray<string>;
  files: ReadonlyArray<{ source: string; bytes: Uint8Array; permissions: boolean | number }>;
};

/** The fixed skeleton of a fresh entry. */
function skeletonSnapshot(kind: Kind, id: string, category: Category): Snapshot {
  const encoder = new TextEncoder();
  return {
    directories: [],
    files: [
      { source: markdownFile(kind), text: skeleton(kind, id, category) },
      ...(kind === "stack" ? starterFiles : []),
    ].map((file) => ({
      source: file.source,
      bytes: encoder.encode(file.text),
      permissions: false,
    })),
  };
}

/**
 * The complete tree of `id` from one origin, read before anything is written. An untrusted entry
 * needs a person at a terminal: its full report, then a yes (or `--yes`) to copy it.
 */
const copySnapshot = (kind: Kind, id: string, from: Origin, yes: boolean) =>
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const host = yield* Host;
    const roots = yield* defaultRoots;
    const sourceRoots = roots.filter((root) => root.origin === from);
    return yield* Effect.gen(function* () {
      const registry = yield* Registry;
      const entry = yield* registry.get(kind, id).pipe(
        Effect.catchTag("NotFound", () =>
          Effect.gen(function* () {
            const usable = (yield* registry.all).filter(
              (entry) => entry.kind === kind && !isRejected(entry),
            );
            return yield* new NotFound({
              details: {
                id,
                kind,
                suggestions: closest(
                  id,
                  usable.map((entry) => entry.id),
                ),
              },
            });
          }),
        ),
      );
      const confirmAnswer = Effect.gen(function* () {
        const output = yield* Output;

        yield* output.note(trustQuestion);
        const answer = yield* (yield* Terminal.Terminal).readLine.pipe(
          Effect.mapError(() => new Interrupted()),
        );
        if (!/^(?:y|yes)$/i.test(answer.trim()))
          return yield* new BadInput({ details: { id, flag: "confirmation" } });
      });
      const confirmCopy = Effect.gen(function* () {
        const agent = yield* config.agent;
        if (agent !== "none" || !host.stdinIsTTY)
          return yield* new PermissionDenied({
            details: { reason: agent !== "none" ? "agent" : "no-tty", path: entry.dir },
          });
        const output = yield* Output;
        // Keep the named origin first, while resolving its dependencies through the normal roots.
        const report = yield* showReport(id, kind, [
          ...sourceRoots,
          ...roots.filter((root) => root.origin !== from),
        ]);
        yield* output.note(renderShow(report, host.invocation));
        if (!yes) yield* confirmAnswer;
      });
      if (!entry.trusted) yield* confirmCopy;
      const tree = yield* registry.tree(entry);
      const files = yield* Effect.forEach(tree.files, (file) =>
        registry
          .bytes(entry, file.source)
          .pipe(Effect.map((bytes) => ({ source: file.source, bytes, permissions: file.mode }))),
      );
      return { directories: tree.directories, files } satisfies Snapshot;
    }).pipe(Effect.provide(Registry.layer(sourceRoots)));
  });
