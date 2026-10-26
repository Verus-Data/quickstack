# Phase 3.0: `add`

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | `quickstacks add <fragment...>` applies known-good fragments to a repo that already exists, never overwrites a file, parks every conflicting file for the agent to merge, and writes a brief in add mode whose definition of done is `quickstacks verify` |
| Traces to | Job 4: "When I have an existing repo, I want to add a known-good piece (CI, agent hooks, Postgres) without it overwriting what's there, so the repo gets better instead of different." What this is not: "`add` applies fragments; it does not restructure what's there." |
| Depends on | 1.6 (composition, scaffold writer, manifest, brief and `verify` exist and have shipped once) |
| Blocks | Nothing in phase 3. 3.1's `show` reports which fragments a project could still add, which reads the same manifest code |
| Decisions needed | None new. Uses D4 (settled) and D14 (proposed): a project `add` touches gets its verify block regenerated, and the step digest is re-recorded by `add` itself, not by `verify --accept-changes` |
| Decisions or questions this settles | How a fragment lands in a repo without overwriting; what `add` does in a repo quickstacks didn't scaffold; how repeat runs treat unmerged parked files |

## Scope

In:

- `quickstacks add <fragment...> [--json] [--yes] [--agents <list>] [--no-launch] [--agent <id>]`, run from the project root (or `--dir <path>`).
- Parking conflicting files under `.quickstacks/incoming/<path>`.
- JSON deep-merge for paths declared mergeable, and for repeat parking of a JSON path.
- Creating `.quickstacks/manifest.json` when the repo has none ("existing repo" mode).
- An add-mode brief with a "Merge needed" section, then handoff through the 1.4 path.
- Refusals: symlinked `.quickstacks/` or `incoming/`, `needs_own_repo` fragments inside an enclosing repository, unknown ids, conflicts, a fragment already applied.
- A warning, with the exact command, when the project's stack requires a fragment the project doesn't have.

Out:

- Removing a fragment. Removing files the agent has since edited is a restructure (D4).
- Re-running a stack over a project, or switching a project to a different stack.
- Merging any non-JSON file. Markdown, Makefiles, YAML and source files are always parked whole; the agent merges them.
- Applying a whole stack to an existing repo (`add` takes fragments only).

## Design

### Behavior

1. Resolve the project root: `--dir`, or the current directory. Read `.quickstacks/manifest.json` if it exists. If it doesn't, the repo is an existing one and `add` will create a manifest with `stack: null`.
2. Refuse before writing anything when `.quickstacks/` or `.quickstacks/incoming/` is a symlink (the parking path could point outside the project).
3. Load the registry with the project root as the project origin, so project-local entries are visible and shadowing marks still apply.
4. Compose with `mode: "add"`: the requested fragments, their `requires` closure, minus fragments already in the manifest. `applies_to` is checked against the manifest's stack and its tags. With `stack: null`, an `applies_to` naming a stack id is a warning, not an error, because there is nothing to check against.
5. Check `needs_own_repo`: if the project root is inside an enclosing git repository (its `git rev-parse --show-toplevel` is a parent directory), refuse those fragments before writing. An independently initialized nested repo is fine.
6. Plan files. For each composed file, classify its destination:

| Destination state | What `add` does |
|---|---|
| Absent | Write it |
| Present, any content (JSON or not) | Park the new content at `.quickstacks/incoming/<path>` and list it as merge needed. The live file is never touched, even when the path is declared mergeable, because the live copy may hold choices the project made after it was written |
| Present at `incoming/<path>` from an earlier unmerged run | If both parse as JSON, deep-merge the new content into the parked copy. Otherwise park beside it as `<path>.2`, then `.3`, and list every copy |
| Identical bytes already present | Skip silently; nothing to merge |

   The live tree is never written for a path that already exists. That is the whole of D4 for files.
