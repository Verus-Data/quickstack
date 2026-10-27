import { Clock, Effect, Exit, FileSystem, Option, Path, Schema } from "effect";
import { AppConfig } from "../../config";
import { BadInput, ComposeConflict, InvalidConfig } from "../../errors";
import { NpmScope } from "../../schemas/config";
import type { AgentId } from "../../schemas/entry";
import type { NewResult } from "../../schemas/new";
import { Host } from "../../services/host";
import { Processes } from "../../services/processes";
import { type GitState, renderBrief } from "../brief/render";
import { targetAgents } from "../compose/agents";
import { compose, dropFlags, missingTools } from "../compose/compose";
import { composeFilesWithNeutral } from "../compose/files";
import { fingerprintFromFiles } from "../fingerprint";
import { type HandoffDecision, handoffRecord } from "../handoff";
import { buildManifest, encodeManifest, MANIFEST_PATH } from "../manifest";
import { removeProjectState, writeProjectState } from "../project-state";
import { hasControl } from "../text";
import { gitInit, gitInstalled, gitUserName, probeGit } from "./git";
import { envPrefix, slug } from "./slug";
import { inspectTarget } from "./target";
import { authorValue, type TemplateValues } from "./template";
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
  /**
   * The handoff for the composed project, given the ids of its untrusted entries; decided before
   * anything is written, so the manifest records it in the one write.
   */
  handoff: (untrusted: ReadonlyArray<string>) => HandoffDecision;
};

/** What `new` wrote, and the handoff the command carries out next. */
export type Scaffolded = { result: Omit<NewResult, "handoff">; decision: HandoffDecision };

export const BRIEF_PATH = ".quickstacks/BRIEF.md";
const NOTES_PATH = ".quickstacks/NOTES.md";
const IGNORE_PATH = ".quickstacks/.gitignore";
/** The brief, the notes, local state and `add`'s incoming files stay out of git (roadmap). */
const IGNORE = "/BRIEF.md\n/NOTES.md\n/state/\n/incoming/\n";
const NOTES = "# Notes\n\n## Findings\n\n## Asked\n";

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
    const fs = yield* FileSystem.FileSystem;
    const processes = yield* Processes;
    const settings = yield* (yield* AppConfig).get;

    // Flag values first: nothing is read or written for a bad --scope.
    if (
      options.scope !== undefined &&
      Option.isNone(Schema.decodeUnknownOption(NpmScope)(options.scope))
    )
      return yield* new BadInput({ details: { id: options.scope, flag: "scope" } });
    const packageScope = scopeOf(options.scope ?? settings.packageScope ?? "");
    const dir = path.resolve(host.cwd, options.dir ?? options.stack);
    // project_name is inserted into templates raw, so its text can't carry a control character.
    const name = path.basename(dir);
    if (hasControl(name)) return yield* new BadInput({ details: { id: name, flag: "dir" } });

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

    const target = yield* inspectTarget(dir);
    const installed = yield* gitInstalled;
    const git = yield* probeGit(target, installed);
    // A repository rooted at the target is the project's own, so it can hold these fragments.
    if (git.state.kind === "parent" && !git.own && composition.needsOwnRepo.length) {
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

    const slugged = slug(name);
    // The setting is the user's to fix; a git user.name with control characters is just unused.
    const author =
      settings.author !== undefined
        ? authorValue(settings.author)
        : installed
          ? (authorValue(yield* gitUserName(target.nearest)) ?? "")
          : "";
    if (author === undefined) return yield* new InvalidConfig();
    const values: TemplateValues = {
      project_name: name,
      project_slug: slugged,
      env_prefix: envPrefix(slugged),
      package_scope: packageScope,
      author,
      year: String(new Date(yield* Clock.currentTimeMillis).getUTCFullYear()),
    };
    const { files, neutralFiles } = yield* composeFilesWithNeutral(composition, values);
    const contentFingerprint = fingerprintFromFiles(composition, neutralFiles);

    const written = [
      ...files.map((file) => file.path),
      IGNORE_PATH,
      BRIEF_PATH,
      NOTES_PATH,
      MANIFEST_PATH,
    ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
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
    const warnings: Array<NewResult["warnings"][number]> = [
      ...composition.warnings,
      ...(git.warning ? [git.warning] : []),
    ];
    const decision = options.handoff(composition.untrusted.map((entry) => entry.id));
    const built = yield* buildManifest(composition, { briefWords: rendered.briefWords });
    // Outside the step digest (Trust model point 5), so filling it changes no digest.
    const manifest = {
      ...built,
      fingerprint: contentFingerprint,
      handoff: handoffRecord(decision, built.createdAt),
    };

    const state = yield* Effect.scoped(
      Effect.gen(function* () {
        const writer = yield* openProject(dir);
        for (const file of files) yield* writer.write(file.path, file.bytes, file.executable);
        yield* writer.write(IGNORE_PATH, encoder.encode(IGNORE));
        yield* writer.write(BRIEF_PATH, encoder.encode(rendered.text));
        yield* writer.write(NOTES_PATH, encoder.encode(NOTES));
        yield* writer.directory(".quickstacks/state");
        yield* writer.write(MANIFEST_PATH, encoder.encode(encodeManifest(manifest)));
        // Outside the project, so the writer doesn't track it: its own release undoes it on a
        // failure or interruption from here on. Acquiring is uninterruptible, so a written record
        // always has its release.
        const record = yield* Effect.acquireRelease(
          writeProjectState(manifest, path.join(writer.root, MANIFEST_PATH)),
          (write, exit) => (Exit.isSuccess(exit) ? Effect.void : removeProjectState(write)),
        );
        if (git.init) {
          // Adopted first, so an interrupt while git runs also takes its `.git` away; but only a
          // `.git` that wasn't there before git ran is ours to take.
          const dotGit = path.join(writer.root, ".git");
          const ours = Option.isNone(yield* Effect.option(fs.lstat(dotGit)));
          if (ours) yield* writer.adopt(".git");
          const code = yield* gitInit(writer.root);
          if (code !== 0) {
            // Whatever part of a `.git` the failed init left is no repository.
            if (ours) yield* writer.discard(".git");
            gitState = { kind: "none" };
            warnings.push({ code: "git_init_failed", id: "git", exitCode: code });
            rendered = brief(gitState);
            yield* writer.replace(BRIEF_PATH, encoder.encode(rendered.text));
            // Only the count changed; the digest, and so the state record, stay as written.
            yield* writer.replace(
              MANIFEST_PATH,
              encoder.encode(encodeManifest({ ...manifest, briefWords: rendered.briefWords })),
            );
          }
        }
        return record;
      }),
    );

    const result = {
      project: dir,
      fingerprint: contentFingerprint,
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
      stateRecord: state.written,
    } satisfies Scaffolded["result"];
    return { result, decision } satisfies Scaffolded;
  });
