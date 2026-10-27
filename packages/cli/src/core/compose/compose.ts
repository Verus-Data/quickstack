import { Effect, Result } from "effect";
import {
  BadInput,
  ComposeConflict,
  EntryInvalid,
  NotFound,
  type PermissionDenied,
} from "../../errors";
import {
  type AgentId,
  APP_TAG,
  type Category,
  type FragmentMeta,
  type ResolvedStep,
  type StackMeta,
  withStepDefaults,
} from "../../schemas/entry";
import { type Entry, isRejected, type Kind, markdownFile, type Origin } from "../registry/entry";
import { Registry } from "../registry/registry";
import { closest } from "../suggest";
import { resolveConditionals } from "./conditionals";
import { deepMerge } from "./merge";

export type ComposeOptions = {
  stack: string;
  with: ReadonlyArray<string>;
  without: ReadonlyArray<string>;
  preset: "default" | "sandbox";
  /** Adapter targets, from `targetAgents`. */
  agents: ReadonlyArray<AgentId>;
  /** `Settings.always`. */
  always: ReadonlyArray<string>;
  /** "add" arrives in 3.0. */
  mode: "new";
};

/** Which entry: a stack and a fragment may share an id, so an id alone is ambiguous. */
export type EntryRef = { kind: Kind; id: string };

