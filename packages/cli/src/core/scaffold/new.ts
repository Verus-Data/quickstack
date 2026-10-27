import { Effect, Exit, FileSystem, Option, Path } from "effect";
import { AppConfig } from "../../config";
import { BadInput, ComposeConflict } from "../../errors";
import {
  BRIEF_PATH,
  IGNORE,
  IGNORE_PATH,
  NOTES,
  NOTES_PATH,
  STATE_DIR,
} from "../../project-layout";
import type { AgentId } from "../../schemas/entry";
import type { NewResult } from "../../schemas/new";
import { Host } from "../../services/host";
import { type GitState, renderBrief } from "../brief/render";
import { targetAgents } from "../compose/agents";
import { compose, dropFlags } from "../compose/compose";
import { composeFilesWithNeutral } from "../compose/files";
import { missingToolsOnPath } from "../compose/tools";
import { fingerprintFromFiles } from "../fingerprint";
import { type HandoffDecision, handoffRecord } from "../handoff";
import { buildManifest, encodeManifest, MANIFEST_PATH } from "../manifest";
import { removeProjectState, writeProjectState } from "../project-state";
import { hasControl } from "../text";
import { gitInit, gitInstalled, probeGit } from "./git";
import { slug } from "./slug";
import { inspectTarget } from "./target";
import { templateOverrides, templateValues } from "./values";
import { openProject } from "./write";

export type NewOptions = {
  stack: string;
  /** Relative to `Host.cwd`; defaults to the slug of `name`, else the stack id. */
  dir: string | undefined;
  name: string | undefined;
  author: string | undefined;
  dryRun: boolean;
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

/** What `new` wrote or planned, and the handoff the command carries out next. */
export type Scaffolded = { result: Omit<NewResult, "handoff">; decision: HandoffDecision };

const encoder = new TextEncoder();

/**
 * `new`: compose, check the target, render every file in memory, then write the entry files and
 * `.quickstacks/` through the safe writer and `git init` a fresh target. Runs nothing from any
 * entry (D2). Any failure or interruption after the first write rolls every write back. A dry run
 * stops after rendering, before opening the writer.
 */
export const scaffold = (options: NewOptions) =>
  Effect.gen(function* () {
    const host = yield* Host;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const settings = yield* (yield* AppConfig).get;

    const overrides = yield* templateOverrides(options);
    const dir = path.resolve(
      host.cwd,
      options.dir ?? (options.name === undefined ? options.stack : slug(options.name)),
    );
    const basename = path.basename(dir);
    if (hasControl(basename))
      return yield* new BadInput({ details: { id: basename, flag: "dir" } });
    const name = options.name ?? basename;

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

    const missing = yield* missingToolsOnPath(composition);

    const values = yield* templateValues({
      name,
      settings,
      overrides,
      git: { cwd: target.nearest, installed },
    });
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
      name,
      fingerprint: contentFingerprint,
      handoff: handoffRecord(decision, built.createdAt),
    };

    const plannedFiles = [
      ...files,
      { path: IGNORE_PATH, bytes: encoder.encode(IGNORE), executable: false },
      { path: BRIEF_PATH, bytes: encoder.encode(rendered.text), executable: false },
      { path: NOTES_PATH, bytes: encoder.encode(NOTES), executable: false },
    ];
    const manifestBytes = encoder.encode(encodeManifest(manifest));
    // A preview stops at the writer boundary, after the same composition and rendering.
    const state = options.dryRun
      ? { written: false }
      : yield* Effect.scoped(
          Effect.gen(function* () {
            const writer = yield* openProject(dir);
            for (const file of plannedFiles)
              yield* writer.write(file.path, file.bytes, file.executable);
            yield* writer.directory(STATE_DIR);
            yield* writer.write(MANIFEST_PATH, manifestBytes);
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
      dryRun: options.dryRun,
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
