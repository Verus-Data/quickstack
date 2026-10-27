import {
  Clock,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Option,
  Path,
  type PlatformError,
} from "effect";
import { AppConfig, GIT_REPOSITORY_VARIABLES } from "../config";
import { BadInput, ComposeConflict, PermissionDenied, VerifyChanged } from "../errors";
import type { AddResult } from "../schemas/add";
import type { AgentId } from "../schemas/entry";
import type { Manifest } from "../schemas/manifest";
import { Host } from "../services/host";
import { Output } from "../services/output";
import { Processes } from "../services/processes";
import { inferName } from "./add/name";
import { renderBrief } from "./brief/render";
import { targetAgents } from "./compose/agents";
import { type Composition, compose, missingTools, type PlannedFile } from "./compose/compose";
import { composeFiles } from "./compose/files";
import { deepMerge } from "./compose/merge";
import { type HandoffDecision, handoffRecord } from "./handoff";
import {
  buildManifest,
  digestSteps,
  encodeManifest,
  MANIFEST_PATH,
  readManifest,
} from "./manifest";
import {
  projectStateFor,
  projectStatePath,
  saveProjectState,
  warnUnwritten,
} from "./project-state";
import { type Entry, isRejected } from "./registry/entry";
import { Registry } from "./registry/registry";
import { BRIEF_PATH } from "./scaffold/new";
import { envPrefix, slug } from "./scaffold/slug";
import { authorValue } from "./scaffold/template";
import { openProject, within } from "./scaffold/write";
import { printable } from "./text";
import { checkTamper } from "./verify/tamper";

const INCOMING = ".quickstacks/incoming";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const denied = (path: string) => new PermissionDenied({ details: { reason: "write", path } });
const absent = (error: PlatformError.PlatformError) => error.reason._tag === "NotFound";

export type AddPlan = {
  readonly write: ReadonlyArray<PlannedFile>;
  readonly park: ReadonlyArray<{
    file: PlannedFile;
    incoming: string;
    action: "new" | "merge" | "copy";
  }>;
  readonly skipped: ReadonlyArray<string>;
  readonly incoming: ReadonlyArray<string>;
};

/** Refuse metadata links before reading the manifest or traversing incoming files. */
export const checkAddRoot = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const info = yield* fs.stat(root).pipe(Effect.mapError(() => denied(root)));
    if (info.type !== "Directory") return yield* denied(root);
    for (const rel of [".quickstacks", INCOMING]) {
      const at = path.join(root, rel);
      const info = yield* fs.lstat(at).pipe(
        Effect.map((value) => value.type),
        Effect.catch((error) =>
          absent(error) ? Effect.succeed("Missing") : Effect.fail(denied(at)),
        ),
      );
      if (info !== "Missing" && info !== "Directory") return yield* denied(at);
    }
  });

