import { Clock, Effect, Option, Path, Schema } from "effect";
import { AppConfig } from "../../config";
import { BadInput, ComposeConflict, EntryInvalid } from "../../errors";
import { NpmScope } from "../../schemas/config";
import type { AgentId } from "../../schemas/entry";
import type { NewResult } from "../../schemas/new";
import { Host } from "../../services/host";
import { Processes } from "../../services/processes";
import { type GitState, renderBrief } from "../brief/render";
import { targetAgents } from "../compose/agents";
import { type Composition, compose, dropFlags, missingTools } from "../compose/compose";
import type { Entry } from "../registry/entry";
import { Registry } from "../registry/registry";
import { gitInit, gitInstalled, gitUserName, probeGit } from "./git";
import { envPrefix, slug } from "./slug";
import { inspectTarget } from "./target";
import { renderTemplate, type TemplateValues } from "./template";
import { openProject } from "./write";

export type NewOptions = {
  stack: string;
  /** Relative to `Host.cwd`; defaults to the stack id. */
  dir: string | undefined;
  with: ReadonlyArray<string>;
  without: ReadonlyArray<string>;
  sandbox: boolean;
  yes: boolean;
  agents: ReadonlyArray<AgentId> | undefined;
  /** `--scope`, as given. */
  scope: string | undefined;
};

export const BRIEF_PATH = ".quickstacks/BRIEF.md";
const NOTES_PATH = ".quickstacks/NOTES.md";
const IGNORE_PATH = ".quickstacks/.gitignore";
/** The brief, the notes, local state and `add`'s incoming files stay out of git (roadmap). */
const IGNORE = "/BRIEF.md\n/NOTES.md\n/state/\n/incoming/\n";
const NOTES = "# Notes\n\n## Findings\n\n## Asked\n";
/** Top-level names the CLI owns in a project; no entry may write under them. */
const RESERVED = [".quickstacks", ".git"];

/** The prompt an agent (or the user) acts on next; 1.4 decides whether to launch it. */
export const nextPrompt = (invocation: string) =>
  `Read ${BRIEF_PATH} and carry it out. It is your full task for this project; you're done when \`${invocation} verify\` passes.`;

const encoder = new TextEncoder();
const scopeOf = (value: string) => value.replace(/^@/, "");

/**
 * `new`: compose, check the target, render every file in memory, then write the entry files and
 * `.quickstacks/` through the safe writer and `git init` a fresh target. Runs nothing from any
 * entry (D2). Any failure or interruption after the first write rolls every write back.
 */