export type PlannedFile = {
  /** Output path, relative to the project root, `.tmpl` dropped. */
  path: string;
  /** The writing entry; for a merge, the first writer. */
  owner: EntryRef;
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

export type Composition = {
  /** The stack, its body with conditionals resolved. */
  stack: Entry;
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

/** Categories `--sandbox` leaves out unless named with `--with` or required by another fragment. */
export const SANDBOX_DROPS: ReadonlyArray<Category> = ["deploy", "release", "app"];
/** The step tag `--sandbox` skips by default (`verify --all` still runs it). */
export const PROD_TAG = "prod";

type Fragment = Entry & { meta: FragmentMeta };
type Stack = Entry & { meta: StackMeta };

const isFragment = (entry: Entry): entry is Fragment => entry.meta.kind === "fragment";
const isStack = (entry: Entry): entry is Stack => entry.meta.kind === "stack";
const isApp = (fragment: Fragment) => fragment.meta.category === "app";
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const ref = (entry: Entry): EntryRef => ({ kind: entry.kind, id: entry.id });

/** Whether a fragment's `appliesTo` names the stack or one of its tags; empty fits anywhere. */
function fits(fragment: Fragment, stack: Stack): boolean {
  const targets = fragment.meta.appliesTo;
  return (
    !targets.length ||
    targets.includes(stack.id) ||
    stack.meta.tags.some((tag) => targets.includes(tag))
  );
}

type ConflictDetails = NonNullable<ComposeConflict["details"]>;
const conflict = (details: ComposeConflict["details"]) => new ComposeConflict({ details });
/** The parties to a conflict, in reading order: the stack in `stack`, fragments in `ids`. */
function parties(entries: ReadonlyArray<Entry>): Pick<ConflictDetails, "stack" | "ids"> {
  const stack = entries.find((entry) => entry.kind === "stack");
  const ids = [
    ...new Set(entries.filter((entry) => entry.kind === "fragment").map((entry) => entry.id)),
  ];
  return stack ? { stack: stack.id, ids } : { ids };
}

/**
 * A stack id plus `--with`/`--without`, `Settings.always` and a preset, composed into what `new`
 * writes and the brief describes. Reads only through `Registry`; otherwise pure.
 */
export const compose = (
  options: ComposeOptions,
): Effect.Effect<
  Composition,
  NotFound | BadInput | EntryInvalid | ComposeConflict | PermissionDenied,
  Registry
> =>
  Effect.gen(function* () {
    const registry = yield* Registry;
    const listed = yield* registry.all;
    const known = (kind: Kind) =>
      listed.filter((item) => item.kind === kind).map((item) => item.id);
    const usable = (kind: Kind) =>
      listed.filter((item) => item.kind === kind && !isRejected(item)).map((item) => item.id);
    const fragmentIds = new Set(known("fragment"));
    const missing = (id: string, kind: Kind) =>
      new NotFound({ details: { suggestions: closest(id, usable(kind)) } });

    // Ids the user typed are checked before anything is selected.
    if (!known("stack").includes(options.stack)) return yield* missing(options.stack, "stack");
    for (const id of [...options.with, ...options.without])
      if (!fragmentIds.has(id)) return yield* missing(id, "fragment");
    const without = new Set(options.without);
    const withIds = [...new Set(options.with)].sort(byId);
    const both = withIds.find((id) => without.has(id));
    if (both !== undefined)
      return yield* new BadInput({ details: { id: both, flag: "with_without" } });

    const stackEntry = yield* registry.get("stack", options.stack);
    if (!isStack(stackEntry)) return yield* Effect.die(new Error("Registry returned a non-stack"));
    const stack = stackEntry;
    const sandbox = options.preset === "sandbox";
    /** A requirer and what it requires; `null` is the stack. */
    const edge = (requirer: string | null, id: string) =>
      requirer === null ? { stack: stack.id, ids: [id] } : { ids: [requirer, id] };

    const loaded = new Map<string, Fragment>();
    /** A fragment an entry names; an id that names none is a requirement nothing can satisfy. */
    const load = (id: string, requirer: string | null) =>
      Effect.gen(function* () {
        const cached = loaded.get(id);
        if (cached) return cached;
        if (!fragmentIds.has(id))
          return yield* conflict({ reason: "requires", ...edge(requirer, id) });
        const entry = yield* registry.get("fragment", id);
        if (!isFragment(entry))
          return yield* Effect.die(new Error("Registry returned a non-fragment"));
        loaded.set(id, entry);
        return entry;
      });

    const via = new Map<string, Via>();
    const state = new Map<string, "visiting" | "done">();
    /** Depth first over `requires`: checks each edge and finds cycles. */
    const visit = (
      id: string,
      requirer: string | null,
      how: Via,
      path: ReadonlyArray<string>,
    ): Effect.Effect<void, NotFound | EntryInvalid | ComposeConflict | PermissionDenied> =>
      Effect.gen(function* () {
        const seen = state.get(id);
        if (seen === "visiting") {
          const cycle = path.slice(path.indexOf(id));
          const start = cycle.indexOf([...cycle].sort(byId)[0] ?? id);
          return yield* conflict({
            reason: "cycle",
            ids: [...cycle.slice(start), ...cycle.slice(0, start)],
          });
        }
        const fragment = yield* load(id, requirer);
        const pulled = how === "required" || how === "requires";
        if (pulled && isApp(fragment))
          return yield* conflict({ reason: "app_required", ...edge(requirer, id) });
        if (pulled && without.has(id))
          return yield* conflict({
            reason: how === "required" ? "required" : "requires",
            ...edge(requirer, id),
          });
        // Checked per edge above, so the outcome doesn't depend on which edge was walked first.
        if (seen === "done") return;
        state.set(id, "visiting");
        const next: Via = how === "required" ? "required" : "requires";
        for (const required of fragment.meta.requires)
          yield* visit(required, id, next, [...path, id]);
        state.set(id, "done");
        if (!via.has(id)) via.set(id, how);
      });

    // 1. Required, with their requirements.
    for (const id of stack.meta.fragments.required) yield* visit(id, null, "required", []);
    // 2. Defaults, minus --without and the sandbox drops.
    for (const id of stack.meta.fragments.default) {
      if (without.has(id) || via.has(id)) continue;
      const fragment = yield* load(id, null);
      if (sandbox && SANDBOX_DROPS.includes(fragment.meta.category)) continue;
      via.set(id, "default");
    }
    // 3. The user's `always`, where it fits.
    const warnings: ComposeWarning[] = [];
    for (const id of options.always) {
      if (without.has(id) || via.has(id)) continue;
      if (!fragmentIds.has(id)) {
        warnings.push({ code: "always_unknown", id });
        continue;
      }
      const fragment = yield* load(id, null);
      if (!fits(fragment, stack)) {
        warnings.push({ code: "always_not_applicable", id });
        continue;
      }
      if (sandbox && SANDBOX_DROPS.includes(fragment.meta.category)) continue;
      via.set(id, "always");
    }
    // 4. --with, kept even when it doesn't fit or the sandbox would drop it.
    for (const id of withIds) {
      const fragment = yield* load(id, null);
      if (!fits(fragment, stack)) warnings.push({ code: "with_not_applicable", id });
      if (via.get(id) !== "required") via.set(id, "with");
    }
    for (const id of [...without].sort(byId))
      if (!stack.meta.fragments.default.includes(id) && !options.always.includes(id))
        warnings.push({ code: "without_not_selected", id });
    // 5. The requirements of everything selected so far.
    for (const id of [...via.keys()].sort(byId))
      yield* visit(id, null, via.get(id) ?? "requires", []);

    const selected = [...via.keys()].sort(byId).flatMap((id) => loaded.get(id) ?? []);
    // 6. At most one app.
    const apps = selected.filter(isApp).map((fragment) => fragment.id);
    if (apps.length > 1) return yield* conflict({ reason: "app_count", ids: apps });
    // 7. Conflicts, either direction.
    const present = new Set(selected.map((fragment) => fragment.id));
    for (const fragment of selected)
      for (const other of fragment.meta.conflicts)
        if (present.has(other))
          return yield* conflict({ reason: "conflicts", ids: [fragment.id, other].sort(byId) });
    // 8. Fit, for what the stack author or a requirement chose.
    for (const fragment of selected) {
      const how = via.get(fragment.id);
      if (how !== "with" && how !== "always" && !fits(fragment, stack))
        return yield* conflict({ reason: "applies_to", ids: [fragment.id] });
    }

    const ordered = order(selected);
    const resolve = resolver(registry, {
      stack: stack.id,
      tags: stack.meta.tags,
      mode: options.mode,
      preset: options.preset,
      with: ordered.map((fragment) => fragment.id),
    });
    const resolvedStack = yield* resolve(stack);
    const fragments = yield* Effect.forEach(ordered, resolve);
    const entries: ReadonlyArray<Entry> = [resolvedStack, ...fragments];
    const app = fragments.find(isApp) ?? null;

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
          owner: ref(entry),
          text: entry === resolvedStack ? text : `${entry.id}: ${text}`,
        })),
      ),
      tools: grouped(entries, (entry) =>
        isFragment(entry) ? [...entry.meta.tools, ...entry.meta.requiresTools] : entry.meta.tools,
      ).map(([tool, owners]) => ({ tool, owners: owners.map(ref) })),
      deps: mergeDeps(entries),
      needsOwnRepo: fragments.filter((fragment) => fragment.meta.needsOwnRepo).map((f) => f.id),
      untrusted: entries
        .filter((entry) => !entry.trusted)
        .map(({ id, kind, origin, dir }) => ({ id, kind, origin, dir })),
      warnings,
    } satisfies Composition;
  });

