import { Effect } from "effect";
import {
  type BadInput,
  type ComposeConflict,
  EntryInvalid,
  type NotFound,
  type PermissionDenied,
} from "../../errors";
import { type AgentId, APP_TAG, type ResolvedStep, withStepDefaults } from "../../schemas/entry";
import {
  type Entry,
  entryRef,
  isFragment,
  type Kind,
  markdownFile,
  type Origin,
} from "../registry/entry";
import { Registry } from "../registry/registry";
import { resolveConditionals } from "./conditionals";
import { conflict, parties } from "./conflicts";
import { planFiles } from "./plan-files";
import { selectFragments } from "./selection";

export type ComposeOptions<M extends "new" | "add" = "new"> = {
  stack: M extends "new" ? string : string | null;
  with: ReadonlyArray<string>;
  without: ReadonlyArray<string>;
  preset: "default" | "sandbox";
  /** Adapter targets, from `targetAgents`. */
  agents: ReadonlyArray<AgentId>;
  /** `Settings.always`. */
  always: ReadonlyArray<string>;
  mode: M;
  /** Already applied fragments satisfy requirements but emit nothing. */
  existing?: ReadonlyArray<string>;
};

/** Which entry: a stack and a fragment may share an id, so an id alone is ambiguous. */
export type EntryRef = { kind: Kind; id: string };

export type PlannedFile = {
  /** Output path, relative to the project root, `.tmpl` dropped. */
  path: string;
  /** The writing entry; for a merge, the first writer. */
  owner: EntryRef;
  /** Every writer in composition order, including the first. */
  owners: ReadonlyArray<EntryRef>;
  kind: "copy" | "template" | "merge";
  /** Copy and template: where the bytes come from. */
  source?: { entry: EntryRef; file: string };
  /** Merge only: the merged JSON, final bytes. */
  content?: string;
  /** Permission bits of the source file (the first writer's, for a merge). */
  mode: number;
};

export type ComposedStep = ResolvedStep & { owner: EntryRef; skipByDefault: boolean };
export type ComposeWarning = {
  code: "always_not_applicable" | "always_unknown" | "with_not_applicable" | "without_not_selected";
  id: string;
};
/**
 * How a fragment entered the selection: `required` is the stack's required list and everything it
 * requires; `requires` was pulled in only by another fragment's `requires`.
 */
export type Via = "required" | "default" | "always" | "with" | "requires";

export type Composition<S extends Entry | null = Entry> = {
  /** The stack, its body with conditionals resolved. */
  stack: S;
  /** Composition order (requirements first, ties by id, the app last), bodies resolved. */
  fragments: ReadonlyArray<Entry>;
  /** The one fragment with category "app", also in `fragments`. */
  app: Entry | null;
  /** How each fragment was selected, in composition order. */
  selection: ReadonlyArray<{ id: string; via: Via }>;
  preset: ComposeOptions["preset"];
  agents: ReadonlyArray<AgentId>;
  files: ReadonlyArray<PlannedFile>;
  verify: ReadonlyArray<ComposedStep>;
  commands: Record<string, string>;
  env: Record<string, string>;
  decisions: ReadonlyArray<{ owner: EntryRef; text: string }>;
  tools: ReadonlyArray<{ tool: string; owners: ReadonlyArray<EntryRef> }>;
  deps: ReadonlyArray<{
    role: string;
    names: ReadonlyArray<string>;
    owners: ReadonlyArray<EntryRef>;
  }>;
  /** Fragment ids that refuse an enclosing repository (1.2a). */
  needsOwnRepo: ReadonlyArray<string>;
  untrusted: ReadonlyArray<{ id: string; kind: Kind; origin: Origin; dir: string }>;
  warnings: ReadonlyArray<ComposeWarning>;
};

/** A tool not on PATH: who needs it, and the flags that would have left it out (none if none can). */
export type MissingTool = {
  tool: string;
  owners: ReadonlyArray<EntryRef>;
  drop: ReadonlyArray<{ id: string; flag: "without" | "with" }>;
};

/** The step tag `--sandbox` skips by default (`verify --all` still runs it). */
const PROD_TAG = "prod";

