import { Effect, Result } from "effect";
import type {
  BadInput,
  ComposeConflict,
  EntryInvalid,
  NotFound,
  PermissionDenied,
} from "../../errors";
import { APP_TAG, type FragmentMeta, type StackMeta } from "../../schemas/entry";
import type { Finding, SizeRow } from "../../schemas/validate";
import { countWords } from "../brief/words";
import { targetAgents } from "../compose/agents";
import { type ComposeWarning, type Composition, compose } from "../compose/compose";
import type { Entry } from "../registry/entry";
import { bodyLimit, canonicalBrief, composedLimit } from "./budget";
import { type Check, entryFile, finding, type View } from "./view";

const PRESETS = ["default", "sandbox"] as const;
type Preset = (typeof PRESETS)[number];
type Stack = Entry & { meta: StackMeta };
type ComposeFailure = NotFound | BadInput | EntryInvalid | ComposeConflict | PermissionDenied;
/** D7: the layers every stack's default composition verifies. */
const LAYERS = ["install", "lint", "typecheck", "test"] as const;
/** Stacks with these tags also need a `serve` step with a probe. */
const SERVED = ["web", "api"];

/** Each entry's own body against its limit (stack, fragment or app), every branch counted. */
export const bodyChecks: Check = (view) =>
  Effect.sync(() => {
    const findings: Finding[] = [];
    const sizes: SizeRow[] = [];
    for (const entry of view.entries) {
      const words = countWords(entry.body);
      const limit = bodyLimit(entry);
      sizes.push({ kind: "body", entryKind: entry.kind, entry: entry.id, words, limit });
      if (words > limit)
        findings.push(
          finding(entry, {
            check: "budget-body",
            severity: "error",
            file: entryFile(view, entry),
            message: `body is ${words.toLocaleString("en-US")} words, limit ${limit.toLocaleString("en-US")}`,
          }),
        );
    }
    return { findings, sizes };
  });

/** How a composition is named in findings and size rows: `go-cli (sandbox) + postgres`. */
const subject = (stack: string, preset: string, added?: string) =>
  `${stack} (${preset})${added === undefined ? "" : ` + ${added}`}`;

/**
 * The compositions each validated stack is budgeted in: its required and default fragments (with
 * any default app), then each optional fragment and each app that fits it added on its own, all
 * in both presets. Apps come from the validated root (or the stack's own `optional`), so the
 * compositions don't depend on what else this machine holds. An added fragment replaces the
 * defaults it conflicts with, in either direction, and an added app replaces default apps, since
 * one composition holds at most one. An optional id that names no fragment is `referenceChecks`'.
 */
function plans(view: View, stack: Stack) {
  const { required, optional } = stack.meta.fragments;
  const defaults = stack.meta.fragments.default;
  const fragments = new Map(
    view.all.flatMap((item) =>
      item.kind === "fragment" && "meta" in item && item.meta.kind === "fragment"
        ? [[item.id, { item, meta: item.meta }] as const]
        : [],
    ),
  );
  const fits = (meta: FragmentMeta) =>
    meta.appliesTo.length === 0 ||
    meta.appliesTo.includes(stack.id) ||
    stack.meta.tags.some((tag) => meta.appliesTo.includes(tag));
  const isApp = (id: string) => fragments.get(id)?.meta.category === "app";
  const conflicting = (a: string, b: string) =>
    (fragments.get(a)?.meta.conflicts.includes(b) ?? false) ||
    (fragments.get(b)?.meta.conflicts.includes(a) ?? false);
  const apps = [...fragments.values()]
    .filter(({ item, meta }) => meta.category === "app" && fits(meta) && view.inRoot(item))
    .map(({ item }) => item.id);
  const known = new Set(view.all.filter((item) => item.kind === "fragment").map((item) => item.id));
  const extras = [...new Set([...optional.filter((id) => known.has(id)), ...apps])]
    .filter((id) => !required.includes(id) && !defaults.includes(id))
    .sort();
  return [
    { added: undefined, with: [], without: [] },
    ...extras.map((id) => ({
      added: id,
      with: [id],
      without: defaults.filter(
        (other) =>
          !required.includes(other) && ((isApp(id) && isApp(other)) || conflicting(id, other)),
      ),
    })),
  ];
}