/** Topological by `requires` (a requirement first), ties by id, the app last. */
function order(selected: ReadonlyArray<Fragment>): Fragment[] {
  const ids = new Set(selected.map((fragment) => fragment.id));
  const done = new Set<string>();
  const out: Fragment[] = [];
  const waiting = [...selected];
  while (waiting.length) {
    // Cycles were refused while selecting, so something is always ready.
    const ready = waiting
      .filter((fragment) => fragment.meta.requires.every((id) => !ids.has(id) || done.has(id)))
      .sort((a, b) => Number(isApp(a)) - Number(isApp(b)) || byId(a.id, b.id))[0];
    if (!ready) break;
    waiting.splice(waiting.indexOf(ready), 1);
    done.add(ready.id);
    out.push(ready);
  }
  return out;
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

const TEMPLATE = ".tmpl";

/** Code points HFS+ ignores in names (git's `is_hfs_dotgit`): `.git` with one inside opens `.git`. */
const HFS_IGNORABLE = /[\u{200c}-\u{200f}\u{202a}-\u{202e}\u{206a}-\u{206f}\u{feff}]/gu;
/** A name the way a case-insensitive filesystem compares it. */
const fold = (name: string) => name.normalize("NFC").toLowerCase();

/**
 * Whether a path segment names `.git` or `.quickstacks` on some filesystem: the directories the
 * CLI owns in a project. After git's `is_hfs_dotgit` and `is_ntfs_dotgit`: case folded, HFS+
 * ignorable code points dropped, anything from a `:` (an NTFS stream) on and trailing dots and
 * spaces cut, and the NTFS short names `git~1` and `quicks~1` included.
 */
export function reservedSegment(segment: string): boolean {
  const name = (fold(segment.replace(HFS_IGNORABLE, "")).split(":")[0] ?? "").replace(/[. ]+$/, "");
  return name === ".git" || name === ".quickstacks" || name === "git~1" || name === "quicks~1";
}

/** Every output path with one owner, or one JSON merge of writers that all list it in `merge`. */
function planFiles(
  registry: Registry["Service"],
  entries: ReadonlyArray<Entry>,
  agents: ReadonlyArray<AgentId>,
) {
  return Effect.gen(function* () {
    type Writer = { entry: Entry; source: string; template: boolean; mode: number };
    const byPath = new Map<string, Writer[]>();
    for (const entry of entries)
      for (const file of yield* registry.files(entry)) {
        const agent = /^adapters\/([^/]+)\//.exec(file.source)?.[1];
        if (agent !== undefined && !agents.some((id) => id === agent)) continue;
        // A template needs a name before the suffix: a file called just `.tmpl` is copied as is.
        const base = file.path.slice(file.path.lastIndexOf("/") + 1);
        const template = base.endsWith(TEMPLATE) && base.length > TEMPLATE.length;
        const path = template ? file.path.slice(0, -TEMPLATE.length) : file.path;
        if (!path || path.startsWith("/") || path.split("/").includes(".."))
          return yield* Effect.die(
            new Error("A planned path is empty or escapes the project root"),
          );
        if (path.split("/").some(reservedSegment))
          return yield* conflict({ reason: "reserved_path", ...parties([entry]), path });
        if (template && entry.meta.merge.includes(path))
          return yield* new EntryInvalid({
            details: {
              id: entry.id,
              origin: entry.origin,
              reason: "merge_template",
              path: file.source,
            },
          });
        byPath.set(path, [
          ...(byPath.get(path) ?? []),
          { entry, source: file.source, template, mode: file.mode },
        ]);
      }
    const planned: PlannedFile[] = [];
    /** Folded file paths, and folded directories on the way to one, each to a path that made it. */
    const files = new Map<string, string>();
    const dirs = new Map<string, string>();
    for (const path of [...byPath.keys()].sort(byId)) {
      const writers = byPath.get(path) ?? [];
      const [first] = writers;
      if (!first) continue;
      // Two paths a case-insensitive filesystem treats as one, or a file where another path needs
      // a directory, would only fail mid-write; refuse them before anything is written.
      const parents = path
        .split("/")
        .slice(0, -1)
        .map((_, i, all) => fold(all.slice(0, i + 1).join("/")));
      const key = fold(path);
      const other =
        files.get(key) ??
        dirs.get(key) ??
        parents.map((parent) => files.get(parent)).find((found) => found !== undefined);
      if (other !== undefined)
        return yield* conflict({
          reason: "file_owner",
          ...parties([...(byPath.get(other) ?? []), ...writers].map((writer) => writer.entry)),
          path,
        });
      files.set(key, path);
      for (const parent of parents) dirs.set(parent, path);
      if (writers.length === 1) {
        planned.push({
          path,
          owner: ref(first.entry),
          kind: first.template ? "template" : "copy",
          source: { entry: ref(first.entry), file: first.source },
          mode: first.mode,
        });
        continue;
      }
      if (!writers.every((writer) => writer.entry.meta.merge.includes(path)))
        return yield* conflict({
          reason: "file_owner",
          ...parties(writers.map((writer) => writer.entry)),
          path,
        });
      let merged: unknown;
      for (const [i, writer] of writers.entries()) {
        const text = yield* registry.read(writer.entry, writer.source);
        const parsed = Result.try(() => JSON.parse(text) as unknown);
        if (Result.isFailure(parsed))
          return yield* new EntryInvalid({
            details: {
              id: writer.entry.id,
              origin: writer.entry.origin,
              reason: "merge_json",
              path: writer.source,
            },
          });
        merged = i === 0 ? parsed.success : deepMerge(merged, parsed.success);
      }
      planned.push({
        path,
        owner: ref(first.entry),
        kind: "merge",
        content: `${JSON.stringify(merged, null, 2)}\n`,
        mode: first.mode,
      });
    }
    return planned;
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
          owner: ref(entry),
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
  return [...roles].map(([role, { names, owners }]) => ({ role, names, owners: owners.map(ref) }));
}

/**
 * Tools not on PATH, each with the flags that would have left it out (1.2a reports these). A tool
 * goes only when every fragment needing it goes, and a fragment goes only when everything that
 * requires it goes too, so the hint covers that whole set: `--without` for a default or `always`
 * fragment, dropping `--with` for one the user added. A fragment pulled in only by `requires`
 * needs no flag of its own. Nothing can drop a tool the stack or its required fragments need.
 */
export function missingTools(
  composition: Composition,
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
  composition: Composition,
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
  return [...removed].sort(byId).flatMap((id): MissingTool["drop"] => {
    const how = via.get(id);
    if (how === "with") return [{ id, flag: "with" }];
    return how === "default" || how === "always" ? [{ id, flag: "without" }] : [];
  });
}