/**
 * A stack id plus `--with`/`--without`, `Settings.always` and a preset, composed into what `new`
 * writes and the brief describes. Reads only through `Registry`; otherwise pure.
 */
type ComposeError = NotFound | BadInput | EntryInvalid | ComposeConflict | PermissionDenied;
export function compose(
  options: ComposeOptions,
): Effect.Effect<Composition, ComposeError, Registry>;
export function compose(
  options: ComposeOptions<"add">,
): Effect.Effect<Composition<Entry | null>, ComposeError, Registry>;
export function compose(
  options: ComposeOptions<"new" | "add">,
): Effect.Effect<Composition<Entry | null>, ComposeError, Registry> {
  return Effect.gen(function* () {
    const registry = yield* Registry;
    const { stack, ordered, via, warnings, existing } = yield* selectFragments(registry, options);
    const sandbox = options.preset === "sandbox";
    const resolve = resolver(registry, {
      stack: stack?.id ?? "",
      tags: stack?.meta.tags ?? [],
      mode: options.mode,
      preset: options.preset,
      with: [...existing, ...ordered.map((fragment) => fragment.id)],
    });
    const resolvedStack = stack ? yield* resolve(stack) : null;
    const fragments = yield* Effect.forEach(ordered, resolve);
    const entries: ReadonlyArray<Entry> = [
      ...(options.mode === "new" && resolvedStack ? [resolvedStack] : []),
      ...fragments,
    ];
    const app = fragments.find((fragment) => fragment.meta.category === "app") ?? null;

    return {
      stack: resolvedStack,
      fragments,
      app,
      selection: fragments.map((fragment) => ({
        id: fragment.id,
        via: via.get(fragment.id) ?? "requires",
      })),
      preset: options.preset,
      agents: options.agents,
      files: yield* planFiles(registry, entries, options.agents),
      verify: yield* steps(entries, app, sandbox),
      commands: Object.fromEntries(
        new Map(entries.flatMap((entry) => Object.entries(entry.meta.commands))),
      ),
      env: yield* mergeEnv(entries),
      decisions: entries.flatMap((entry) =>
        entry.meta.decisions.map((text) => ({
          owner: entryRef(entry),
          text: entry === resolvedStack ? text : `${entry.id}: ${text}`,
        })),
      ),
      tools: grouped(entries, (entry) =>
        isFragment(entry) ? [...entry.meta.tools, ...entry.meta.requiresTools] : entry.meta.tools,
      ).map(([tool, owners]) => ({ tool, owners: owners.map(entryRef) })),
      deps: mergeDeps(entries),
      needsOwnRepo: fragments.filter((fragment) => fragment.meta.needsOwnRepo).map((f) => f.id),
      untrusted: entries
        .filter((entry) => !entry.trusted)
        .map(({ id, kind, origin, dir }) => ({ id, kind, origin, dir })),
      warnings,
    } satisfies Composition<Entry | null>;
  });
}

/** Each entry with its body's conditional blocks resolved; a malformed block is `EntryInvalid`. */
function resolver(
  registry: Registry["Service"],
  context: Parameters<typeof resolveConditionals>[1],
) {
  return <E extends Entry>(entry: E) =>
    Effect.gen(function* () {
      const resolved = resolveConditionals(entry.body, context);
      if ("text" in resolved) return { ...entry, body: resolved.text };
      // The body is the file's tail, so the lines before it are the difference in line counts.
      const file = markdownFile(entry.kind);
      const text = yield* registry.read(entry, file);
      const offset = text.split("\n").length - entry.body.split("\n").length;
      return yield* new EntryInvalid({
        details: {
          id: entry.id,
          origin: entry.origin,
          reason: "conditional",
          path: file,
          line: resolved.line + offset,
          problem: resolved.problem,
        },
      });
    });
}