/** A compose failure as one line: what failed and the ids involved, never file content. */
function describe(error: ComposeFailure): { check: string; message: string } {
  switch (error._tag) {
    case "ComposeConflict": {
      const details = error.details;
      if (!details) return { check: "compose", message: "can't compose" };
      const parties = [...(details.stack ? [details.stack] : []), ...details.ids].join(", ");
      const what = details.path ?? details.step ?? details.key;
      return {
        check: details.reason === "step_name" ? "step-names" : "compose",
        message: `can't compose (${details.reason}): ${parties}${what ? `; ${what}` : ""}`,
      };
    }
    case "EntryInvalid": {
      const details = error.details;
      if (!details) return { check: "compose", message: "an entry is invalid" };
      const at = details.path
        ? ` at ${details.path}${details.line === undefined ? "" : `:${details.line}`}`
        : "";
      return {
        check: "compose",
        message: `${details.origin} entry ${details.id} is invalid (${details.reason}${details.problem ? `, ${details.problem}` : ""})${at}`,
      };
    }
    case "PermissionDenied":
      return {
        check: "compose",
        message: `a file is unreadable${error.details?.path ? `: ${error.details.path}` : ""}`,
      };
    case "NotFound":
      return { check: "compose", message: "an id named in the composition resolves to nothing" };
    case "BadInput":
      return { check: "compose", message: "the composition's flags contradict each other" };
  }
}

/**
 * Whether another check of this run already reports what made compose fail, so saying it again
 * would be noise: a validated entry's conditional markers or merged JSON, a fragment the load
 * checks rejected, or an id a validated entry names that `referenceChecks` found unknown.
 */
function reportedElsewhere(view: View, error: ComposeFailure): boolean {
  if (error._tag === "ComposeConflict") {
    const details = error.details;
    if (details?.reason !== "requires") return false;
    // A requires edge: the stack (or the first fragment) names the last id.
    const target = details.ids.at(-1);
    const requirer =
      details.stack !== undefined
        ? { kind: "stack", id: details.stack }
        : { kind: "fragment", id: details.ids[0] };
    const known = view.all.some((item) => item.kind === "fragment" && item.id === target);
    return (
      !known &&
      view.entries.some((entry) => entry.kind === requirer.kind && entry.id === requirer.id)
    );
  }
  if (error._tag !== "EntryInvalid" || !error.details) return false;
  const { id, origin, reason } = error.details;
  if (
    view.rejected.some(
      (item) => item.kind === "fragment" && item.id === id && item.origin === origin,
    )
  )
    return true;
  return (
    (reason === "conditional" || reason === "merge_json") &&
    view.entries.some((entry) => entry.id === id && entry.origin === origin)
  );
}

/**
 * Each validated stack composed in each budgeted composition: a failure is a `compose` (or
 * `step-names`) error, a brief over its limit is `budget-composed`, and the default composition
 * must verify every D7 layer. Briefs are rendered with the canonical context; untrusted entries
 * get no special section.
 */
