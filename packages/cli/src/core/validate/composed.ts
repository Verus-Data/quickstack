import { Effect, Result } from "effect";
import { AgentId, type StackMeta } from "../../schemas/entry";
import type { Finding } from "../../schemas/validate";
import { targetAgents } from "../compose/agents";
import { type Composition, compose } from "../compose/compose";
import { composeFiles, NEUTRAL_VARS, type RenderedFile } from "../compose/files";
import type { Entry } from "../registry/entry";
import { compositionPlans, describe } from "./compositions";
import type { Source } from "./sources";
import { type Check, entryFile, finding, type View } from "./view";

export type Composed = { composition: Composition; files: ReadonlyArray<RenderedFile> };

/** The budgeted compositions, rendered independently for every adapter they ship. */
export const composedFiles = (view: Omit<View, "composed">) =>
  Effect.gen(function* () {
    const snapshots: Composed[] = [];
    const findings: Finding[] = [];
    const failures = new Set<string>();
    const stacks = view.all.filter(
      (item): item is Entry & { meta: StackMeta } => "meta" in item && item.meta.kind === "stack",
    );
    for (const stack of stacks) {
      for (const preset of ["default", "sandbox"] as const) {
        for (const plan of compositionPlans(view, stack)) {
          const options = {
            stack: stack.id,
            with: plan.with,
            without: plan.without,
            preset,
            always: [],
            mode: "new",
          } as const;
          const base = yield* Effect.result(
            compose({ ...options, agents: targetAgents(undefined, {}) }),
          );
          if (Result.isFailure(base)) continue;
          const entries = [base.success.stack, ...base.success.fragments];
          if (!entries.some((entry) => view.entries.some((wanted) => wanted.dir === entry.dir)))
            continue;
          const agents = AgentId.literals.filter((agent) =>
            entries.some((entry) =>
              view.sources
                .get(entry.dir)
                ?.files.some((file) => file.source.startsWith(`adapters/${agent}/`)),
            ),
          );
          for (const targets of agents.length
            ? agents.map((agent) => [agent])
            : [targetAgents(undefined, {})]) {
            const result = yield* Effect.result(compose({ ...options, agents: targets }));
            if (Result.isFailure(result)) {
              const error = result.failure;
              if (
                error._tag !== "ComposeConflict" &&
                !(error._tag === "EntryInvalid" && error.details?.reason === "merge_template")
              )
                continue;
              const candidates = entries.flatMap((entry) =>
                (view.sources.get(entry.dir)?.files ?? [])
                  .filter(
                    (source) =>
                      (error._tag === "EntryInvalid"
                        ? source.source === error.details?.path
                        : source.path.replace(/\.tmpl$/, "") === error.details?.path) &&
                      (source.source.startsWith("files/") ||
                        targets.some((agent) => source.source.startsWith(`adapters/${agent}/`))),
                  )
                  .map((source) => ({ entry, source })),
              );
              const source = candidates.find(({ entry }) =>
                view.entries.some((wanted) => wanted.dir === entry.dir),
              );
              const owner = source?.entry ?? stack;
              if (!view.entries.some((wanted) => wanted.dir === owner.dir)) continue;
              const description = describe(error);
              findings.push(
                finding(owner, {
                  ...description,
                  severity: "error",
                  file: source ? view.file(owner, source.source.source) : entryFile(view, owner),
                  message: `${stack.id} (${targets.join(", ")}): ${description.message}`,
                }),
              );
              if (error._tag === "ComposeConflict")
                failures.add(JSON.stringify([stack.id, error.details]));
              continue;
            }
            const files = yield* Effect.result(composeFiles(result.success, NEUTRAL_VARS));
            if (Result.isSuccess(files)) {
              snapshots.push({ composition: result.success, files: files.success });
            } else if (
              files.failure._tag === "EntryInvalid" &&
              files.failure.details?.reason === "template"
            ) {
              const details = files.failure.details;
              const planned = result.success.files.find(
                (file) =>
                  file.source?.file === details.path && file.source?.entry.id === details.id,
              );
              const entry = entries.find(
                (entry) =>
                  entry.kind === planned?.source?.entry.kind &&
                  entry.id === planned.source.entry.id &&
                  entry.origin === details.origin,
              );
              if (entry && view.entries.some((wanted) => wanted.dir === entry.dir))
                findings.push(
                  finding(entry, {
                    check: "compose",
                    severity: "error",
                    file: view.file(entry, details.path),
                    ...(details.line === undefined ? {} : { line: details.line }),
                    message: `${stack.id}: unknown template variable in ${details.path ?? "a shipped file"}`,
                  }),
                );
            }
          }
        }
      }
    }
    return { snapshots, findings: uniqueFindings(findings), failures };
  });

/** Locate a rendered defect in its contributing source, including merged-file contributors. */
export function sourceOf(
  view: View,
  snapshot: Composed,
  file: RenderedFile,
  needle = "",
  matches?: (source: Source) => boolean,
) {
  const planned = snapshot.composition.files.find((planned) => planned.path === file.path);
  const entries = [snapshot.composition.stack, ...snapshot.composition.fragments];
  const contributors = entries.flatMap((entry) => {
    if (!file.owner.split("+").includes(`${entry.kind}:${entry.id}`)) return [];
    return (view.sources.get(entry.dir)?.files ?? [])
      .filter(
        (source) =>
          source.path.replace(/\.tmpl$/, "") === file.path &&
          (source.source.startsWith("files/") ||
            snapshot.composition.agents.some((agent) =>
              source.source.startsWith(`adapters/${agent}/`),
            )),
      )
      .map((source) => ({ entry, source }));
  });
  const indexOf = (source: Source) => {
    if (!needle) return -1;
    const literal = source.text.indexOf(needle);
    return literal >= 0 ? literal : source.text.indexOf(JSON.stringify(needle).slice(1, -1));
  };
  const matching = contributors.filter(({ source }) =>
    matches ? matches(source) : indexOf(source) >= 0,
  );
  const found =
    matching.find(({ entry }) => view.entries.some((wanted) => wanted.dir === entry.dir)) ??
    matching[0] ??
    contributors.find(({ source }) => source.source === planned?.source?.file) ??
    contributors[0];
  if (!found) return undefined;
  const index = indexOf(found.source);
  return {
    ...found,
    line: index < 0 ? undefined : found.source.text.slice(0, index).split("\n").length,
  };
}

/** A defect is reported once even if several presets, adapters or compositions expose it. */
export function uniqueFindings(values: ReadonlyArray<Finding>): Finding[] {
  return [...new Map(values.map((value) => [JSON.stringify(value), value])).values()];
}

export const renderedFileChecks: Check = (view) =>
  Effect.map(view.composed, ({ findings }) => ({ findings }));