/** Read-only classification. The live tree is never a merge target (D4). */
export const planAdd = (input: {
  readonly root: string;
  readonly composition: Composition<Entry | null>;
  readonly rendered: ReadonlyArray<{ file: PlannedFile; bytes: Uint8Array }>;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* checkAddRoot(input.root);
    const root = yield* fs.realPath(input.root).pipe(Effect.mapError(() => denied(input.root)));
    if (input.composition.needsOwnRepo.length) {
      const processes = yield* Processes;
      const config = yield* AppConfig;
      const git = yield* processes
        .run({
          command: "git rev-parse --show-toplevel",
          cwd: root,
          env: config.childEnv(GIT_REPOSITORY_VARIABLES, { LC_ALL: "C" }),
          timeout: Duration.seconds(10),
        })
        .pipe(Effect.catchTag("SpawnFailed", () => Effect.succeed(undefined)));
      if (git && !git.timedOut && git.exitCode === 0) {
        const top = yield* fs.realPath(git.tail.trim()).pipe(Effect.mapError(() => denied(root)));
        if (top !== root)
          return yield* new ComposeConflict({
            details: {
              reason: "needs_own_repo",
              ids: [...input.composition.needsOwnRepo],
              path: top,
            },
          });
      }
    }
    const incoming: string[] = [];
    const walk = (rel: string): Effect.Effect<void, PermissionDenied> =>
      Effect.gen(function* () {
        const at = path.join(root, rel);
        const names = yield* fs
          .readDirectory(at)
          .pipe(
            Effect.catch((error) => (absent(error) ? Effect.succeed([]) : Effect.fail(denied(at)))),
          );
        for (const name of [...names].sort()) {
          const child = `${rel}/${name}`;
          const info = yield* fs
            .lstat(path.join(root, child))
            .pipe(Effect.mapError(() => denied(child)));
          if (info.type === "Directory") yield* walk(child);
          else if (info.type === "File") incoming.push(child);
          else return yield* denied(path.join(root, child));
        }
      });
    yield* walk(INCOMING);
    const read = (rel: string) =>
      Effect.gen(function* () {
        // Check every existing prefix before reading: a live ancestor must not escape the project.
        let at = root;
        for (const part of rel.split("/")) {
          at = path.join(at, part);
          const info = yield* fs.lstat(at).pipe(
            Effect.map((value) => value.type),
            Effect.catch((error) =>
              absent(error) || error.reason._tag === "BadResource"
                ? Effect.succeed("Missing")
                : Effect.fail(denied(at)),
            ),
          );
          if (info === "Missing") return undefined;
          if (info === "SymbolicLink") {
            const real = yield* fs.realPath(at).pipe(Effect.mapError(() => denied(at)));
            if (!within(root, real, path.sep)) return yield* denied(at);
          }
        }
        return yield* fs
          .readFile(path.join(root, rel))
          .pipe(Effect.mapError(() => denied(path.join(root, rel))));
      });
    const same = (a: Uint8Array, b: Uint8Array) =>
      a.length === b.length && a.every((byte, i) => byte === b[i]);
    const write: PlannedFile[] = [];
    const park: Array<AddPlan["park"][number]> = [];
    const skipped: string[] = [];
    const candidates = yield* Effect.forEach(input.rendered, (item) =>
      read(item.file.path).pipe(Effect.map((live) => ({ ...item, live }))),
    );
    // A numbered copy must not claim another contribution's primary path or directory.
    const reserved = new Set<string>();
    const reserve = (rel: string) => {
      const parts = rel.split("/");
      for (let depth = 1; depth <= parts.length; depth++)
        reserved.add(parts.slice(0, depth).join("/"));
    };
    for (const { file, bytes, live } of candidates)
      if (live !== undefined && !same(live, bytes)) reserve(`${INCOMING}/${file.path}`);
    for (const file of incoming) reserve(file);
    for (const { file, bytes, live } of candidates) {
      if (live === undefined) {
        write.push(file);
        continue;
      }
      if (same(live, bytes)) {
        skipped.push(file.path);
        continue;
      }
      const destination = `${INCOMING}/${file.path}`;
      const parked = yield* read(destination);
      if (parked === undefined) {
        park.push({ file, incoming: destination, action: "new" });
        incoming.push(destination);
      } else if (same(parked, bytes)) skipped.push(file.path);
      else {
        const merged = yield* Effect.option(
          Effect.try(() => {
            const previous: unknown = JSON.parse(decoder.decode(parked));
            const next: unknown = JSON.parse(decoder.decode(bytes));
            return `${JSON.stringify(deepMerge(previous, next), null, 2)}\n`;
          }),
        );
        if (Option.isSome(merged))
          park.push({
            file: { ...file, kind: "merge", content: merged.value },
            incoming: destination,
            action: "merge",
          });
        else {
          let suffix = 2;
          while (
            reserved.has(`${destination}.${suffix}`) ||
            (yield* fs.exists(path.join(root, `${destination}.${suffix}`)))
          )
            suffix++;
          const copy = `${destination}.${suffix}`;
          reserve(copy);
          park.push({ file, incoming: copy, action: "copy" });
          incoming.push(copy);
        }
      }
    }
    return {
      write,
      park,
      skipped: skipped.sort(),
      incoming: [...new Set(incoming)].sort(),
    } satisfies AddPlan;
  });

/** Group numbered parked copies with their original destination, including earlier runs. */
function mergeNeeded(incoming: ReadonlyArray<string>): AddResult["mergeNeeded"] {
  const groups = new Map<string, string[]>();
  for (const file of incoming) {
    const base = file.replace(/\.(?:[2-9]|[1-9]\d+)$/, "");
    const destination = incoming.includes(base) ? base : file;
    const rel = destination.slice(INCOMING.length + 1);
    groups.set(rel, [...(groups.get(rel) ?? []), file]);
  }
  return [...groups]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, incoming]) => ({ path, incoming }));
}

export type AddOptions = {
  root: string;
  fragments: ReadonlyArray<string>;
  agents: ReadonlyArray<AgentId> | undefined;
  sandbox: boolean;
  yes: boolean;
  handoff: (untrusted: ReadonlyArray<string>) => HandoffDecision;
};