/** Verify steps in composition order, defaults applied, names unique, the app's tagged `app`. */
function steps(entries: ReadonlyArray<Entry>, app: Entry | null, sandbox: boolean) {
  return Effect.gen(function* () {
    const owners = new Map<string, Entry>();
    const out: ComposedStep[] = [];
    for (const entry of entries)
      for (const step of entry.meta.verify) {
        const prior = owners.get(step.name);
        if (prior !== undefined)
          return yield* conflict({
            reason: "step_name",
            ...parties([prior, entry]),
            step: step.name,
          });
        owners.set(step.name, entry);
        const resolved = withStepDefaults(step);
        const tags = entry === app ? [...resolved.tags, APP_TAG] : resolved.tags;
        out.push({
          ...resolved,
          tags,
          owner: entryRef(entry),
          skipByDefault: sandbox && tags.includes(PROD_TAG),
        });
      }
    return out;
  });
}

/** `env` in composition order; two different defaults for one key is a conflict. */
function mergeEnv(entries: ReadonlyArray<Entry>) {
  return Effect.gen(function* () {
    const env = new Map<string, { value: string; owner: Entry }>();
    for (const entry of entries)
      for (const [key, value] of Object.entries(entry.meta.env)) {
        const prior = env.get(key);
        if (prior && prior.value !== value)
          return yield* conflict({ reason: "env", ...parties([prior.owner, entry]), key });
        if (!prior) env.set(key, { value, owner: entry });
      }
    return Object.fromEntries([...env].map(([key, { value }]) => [key, value]));
  });
}

/** Items each entry names, in first-seen order, with the entries that named each. */
function grouped(
  entries: ReadonlyArray<Entry>,
  items: (entry: Entry) => ReadonlyArray<string>,
): Array<[string, Entry[]]> {
  const owners = new Map<string, Entry[]>();
  for (const entry of entries)
    for (const item of new Set(items(entry)))
      owners.set(item, [...(owners.get(item) ?? []), entry]);
  return [...owners];
}

function mergeDeps(entries: ReadonlyArray<Entry>): Composition["deps"] {
  const roles = new Map<string, { names: string[]; owners: Entry[] }>();
  for (const entry of entries)
    for (const [role, names] of Object.entries(entry.meta.deps)) {
      const at = roles.get(role) ?? { names: [], owners: [] };
      at.names = [...new Set([...at.names, ...names])];
      if (names.length && !at.owners.includes(entry)) at.owners.push(entry);
      roles.set(role, at);
    }
  return [...roles].map(([role, { names, owners }]) => ({
    role,
    names,
    owners: owners.map(entryRef),
  }));
}

/**
 * Tools not on PATH, each with the flags that would have left it out (1.2a reports these). A tool
 * goes only when every fragment needing it goes, and a fragment goes only when everything that
 * requires it goes too, so the hint covers that whole set: `--without` for a default or `always`
 * fragment, dropping `--with` for one the user added. A fragment pulled in only by `requires`
 * needs no flag of its own. Nothing can drop a tool the stack or its required fragments need.
 */
export function missingTools(
  composition: Composition<Entry | null>,
  found: (tool: string) => boolean,
): MissingTool[] {
  return composition.tools
    .filter(({ tool }) => !found(tool))
    .map(({ tool, owners }) => ({ tool, owners, drop: dropFlags(composition, owners) }));
}

/**
 * The flags that would leave every one of `owners` out of the composition (`missingTools`' rule,
 * also used for `needs_own_repo`): empty when the stack or a required fragment is among them.
 */
export function dropFlags(
  composition: Composition<Entry | null>,
  owners: ReadonlyArray<EntryRef>,
): MissingTool["drop"] {
  if (owners.some((owner) => owner.kind === "stack")) return [];
  const via = new Map(composition.selection.map((item) => [item.id, item.via]));
  const requirers = (id: string) =>
    composition.fragments
      .filter((fragment) => isFragment(fragment) && fragment.meta.requires.includes(id))
      .map((fragment) => fragment.id);
  const removed = new Set<string>();
  const pending = owners.map((owner) => owner.id);
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (removed.has(id)) continue;
    removed.add(id);
    pending.push(...requirers(id));
  }
  if ([...removed].some((id) => via.get(id) === "required")) return [];
  return [...removed].sort().flatMap((id): MissingTool["drop"] => {
    const how = via.get(id);
    if (how === "with") return [{ id, flag: "with" }];
    return how === "default" || how === "always" ? [{ id, flag: "without" }] : [];
  });
}
