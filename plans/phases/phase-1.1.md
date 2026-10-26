# Phase 1.1: Composition and the brief

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Turn a stack id plus `--with`/`--without` and a preset into a composition (entries, files, verify steps, commands, decisions, env), and render the brief an agent can follow to a green `verify` without asking anything the brief could have answered |
| Traces to | "a brief that says 'set up testing' without saying which layers, a verify command that doesn't exist, a decision with no default" (the coding agent's frustration); "Success is reaching a green `verify` without asking the user anything the brief could have answered"; Evidence, "stack prose grows without a budget" |
| Depends on | [1.0](phase-1.0.md) |
| Blocks | [1.2](phase-1.2.md), [1.5](phase-1.5.md) |
| Decisions needed | D5 only for the numbers 1.5 enforces; 1.1 just counts words. D7 is not needed here |
| Decisions or questions this settles | Composition order and conflict rules; conditional prose syntax; how words are counted; the brief's section order and its fixed rules, including the `Asked` log used to count interventions |

## Scope

In:

- `compose`: a pure function from entries and options to a `Composition`.
- Fragment selection: required, default, optional, `--with`, `--without`, user `always`
  defaults (read from config), sandbox drops.
- `requires` closure, `conflicts`, `appliesTo`, `needsOwnRepo` (as a flag for 1.2).
- File ownership and JSON `merge` planning (what gets written by whom; 1.2 writes).
- Conditional prose blocks.
- Merged `commands`, `env`, `decisions`, `tools`, verify steps.
- `renderBrief`: the brief text, plus `countWords`.

Out:

- Writing anything to disk (1.2). Running anything (1.3).
- Budget limits and authoring diagnostics (1.5).
- The `add` mode of the brief (3.0). The section ordering below leaves room for its
  "Merge needed" section.

## Design

### Inputs and output

```ts
// src/core/compose/compose.ts
export type ComposeOptions = {
  stack: string
  with: ReadonlyArray<string>
  without: ReadonlyArray<string>
  preset: "default" | "sandbox"
  agents: ReadonlyArray<AgentId>        // adapter targets; default ["claude"] from config
  always: ReadonlyArray<string>          // config.json `always`, minus --without
  mode: "new"                            // "add" arrives in 3.0
}

export type Composition = {
  stack: Entry
  fragments: ReadonlyArray<Entry>        // composition order, see below
  files: ReadonlyArray<PlannedFile>      // path, owner id, source, kind: copy | template | merge
  verify: ReadonlyArray<VerifyStep & { owner: string }>
  commands: Record<string, string>
  env: Record<string, string>
  decisions: ReadonlyArray<{ owner: string; text: string }>
  tools: ReadonlyArray<{ tool: string; owners: ReadonlyArray<string> }>
  needsOwnRepo: ReadonlyArray<string>    // fragment ids that refuse an enclosing repo
  untrusted: ReadonlyArray<{ id: string; dir: string }>
}

export const compose: (
  options: ComposeOptions,
) => Effect.Effect<Composition, NotFound | EntryInvalid | ComposeConflict, Registry>
```

`compose` reads through `Registry` and is otherwise pure, so tests drive it with the
fixture registry from 1.0 and assert on the value.

### Selection

In this order:

1. Start with the stack's `fragments.required` and `fragments.default`, plus `always`.
2. Remove `--without` ids. Removing a required fragment is `ComposeConflict`
   (reason `required`): the stack's own files depend on it.
3. Add `--with` ids. A `--with` id that is not a fragment is `NotFound`.
4. Under `--sandbox`, drop fragments with category `deploy` or `release` unless they were
   named in `--with` or are required.
5. Add the transitive `requires` closure of everything selected. A requirement on a
   removed fragment is `ComposeConflict` (reason `requires`), naming both.
6. Check `conflicts` in both directions; any pair present is `ComposeConflict`.
7. Check each fragment's `appliesTo` against the stack id and tags; a miss is
   `ComposeConflict` (reason `applies_to`).

Composition order is stack, then fragments in the order they were selected (required,
default, always, with), with `requires` inserted before the fragment that needs them.
Order decides JSON merge precedence, verify step order within a phase, and the order of
sections in the brief, so it must be deterministic: same inputs, same order.

### Files

Every output path has one owner. Two entries writing the same path is
`ComposeConflict` (reason `file_owner`), unless every writer lists that path in `merge`,
in which case the files are JSON-parsed and deep-merged in composition order: objects
merge recursively, arrays concatenate with duplicates removed, later scalars win. A file
listed in `merge` that doesn't parse as JSON is `EntryInvalid`.

`adapters/<agent>/` files are included only for agents in `options.agents`. Files whose
name ends `.tmpl` are planned as `template`; 1.2 renders them with the fixed variable
set. `compose` only checks that no planned path escapes the project root (`..`, absolute
paths).

Shared prose files (`AGENTS.md`, `README.md`, `Makefile`) are never merged. The owning
entry ships the skeleton; other entries describe their additions in prose, and the agent
writes them.

### Verify steps, commands, env

Steps come from the stack, then fragments, in composition order. Names must be unique
across the composition (`ComposeConflict`, reason `step_name`). Under `--sandbox`, steps
tagged `prod` are kept in the composition and marked skipped by default in the manifest
(1.2), so `verify --all` can still run them.

`commands` and `env` merge as records in composition order; a later entry's purpose or
default replaces an earlier one's. That lets a fragment redefine what `check` means.

### Conditional prose

```markdown
<!-- quickstacks:when stack=go-cli,python-react -->
Wire the client into the Makefile's `test` target.
<!-- quickstacks:end -->
```

| Key | Matches |
|---|---|
| `stack` | The stack id |
| `tag` | Any of the stack's tags |
| `tag!=` | None of the listed tags |
| `mode` | `new` (later `add`) |
| `preset` | `default` or `sandbox` |
| `with` | A fragment id present in the composition |

Commas are OR within a key; several keys on one marker are AND. Blocks don't nest. Each
marker is alone on its line. A matching block loses its two marker lines; a
non-matching block is removed whole. Unknown keys, nesting and unclosed blocks fail
with `EntryInvalid` (reason `conditional`, with the entry-relative line number), so a
typo never leaks raw markers into a brief. 1.5 adds the warnings (unknown stack ids,
tags no stack declares).

### The brief

`renderBrief(composition, context): string`, where `context` carries project name, git
state (`fresh`, `parent` with its toplevel, `none`), the list of written paths, missing
tools, `yes` (from `--yes` or `--sandbox`) and the CLI invocation string (`quickstacks`,
or `npx quickstacks` when run through npx, so the commands the agent copies work).

Sections, in order. Fixed text lives in `src/core/brief/text.ts` so it can be read and
reviewed in one place.

| # | Section | Content |
|---|---|---|
| 1 | Title and facts | Stack name and id, fragments, preset, target agents, "project root is the directory containing `.quickstacks/`" |
| 2 | Untrusted entries | Only when `untrusted` is non-empty: stop, name each entry and its path, get the user's confirmation first |
| 3 | Your job | Done means `<cli> verify` exits 0 with outcome `green`. Work autonomously; stop only for the decisions and missing tools below |
| 4 | Versions | Nothing pins a version on purpose; latest stable that work together; official generators over hand-written files; check current docs, `--help` and installed types before writing config; don't pin remembered versions |
| 5 | Ground rules | Generators non-interactive and never into the populated root; git state rule; files quickstacks wrote are starting points to adapt, not delete; keep `AGENTS.md` true to the real commands; leave `.quickstacks/manifest.json` alone, its verify steps are the definition of done and changing them fails verify; keep `.quickstacks/NOTES.md`; missing tools |
| 6 | Decisions | With `yes`: use each default and list them in the final summary. Otherwise: ask once, in one message, with each default so the user can reply "defaults" |
| 7 | Stack guidance | The stack body, conditionals resolved, headings nested one level down |
| 8 | Fragment guidance | One section per fragment, in composition order |
| 9 | Definition of done | The merged commands table; the verify command; then a manual QA pass: run the dev, test and build commands yourself, fix warnings in their output, exercise what you built, because verify only checks exit codes and probes |
| 10 | Sandbox | Only under `--sandbox`: local only, never deployed, skip deploy and release work, `prod` steps are skipped, optimize for time to green |

The NOTES.md rule is one bullet with two parts, because 2.0 reads it:

- Append a line under `## Findings` whenever the brief is ambiguous, wrong, names
  something that doesn't exist, or made you guess, and whenever an instruction stopped
  you making a mistake.
- Append a line under `## Asked` every time you ask the user something or the user
  tells you something unprompted, with the time. An empty `## Asked` section means no
  interventions.

This is how interventions are counted in interactive runs (roadmap, Measurement). It is
self-reported, which is a known weakness; bench runs in 2.0 measure it directly.

### Word count

`countWords(text)` splits on runs of whitespace after removing conditional marker lines,
counting code fences and their content. One definition, used by `new --json`
(`briefWords`), by `validate` for entry bodies (all branches) and composed briefs, and
by run records, so the numbers in D5, in 1.6's gate and in 2.0's ledger are comparable.

### Failure modes

| Situation | Error tag | Exit | What the agent sees |
|---|---|---|---|
| Stack id unknown | `NotFound` | 2 | `details: { kind: "stack", id, known: [...] }` (up to 20 ids) |
| `--with` names a stack, or an unknown id | `NotFound` | 2 | `details: { kind: "fragment", id }` |
| Removing a required fragment, conflicts, applies-to miss, duplicate step name, two owners of a file | `ComposeConflict` | 2 | `details: { reason, ids, path?, step? }` |
| Malformed conditional block or bad merge JSON | `EntryInvalid` | 2 | `details: { id, origin, reason, line? }` |

`ComposeConflict` is a new tag on exit 2, not retryable.

### Settled here

| Question | Answer | Why |
|---|---|---|
| Duplicate file paths | Error unless every writer opts into `merge` | Silent last-writer-wins loses one entry's intent without anyone noticing |
| Malformed conditionals | Hard error at compose time | A brief with raw markers in it confuses the agent more than a refused `new` confuses the user |
| `prod` steps under sandbox | Kept, marked skipped | `verify --all` must be able to run the full definition |
| Interventions | Self-logged under `## Asked` | The CLI never sees the conversation (D2); this is the only interactive signal |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/core/compose/compose.ts` | Selection, ordering, files plan, merges |
| `packages/cli/src/core/compose/conditionals.ts` | Marker parsing and resolution |
| `packages/cli/src/core/compose/merge.ts` | JSON deep merge |
| `packages/cli/src/core/brief/render.ts`, `text.ts`, `words.ts` | The brief and the counter |
| `packages/cli/src/schemas/config.ts` | `Settings` gains `always`, `agents`, `author` (all optional) |
| `packages/cli/src/errors.ts` | `ComposeConflict` |
| `packages/cli/tests/fixtures/registry/` | Fragments that conflict, require each other, carry conditionals and merge a JSON file |
| `packages/cli/tests/compose.test.ts`, `brief.test.ts`, `conditionals.test.ts` | New |

## Acceptance tests

Composition tests use the fixture registry through a real `Registry.layer` on
`NodeServices`; no mocks.

1. Default composition of the fixture stack returns required, default and `always`
   fragments in the documented order.
2. `--without` a required fragment fails `ComposeConflict` with `reason: "required"`.
3. `--with` a fragment that requires another pulls both in, requirement first.
4. A conflicting pair fails with both ids in `details.ids`.
5. `--sandbox` drops a `deploy` fragment unless it is in `--with`.
6. Two fragments writing `.claude/settings.json`, both listing it in `merge`, produce one
   planned file whose merged content has both hook arrays, deduplicated.
7. The same two without `merge` fail `reason: "file_owner"`.
8. Conditionals: a `stack=` block, a `tag!=` block, a `with=` block and a `preset=` block
   each resolve correctly; nested and unclosed blocks fail with the right line.
9. A property test: `compose` is deterministic (same options, same `Composition`), and
   the order of `--with` ids does not change the set of fragments.
10. `renderBrief` for the fixture stack contains each section in order, the merged
    commands table, the verify command with the invocation string, and no marker lines.
11. The brief under `yes: false` asks once; under `yes: true` it says use defaults.
12. The untrusted section appears first when a project entry shadows a bundled one.
13. `countWords` on a known text with fences and markers returns the expected count.

## Exit criteria

- All tests pass; `bun run check` green from the repo root.
- `src/core/brief/text.ts` is the only place fixed brief wording lives.
- `AGENTS.md` architecture map lists `src/core/compose/` and `src/core/brief/`;
  `packages/cli/README.md` documents `--with`, `--without`, `--sandbox` and `always` once 1.2
  exposes them (note it in the 1.2 handoff if 1.2 lands later).

## What this plan may get wrong

- The ten-section brief is about 700 words of fixed text before any stack prose. If D5's
  cap is 5,000, fixed text is 14% of the budget; check whether it can be shorter before
  1.6 measures anything, and count it separately in 1.5 so authors aren't charged for it.
- Self-reported `## Asked` lines may undercount badly. If 1.6's gate runs show agents
  skipping it, the measure needs a different source (the bench in 2.0, or the agent's
  own transcript where the user shares it).
- Deep-merging arrays by concatenation is right for hook lists and wrong for ordered
  arrays such as `args`. If a merged file needs replace semantics, the `merge` field has
  to grow a mode, which is a format change before 1.6.
- Detecting `npx` for the invocation string depends on what 0.2's Node entry can see
  (`npm_execpath`, `npm_command` in env, read in `config.ts`). Verify before relying on it.