export const compositionChecks: Check = (view) =>
  Effect.gen(function* () {
    const findings: Finding[] = [];
    const sizes: SizeRow[] = [];
    const agents = targetAgents(undefined, {});
    const stacks = view.entries.filter((entry): entry is Stack => entry.meta.kind === "stack");
    for (const stack of stacks) {
      const file = entryFile(view, stack);
      const missing = new Map<string, Preset[]>();
      // One finding per failure, naming every preset it happened in.
      const failed = new Map<
        string,
        { check: string; added: string | undefined; message: string; presets: Preset[] }
      >();
      // Compose warnings, once per code and id, naming every preset they came up in.
      const warned = new Map<
        string,
        ComposeWarning & { added: string | undefined; presets: Preset[] }
      >();
      for (const preset of PRESETS) {
        for (const plan of plans(view, stack)) {
          const name = subject(stack.id, preset, plan.added);
          const composed = yield* Effect.result(
            compose({
              stack: stack.id,
              with: plan.with,
              without: plan.without,
              preset,
              agents,
              always: [],
              mode: "new",
            }),
          );
          if (Result.isFailure(composed)) {
            const error = composed.failure;
            if (!reportedElsewhere(view, error)) {
              const { check, message } = describe(error);
              const key = `${check}\0${plan.added ?? ""}\0${message}`;
              const prior = failed.get(key);
              if (prior) prior.presets.push(preset);
              else failed.set(key, { check, added: plan.added, message, presets: [preset] });
            }
            // The added compositions fail the same way when the base one does.
            if (plan.added === undefined) break;
            continue;
          }
          const composition = composed.success;
          for (const warning of composition.warnings) {
            const key = `${warning.code}\0${warning.id}`;
            const prior = warned.get(key);
            if (prior) prior.presets.push(preset);
            else warned.set(key, { ...warning, added: plan.added, presets: [preset] });
          }
          const brief = canonicalBrief(composition);
          const limit = composedLimit(composition);
          sizes.push({
            kind: "composed",
            entryKind: "stack",
            entry: stack.id,
            preset,
            ...(plan.added === undefined ? {} : { with: plan.added }),
            words: brief.briefWords,
            fixedWords: brief.fixedWords,
            limit,
          });
          if (brief.briefWords > limit)
            findings.push(
              finding(stack, {
                check: "budget-composed",
                severity: "error",
                file,
                message: `${name}: ${brief.briefWords.toLocaleString("en-US")} words, limit ${limit.toLocaleString("en-US")}`,
              }),
            );
          if (plan.added === undefined)
            for (const layer of missingLayers(stack, composition))
              missing.set(layer, [...(missing.get(layer) ?? []), preset]);
        }
      }
      for (const { check, added, message, presets } of failed.values())
        findings.push(
          finding(stack, {
            check,
            severity: "error",
            file,
            message: `${subject(stack.id, presets.join(", "), added)}: ${message}`,
          }),
        );
      // The stack lists a fragment that doesn't fit it: an error, like any other broken listing.
      for (const { code, id, added, presets } of warned.values())
        findings.push(
          finding(stack, {
            check: code === "with_not_applicable" ? "optional-fits" : "compose",
            severity: "error",
            file,
            message:
              code === "with_not_applicable"
                ? `fragments.optional names ${id}, whose applies_to matches neither this stack nor its tags`
                : `${subject(stack.id, presets.join(", "), added)}: compose warns ${code.replaceAll("_", " ")}: ${id}`,
          }),
        );
      for (const [layer, presets] of missing)
        findings.push(
          finding(stack, {
            check: "verify-layers",
            severity: "error",
            file,
            message:
              layer === "serve"
                ? `no serve step with expect, which a stack tagged web or api needs (${presets.join(", ")})`
                : `no verify step with layer ${layer} (${presets.join(", ")})`,
          }),
        );
    }
    return { findings, sizes };
  });

/** D7 layers the stack's own default composition doesn't cover; app steps don't count. */
function missingLayers(stack: Stack, composition: Composition): string[] {
  const steps = composition.verify.filter(
    (step) => !step.tags.includes(APP_TAG) && !step.skipByDefault,
  );
  const layers = new Set(steps.map((step) => step.layer));
  const missing: string[] = LAYERS.filter((layer) => !layers.has(layer));
  const served = steps.some((step) => step.phase === "serve" && step.expect);
  if (stack.meta.tags.some((tag) => SERVED.includes(tag)) && !served) missing.push("serve");
  return missing;
}