7. Regenerate the manifest: append the new fragments with their origins, append their verify steps after the existing ones (step names must stay unique; a collision is a composition error), merge `env` (an existing key keeps the project's value), recompute the step digest, and record it in both places 1.3 defines. Steps the project already had keep their recorded form, including any change the maintainers accepted with `verify --accept-changes`.
8. Write `.quickstacks/BRIEF.md` in add mode, ensure `.quickstacks/.gitignore` exists (never rewrite one the user edited), and hand off.

### The add-mode brief

Built by the 1.1 brief builder with `mode: "add"`. Differences from `new`:

- Title "Add <fragments> to <project>" and a facts list naming the stack (or "none recorded, existing repo") and the fragments already applied.
- "Your job" says to apply the fragments without breaking what's there.
- Conditional blocks evaluate `mode=add`, and `with=` sees both existing and new fragments.
- A "Merge needed" section listing every parked path and each of its copies, telling the agent to bring in what the incoming copy adds, keep the project's existing choices where the two conflict, and delete `.quickstacks/incoming/` when done.
- A "Missing required fragments" line when the stack requires fragments the project lacks, with the command (`quickstacks add <ids>`).
- The definition of done is `quickstacks verify` over the whole manifest, old steps and new.

### Interfaces

```ts
// src/core/add.ts
export type ParkPlan = {
  write: ReadonlyArray<{ path: string; owner: string }>;
  park: ReadonlyArray<{ path: string; incoming: string; merged: boolean; owner: string }>;
  skipped: ReadonlyArray<string>;
};

export const planAdd: (input: {
  readonly root: string;
  readonly manifest: Manifest | undefined;
  readonly composition: Composition; // from 1.1, mode "add"
  readonly files: ReadonlyArray<ComposedFile>; // path, owner, content, mergeable
}) => Effect.Effect<ParkPlan, IncomingSymlink | ComposeError, FileSystem.FileSystem | Path.Path>;

export const applyAdd: (plan: ParkPlan, files: ReadonlyArray<ComposedFile>) =>
  Effect.Effect<void, PermissionDenied, FileSystem.FileSystem | Path.Path>;
```

`planAdd` is read-only, so `add --dry-run` is free if 3.1 wants it. `applyAdd` writes through the same `assertInsideProject` guard 1.2 uses for `new`.

### Output

`add --json` result:

```json
{
  "project": ".",
  "stack": "go-cli",
  "added": ["ci-github"],
  "alreadyApplied": ["agent-ops"],
  "written": [".github/pull_request_template.md"],
  "mergeNeeded": [{ "path": "AGENTS.md", "incoming": [".quickstacks/incoming/AGENTS.md"] }],
  "missingRequired": [],
  "createdManifest": false,
  "brief": ".quickstacks/BRIEF.md",
  "briefWords": 1840,
  "untrusted": [],
  "handoff": { "kind": "print", "reason": "--json never launches an agent" },
  "next": "Read .quickstacks/BRIEF.md and carry it out. ..."
}
```

### Failure modes

| Case | Result | Exit |
|---|---|---|
| Unknown fragment id | `NotFound` with `details: { ids }` and the closest known ids | 2 |
| Fragment conflicts with one applied or requested | `ComposeError` with `details: { conflicts: [[a, b]] }` | 2 |
| Fragment already applied | `BadInput` with `details: { alreadyApplied }`; nothing written | 2 |
| Requested id is a stack | `BadInput`, message says `add` takes fragments | 2 |
| `.quickstacks/` or `incoming/` is a symlink | `IncomingSymlink` (new tag, maps to `PermissionDenied`'s code) | 6 |
| `needs_own_repo` inside an enclosing repo | `ComposeError` with `details: { needsOwnRepo, toplevel }` | 2 |
| Verify step name collides with an existing one | `ComposeError` with `details: { duplicateSteps }` | 2 |
| Manifest exists but fails to decode | `InvalidManifest` (from 1.3) | 3 |
| Write fails partway | Files already written stay; the manifest is written last, so a rerun sees the fragment as not applied and parks what it wrote before. Reported as `PermissionDenied` | 6 |

### Decisions settled here

- Parking, not prompting. `add` never asks whether to overwrite. An agent reading a merge list is more reliable than a human answering y/n per file, and it keeps `add` non-interactive.
- The manifest is written last, so a partial failure looks like "not applied" rather than "applied with missing files".
- Existing verify steps keep the form the project recorded. Regenerating them from the registry would silently undo a change the maintainers of that project accepted.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/commands/add.ts` | New thin handler |
| `packages/cli/src/core/add.ts` | `planAdd`, `applyAdd`, repeat-parking logic |
| `packages/cli/src/core/scaffold.ts` | Share the write guard and JSON merge with `new`; add the parking path |
| `packages/cli/src/core/brief.ts` | Add mode: facts, job text, "Merge needed", missing-required line |
| `packages/cli/src/core/manifest.ts` | Append fragments and steps; `stack: null` manifests |
| `packages/cli/src/errors.ts` | `IncomingSymlink`; `ComposeError` details for the new cases |
| `packages/cli/src/cli.ts` | Register `add` |
| `packages/cli/tests/add.test.ts` | New |
| `packages/cli/README.md`, `AGENTS.md` | Document `add` and its JSON result |

## Acceptance tests

All through `tests/helpers/cli.ts` with a fixture registry and temporary project directories created with real `git init`.

- `add ci-github` in a scaffolded project writes only absent files, appends the fragment's steps to the manifest, and `verify --json` afterwards lists old and new steps.
- A pre-existing `AGENTS.md` is byte-identical after `add`; the fragment's version is at `.quickstacks/incoming/AGENTS.md` and the brief's "Merge needed" lists it.
- Two `add` runs that both park `.claude/settings.json` produce one deep-merged parked copy; two that both park `README.md` produce `README.md` and `README.md.2` under `incoming/`, and the second brief lists both.
- `add` in a plain git repo with no `.quickstacks/` creates a manifest with `stack: null`, and `createdManifest: true` in the JSON result.
- A symlinked `.quickstacks` pointing outside the project exits 6 and writes nothing outside or inside.
- A `needs_own_repo` fragment in a directory nested inside another repo exits 2 before writing; the same fragment in a nested directory that has its own `git init` succeeds.
- A stack that requires `claude-harness` and a project without it: the result's `missingRequired` and the brief both contain `quickstacks add claude-harness`.
- Adding a fragment already in the manifest exits 2 and leaves the tree unchanged (compare a directory hash before and after).
- `add` starts no process other than `git` (assert with the process service's test layer recording spawns).
- Property test: for any set of pre-existing paths, the bytes of every pre-existing file are unchanged after `add`.

## Exit criteria

- All acceptance tests pass; `bun run check` is green from the repo root.
- A manual `add ci-github` on a real repo, followed by an agent run, reaches a green `verify` with the merge done and `incoming/` deleted. Notes go in the run records per 2.0.
- `AGENTS.md` and the CLI README describe `add`, parking and the JSON result.

## What this plan may get wrong

- Parking every JSON file whole, rather than merging into the live file, may make agents do mechanical merges they would get wrong less often if the CLI did them. The live tree rule is worth keeping; watch the run notes for merge mistakes.
- `stack: null` projects get no `applies_to` checking. If fragments routinely assume a stack's layout, `add` on foreign repos may produce briefs that don't fit. A `--stack` hint flag is the likely fix.
- Appending steps assumes old and new steps don't depend on each other's order. A fragment whose setup step must run before an existing one (a database before tests) needs phase ordering to be enough; if it isn't, the manifest needs explicit ordering.