/** Apply the new fragments as one rollback scope, recording the manifest last. */
export const add = (options: AddOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const config = yield* AppConfig;
    const host = yield* Host;
    const output = yield* Output;
    const settings = yield* config.get;
    yield* checkAddRoot(options.root);
    const manifestPath = path.join(options.root, MANIFEST_PATH);
    const previous = yield* readManifest(manifestPath).pipe(
      Effect.catchTag("NotFound", () => Effect.succeed(undefined)),
    );
    const tamper = previous ? yield* checkTamper(previous, manifestPath) : undefined;
    if (tamper?.changed) return yield* new VerifyChanged({ details: tamper.changed });
    if (previous && options.sandbox && previous.preset !== "sandbox")
      return yield* new BadInput({ details: { id: "sandbox", flag: "sandbox" } });
    if (
      previous &&
      options.agents &&
      [...new Set(options.agents)].sort().join(",") !== [...previous.agents].sort().join(",")
    )
      return yield* new BadInput({ details: { id: options.agents.join(","), flag: "agents" } });
    const registry = yield* Registry;
    const all = yield* registry.all;
    const stack = all.find(
      (entry): entry is Entry =>
        !isRejected(entry) && entry.kind === "stack" && entry.id === previous?.stack?.id,
    );
    const warnings: Array<AddResult["warnings"][number]> = [];
    if (previous?.stack && !stack) warnings.push({ code: "stack_unknown", id: previous.stack.id });
    const existing = previous?.fragments.map((entry) => entry.id) ?? [];
    const composition = yield* compose({
      stack: stack?.id ?? null,
      with: options.fragments,
      without: [],
      preset: previous?.preset ?? (options.sandbox ? "sandbox" : "default"),
      agents: previous?.agents ?? targetAgents(options.agents, settings),
      always: [],
      mode: "add",
      existing,
    });
    warnings.push(...composition.warnings);
    const found = new Set<string>();
    for (const { tool } of composition.tools)
      if (Option.isSome(yield* (yield* Processes).which(tool))) found.add(tool);
    const missing = missingTools(composition, (tool) => found.has(tool));
    for (const item of missing) {
      warnings.push({ code: "missing_tool", id: item.tool });
      yield* output.progress(
        `Warning: ${printable(item.tool)} is not on PATH (needed by ${item.owners.map((owner) => printable(owner.id)).join(", ")}).`,
      );
    }
    const inferred =
      previous?.name !== undefined
        ? { name: { value: previous.name, source: "manifest" }, warnings: [] }
        : yield* inferName(options.root);
    warnings.push(...inferred.warnings);
    const name = inferred.name;
    const rendered = yield* composeFiles(composition, {
      project_name: name.value,
      project_slug: slug(name.value),
      env_prefix: envPrefix(slug(name.value)),
      package_scope: (settings.packageScope ?? "").replace(/^@/, ""),
      author: authorValue(settings.author ?? "") ?? "",
      year: String(new Date(yield* Clock.currentTimeMillis).getUTCFullYear()),
    });
    const plan = yield* planAdd({
      root: options.root,
      composition,
      rendered: rendered.flatMap((rendered) => {
        const file = composition.files.find((file) => file.path === rendered.path);
        return file ? [{ file, bytes: rendered.bytes }] : [];
      }),
    });
    const incoming = mergeNeeded(plan.incoming);
    const built = yield* buildManifest(composition, { briefWords: 0, mode: "add" });
    const added = composition.fragments.map((entry) => entry.id);
    const present = new Set([...existing, ...added]);
    const missingRequired =
      stack?.meta.kind === "stack"
        ? stack.meta.fragments.required
            .filter((id) => !present.has(id))
            .map((id) => ({ id, command: `${host.invocation} add ${id}` }))
        : [];
    const commandsKept = Object.keys(composition.commands)
      .filter(
        (key) =>
          previous &&
          Object.hasOwn(previous.commands, key) &&
          previous.commands[key] !== composition.commands[key],
      )
      .sort();
    for (const step of built.verify)
      if (previous?.verify.some((old) => old.name === step.name))
        return yield* new ComposeConflict({
          details: { reason: "step_name", ids: [step.owner], step: step.name },
        });
    const changes: Manifest = {
      ...(previous ?? built),
      name: name.value,
      fragments: [...(previous?.fragments ?? []), ...built.fragments],
      verify: [...(previous?.verify ?? []), ...built.verify],
      env: { ...built.env, ...previous?.env },
      commands: { ...built.commands, ...previous?.commands },
    };
    const digestRecorded =
      !composition.untrusted.length || ((yield* config.agent) === "none" && host.stdinIsTTY);
    const baseline = previous ?? { ...built, verify: [], env: {} };
    const verifyDigest = digestSteps(digestRecorded ? changes : baseline);
    const decision = options.handoff(composition.untrusted.map((entry) => entry.id));
    const merged: Manifest = {
      ...changes,
      verifyDigest,
      handoff: handoffRecord(decision, new Date(yield* Clock.currentTimeMillis).toISOString()),
    };
    const written = plan.write.map((file) => file.path).sort();
    const brief = renderBrief(composition, {
      project: name.value,
      invocation: host.invocation,
      git: { kind: "parent", toplevel: options.root },
      written,
      missing,
      yes: options.yes || options.sandbox,
      add: {
        applied: existing,
        stack: previous?.stack?.id ?? null,
        mergeNeeded: incoming,
        missingRequired,
        digestRecorded,
        manifest: merged,
      },
    });
    const manifest = { ...merged, briefWords: brief.briefWords };
    const stateRecord = yield* Effect.scoped(
      Effect.gen(function* () {
        const writer = yield* openProject(options.root);
        const bytes = (file: PlannedFile) => {
          const found = rendered.find((item) => item.path === file.path);
          if (!found) throw new Error("A planned add file has no rendered bytes");
          return found.bytes;
        };
        // Follow file order, so rollback also covers new files after an in-place parked merge.
        for (const file of composition.files) {
          const parked = plan.park.find((item) => item.file.path === file.path);
          if (parked?.action === "merge")
            yield* writer.rewrite(parked.incoming, encoder.encode(parked.file.content ?? ""));
          else if (parked)
            yield* writer.write(parked.incoming, bytes(file), (file.mode & 0o111) !== 0);
          else if (plan.write.includes(file))
            yield* writer.write(file.path, bytes(file), (file.mode & 0o111) !== 0);
        }
        const metadata = (rel: string, text: string) =>
          Effect.gen(function* () {
            if (yield* fs.exists(path.join(writer.root, rel)))
              yield* writer.rewrite(rel, encoder.encode(text));
            else yield* writer.write(rel, encoder.encode(text));
          });
        if (!(yield* fs.exists(path.join(writer.root, ".quickstacks/.gitignore"))))
          yield* writer.write(
            ".quickstacks/.gitignore",
            encoder.encode("/BRIEF.md\n/NOTES.md\n/state/\n/incoming/\n"),
          );
        if (!(yield* fs.exists(path.join(writer.root, ".quickstacks/NOTES.md"))))
          yield* writer.write(
            ".quickstacks/NOTES.md",
            encoder.encode("# Notes\n\n## Findings\n\n## Asked\n"),
          );
        yield* writer.directory(".quickstacks/state");
        yield* metadata(BRIEF_PATH, brief.text);
        let recorded = false;
        if (!previous || tamper?.record) {
          const target = tamper?.record?.path ?? (yield* projectStatePath(merged.projectId));
          if (target !== undefined) {
            recorded = yield* Effect.gen(function* () {
              const old = yield* fs.readFile(target).pipe(
                Effect.map((bytes) => bytes),
                Effect.catch((error) =>
                  absent(error) ? Effect.succeed(undefined) : Effect.fail(error),
                ),
              );
              yield* Effect.addFinalizer((exit) =>
                Exit.isSuccess(exit)
                  ? Effect.void
                  : Effect.ignore(old ? fs.writeFile(target, old) : fs.remove(target)),
              );
              const state = projectStateFor(
                digestRecorded ? merged : { ...baseline, verifyDigest: merged.verifyDigest },
                path.join(writer.root, MANIFEST_PATH),
              );
              const kept = tamper?.record?.state;
              yield* saveProjectState(
                {
                  ...state,
                  createdAt: kept?.createdAt ?? state.createdAt,
                  firstGreenAt: kept?.firstGreenAt ?? null,
                  firstTestPassAt: kept?.firstTestPassAt ?? null,
                },
                target,
              ).pipe(Effect.uninterruptible);
              return true;
            }).pipe(
              Effect.catchTag("PlatformError", (error) =>
                previous
                  ? Effect.fail(denied(target))
                  : warnUnwritten(error, target).pipe(Effect.as(false)),
              ),
            );
          }
        }
        yield* metadata(MANIFEST_PATH, encodeManifest(manifest));
        return recorded;
      }),
    ).pipe(
      Effect.catchTag("TargetNotEmpty", (error) =>
        Effect.fail(denied(error.details?.path ?? options.root)),
      ),
    );
    const result: Omit<AddResult, "handoff"> = {
      project: options.root,
      stack: merged.stack?.id ?? null,
      added,
      alreadyApplied: existing,
      written,
      skipped: [...plan.skipped],
      mergeNeeded: incoming,
      missingRequired,
      commandsKept,
      warnings,
      missingTools: missing.map((item) => ({
        ...item,
        owners: [...item.owners],
        drop: [...item.drop],
      })),
      name,
      createdManifest: !previous,
      tamperCheck: tamper?.tamperCheck ?? null,
      stateRecord,
      digestRecorded,
      brief: BRIEF_PATH,
      briefWords: brief.briefWords,
      untrusted: [...composition.untrusted],
    };
    return { result, decision };
  });