export const scaffold = (options: NewOptions) =>
  Effect.gen(function* () {
    const host = yield* Host;
    const path = yield* Path.Path;
    const registry = yield* Registry;
    const processes = yield* Processes;
    const settings = yield* (yield* AppConfig).get;

    // Flag values first: nothing is read or written for a bad --scope.
    if (
      options.scope !== undefined &&
      Option.isNone(Schema.decodeUnknownOption(NpmScope)(options.scope))
    )
      return yield* new BadInput({ details: { id: options.scope } });
    const packageScope = scopeOf(options.scope ?? settings.packageScope ?? "");

    const preset = options.sandbox ? "sandbox" : "default";
    const composition = yield* compose({
      stack: options.stack,
      with: options.with,
      without: options.without,
      preset,
      agents: targetAgents(options.agents, settings),
      always: settings.always ?? [],
      mode: "new",
    });

    const dir = path.resolve(host.cwd, options.dir ?? options.stack);
    const target = yield* inspectTarget(dir);
    const installed = yield* gitInstalled;
    const git = yield* probeGit(target, installed);
    if (git.state.kind === "parent" && composition.needsOwnRepo.length) {
      const owners = composition.needsOwnRepo.map((id) => ({ kind: "fragment" as const, id }));
      const drop = dropFlags(composition, owners);
      return yield* new ComposeConflict({
        details: {
          reason: "needs_own_repo",
          ids: [...composition.needsOwnRepo],
          path: git.state.toplevel,
          fix:
            drop.length && drop.every((item) => item.flag === "without")
              ? drop.map((item) => `--without ${item.id}`)
              : [],
        },
      });
    }

    const found = new Set<string>();
    for (const { tool } of composition.tools)
      if (Option.isSome(yield* processes.which(tool))) found.add(tool);
    const missing = missingTools(composition, (tool) => found.has(tool));

    const name = path.basename(dir);
    const slugged = slug(name);
    const values: TemplateValues = {
      project_name: name,
      project_slug: slugged,
      env_prefix: envPrefix(slugged),
      package_scope: packageScope,
      author: settings.author ?? (installed ? yield* gitUserName(target.nearest) : ""),
      year: String(new Date(yield* Clock.currentTimeMillis).getUTCFullYear()),
    };
    const files = yield* renderFiles(composition, registry, values);

    const written = [...files.map((file) => file.path), IGNORE_PATH, BRIEF_PATH, NOTES_PATH].sort(
      (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    );
    const yes = options.yes || options.sandbox;
    const brief = (state: GitState) =>
      renderBrief(composition, {
        project: name,
        git: state,
        written,
        missing,
        yes,
        invocation: host.invocation,
      });
    let rendered = brief(git.state);
    let gitState = git.state;
    const warnings: Array<NewResult["warnings"][number]> = [...composition.warnings];

    yield* Effect.scoped(
      Effect.gen(function* () {
        const writer = yield* openProject(dir);
        for (const file of files) yield* writer.write(file.path, file.data, file.executable);
        yield* writer.write(IGNORE_PATH, encoder.encode(IGNORE));
        yield* writer.write(BRIEF_PATH, encoder.encode(rendered.text));
        yield* writer.write(NOTES_PATH, encoder.encode(NOTES));
        yield* writer.directory(".quickstacks/state");
        // 1.2b writes the manifest and the state record here, before git.
        if (git.init) {
          // Adopted first, so an interrupt while git runs also takes its `.git` away.
          yield* writer.adopt(".git");
          const code = yield* gitInit(writer.root);
          if (code !== 0) {
            gitState = { kind: "none" };
            warnings.push({ code: "git_init_failed", id: "git", exitCode: code });
            rendered = brief(gitState);
            yield* writer.replace(BRIEF_PATH, encoder.encode(rendered.text));
          }
        }
      }),
    );

    return {
      project: dir,
      stack: composition.stack.id,
      fragments: composition.fragments.map((fragment) => fragment.id),
      preset,
      agents: [...composition.agents],
      written,
      brief: BRIEF_PATH,
      briefWords: rendered.briefWords,
      fixedWords: rendered.fixedWords,
      missingTools: missing.map((item) => ({
        tool: item.tool,
        owners: [...item.owners],
        drop: [...item.drop],
      })),
      untrusted: [...composition.untrusted],
      warnings,
      git: gitState.kind,
      stateRecord: false,
      handoff: { kind: "print", next: nextPrompt(host.invocation) },
    } satisfies NewResult;
  });

type FileToWrite = { path: string; data: Uint8Array; executable: boolean };

/**
 * Every planned file's final bytes, before anything is written: copies byte for byte, templates
 * rendered (an unknown variable is `EntryInvalid` `template`), merges as composed.
 */
const renderFiles = (
  composition: Composition,
  registry: Registry["Service"],
  values: TemplateValues,
) =>
  Effect.gen(function* () {
    const entries: ReadonlyArray<Entry> = [composition.stack, ...composition.fragments];
    const files: FileToWrite[] = [];
    for (const planned of composition.files) {
      const executable = (planned.mode & 0o111) !== 0;
      const owner = entries.find(
        (entry) => entry.kind === planned.owner.kind && entry.id === planned.owner.id,
      );
      if (RESERVED.includes(planned.path.split("/")[0] ?? "") || !owner)
        return yield* new ComposeConflict({
          details: {
            reason: "file_owner",
            ...(planned.owner.kind === "stack"
              ? { stack: planned.owner.id, ids: [] }
              : { ids: [planned.owner.id] }),
            path: planned.path,
          },
        });
      if (planned.kind === "merge") {
        files.push({
          path: planned.path,
          data: encoder.encode(planned.content ?? ""),
          executable,
        });
        continue;
      }
      const source = planned.source?.file ?? "";
      if (planned.kind === "copy") {
        files.push({ path: planned.path, data: yield* registry.bytes(owner, source), executable });
        continue;
      }
      const result = renderTemplate(yield* registry.read(owner, source), values);
      if ("unknown" in result)
        return yield* new EntryInvalid({
          details: {
            id: owner.id,
            origin: owner.origin,
            reason: "template",
            path: source,
            line: result.line,
          },
        });
      files.push({ path: planned.path, data: encoder.encode(result.text), executable });
    }
    return files;
  });
