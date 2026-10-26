# Phase 1.5: `validate` and the brief budget

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | `quickstacks validate [path]` checks a stack, a fragment, or a whole registry directory before anyone spends an agent run on it: schema, composition, conditional prose, the brief budget (D5) measured on a canonical render, and the verify layers (D7). The bundled registry passes with zero errors and zero warnings, including while it is still empty |
| Traces to | Open question "What is the brief budget? ... A per-stack cap on brief size, enforced by `validate`, would force the fragment split"; success row "The result is complete"; assumption 1 (agents follow a long brief), tested here only as a hypothesis: a cap keeps every bundled brief inside the size the gate runs (1.6b) are meant to prove |
| Depends on | 1.1 (composition, the brief renderer and `countWords`; `validate` composes and renders, it doesn't reimplement either), and through it 1.0 (entry schema, origins, the registry loader) |
| Blocks | [1.6a](phase-1.6a-bundled-stack-content.md) and [1.6d](phase-1.6d-guardrail-hook-fragments.md) (entries are written against it), [2.2](phase-2.2-deterministic-rot-checks.md) (adds the content and staleness checks to the same pipeline), [3.1a](phase-3.1a-show-and-preview.md) (`validate --brief`) |
| Decisions needed | D5 (numbers) and D7 (layers) agreed before this exits; the checks are built with the proposed numbers as constants and change in one place if the maintainers pick others. [Open question 7](../risks-and-open-questions.md#open-questions-for-the-maintainers) (does the budget count fixed text): built to count it, with `fixedWords` reported; if the answer is "authored text only", the limit applies to `words - fixedWords`, a one-line change in `budget.ts` |
| Settles | The canonical render context; which compositions are budgeted; how references resolve across origins; the severity of each check; the `ValidateReport` shape |

## Scope

In:

- `validate [path]`: a single entry directory, a registry root (has `stacks/` or
  `fragments/`), or, with no path, the bundled registry.
- Checks in four groups: schema and identity, composition, conditional prose, and
  content (budget, layers), listed below with their severity. These are the checks the
  MVP's three bundled stacks need to be safe to ship; everything else waits for 2.2.
- A human report and a `--json` report.
- A test that runs `validate` over `packages/cli/registry` through the real command tree
  and requires zero errors and zero warnings. It runs in `bun run test`, so it already
  runs in CI's coverage step with no workflow change. An explicit CI step for the
  bundled registry is [5.0](phase-5.0-ci-release-and-checks.md).

Out:

- `validate --brief <stack>` to print a composed brief (3.1a). Until then an author runs
  `new --no-launch` into a temp dir.
- Every check that guards against rot or authoring slips rather than a broken
  composition: `compose-each`, `conditional-dead-branch`, `undeclared-command`,
  `template-expression`, `setext-heading`, `version-sensitive-file`, `pinned-version`,
  shipped-file reference checks, import closure, the dated-phrase list and ledger notes
  ([2.2](phase-2.2-deterministic-rot-checks.md)).
- Anything that runs a command from an entry. `validate` reads files only (D2,
  [roadmap, Trust model](../roadmap.md#trust-model) point 1).

## Design

### CLI surface

```
quickstacks validate [path] [--json]
```

Exit 0 when there are no error findings (warnings and notes allowed). Exit 2 with
`ValidationFailed` when there is at least one error. A path that doesn't exist, or is
neither an entry directory, a registry root, nor the bundled registry, is `NotFound`
(exit 2).

`ValidationFailed` is a keeps-result tag (see roadmap, Contracts: Error tags, and the
keeps-result form in roadmap, Contracts: JSON contract): the full report stays on stdout
and the envelope is the last stderr line, with `details: { errors: number, warnings:
number }`. 1.5 adds its row to `errorTable` (see roadmap, Contracts: Error table) with
exit 2, not retryable, `keepsResult: true`.

The bundled registry (the path from roadmap, Other shared facts: Bundled registry in the
repo) is always a registry root, even when it holds only its `README.md`. It ships empty
until 1.6a, and an empty registry validates clean: zero entries, zero findings, no size
rows, exit 0. An explicit path to some other directory with neither `stacks/` nor
`fragments/` is `NotFound`.

### Interfaces

```ts
// src/core/validate/index.ts
export type Severity = "error" | "warning" | "note"; // see roadmap, Other shared facts: validate severities
export type Finding = {
  readonly check: CheckId;          // stable, kebab-case, e.g. "budget-composed"
  readonly severity: Severity;
  readonly entry: string;           // entry id, or "<registry>" for cross-entry checks
  readonly file?: string;           // relative to the validated root
  readonly line?: number;           // line in the source file, never in the brief
  readonly message: string;         // fixed template plus ids and numbers, no file content
};
export type SizeRow = {
  readonly kind: "body" | "composed" | "shipped";
  readonly subject: string;         // "go-cli", "go-cli (sandbox)", "go-cli (default) + api-client"
  readonly words: number;           // countWords
  readonly fixedWords?: number;     // composed rows only; see "Word counting"
  readonly limit?: number;          // absent on "shipped" rows
};
export type ValidateReport = {
  readonly root: string;
  readonly entries: { stacks: number; fragments: number };
  readonly findings: ReadonlyArray<Finding>;
  readonly sizes: ReadonlyArray<SizeRow>;
};

// Requirements: FileSystem, Path, and whatever 1.0's registry loader needs (Host, AppConfig)
export const validate: (root: string) => Effect.Effect<ValidateReport, NotFound, ValidateEnv>;
```

Each check is a function from the loaded view (below) to `Finding[]`. Checks live one per
module under `src/core/validate/` so 2.2 adds modules without touching existing ones. The
schema for `ValidateReport` lives in `src/schemas/validate.ts` and is what `--json`
encodes.

### What gets loaded, and what gets reported

Two separate sets:

- **Validated set**: the entries under the validated root, read with 1.0's directory
  reader. Only these get findings and size rows.
- **Resolution set**: the validated set, then every origin 1.0 loads for this invocation
  (project, user, bundled; see roadmap, Contracts: Entry and its listing), with the
  root's entries shadowing any same id. `requires`, `fragments.*`, `conflicts`,
  `appliesTo` and conditional `with=` ids resolve through this set, and composition
  uses it, so a user-directory stack that lists the bundled `agent-ops` fragment
  validates and is budgeted with that fragment's real text.

A reference that resolves only outside the root produces a `note` (`resolved-outside-root`)
naming the id and the origin it came from, so a result that depends on the machine says
so. One exception: when the root is the bundled registry, a reference outside it is an
error, because a bundled stack ships to users who have nobody else's user directory.

`validate` never needs the root to be one of 1.0's origins. It builds the resolution set
with `Registry.layer` and the validated root first in the ordered roots list (roadmap,
Contracts: Registry view), labeled with the origin it belongs to (`bundled` for the
bundled registry, `user` for any other directory); it does not add an `Origin` value.

### Word counting

`countWords` is the shared one (see roadmap, Contracts: Word count). 1.5 adds no counter
and no second rule. Two uses:

- **Body size**: `countWords` of the raw entry body. Marker lines are removed by the rule
  itself and every branch's content stays, so this is the worst case any project gets.
- **Composed size**: `countWords` of the whole brief as 1.1 renders it, fixed text
  included, rendered with the canonical context below.

`fixedWords` on a composed row is the `fixedWords` that 1.1's `renderBrief` returns for
that composition rendered with the canonical context: `countWords` summed over the
segments that come from `text.ts` (roadmap, Contracts: Word count). It is the CLI's own text
(headings, ground rules, versions, definition of done), so a CLI wording change that
pushes a stack over the budget shows up as a `fixedWords` change rather than an
unexplained jump. The human report prints it beside every composed size.

### The canonical render context

The brief depends on facts about the machine and the invocation (git state, missing
tools, how the CLI was started). Budgeting the brief a given machine would produce makes
`validate` pass on one laptop and fail on another, so every composed size is rendered with
one fixed context:

| Context field (1.1's brief context) | Canonical value | Why |
|---|---|---|
| Project name | `project` | One token, like most real names |
| Git state | `fresh` | `parent` adds a machine path |
| Written paths | The composition's planned paths, from `compose` | Deterministic from the entries |
| Missing tools | none | Depends on the machine |
| `yes` | `false` for `default`, `true` for `sandbox` | What `--sandbox` implies |
| CLI invocation (`Host.invocation`) | `npx -y quickstacks@<this CLI's version>` | The longest form an agent sees |
| Target agents | 1.1's default with no `Settings.agents` and `AppConfig.agent: "none"` | No user config |
| `Settings.always` | none | User config |
| Untrusted entries | none | The stop-and-confirm section is fixed text that only project-origin briefs get; it isn't the author's to cut |

If 1.1 adds a context field, the same change gives it a canonical value here. The context
is one exported constant, `CANONICAL_CONTEXT`, in `src/core/validate/budget.ts`.

### Budget (D5, proposed numbers)

The numbers are D5's proposal, in one constant, `BUDGET`, with a comment pointing to D5.

| Subject | Limit (words) | Why this number |
|---|---|---|
| Stack body | 2,000 | Leaves room for the default fragments inside the composed cap |
| Fragment body | 1,000 | A fragment is one known-good piece; past this it is a stack |
| Composed brief: stack + required + default fragments, in each of `default` and `sandbox` | 5,000 | D5's hypothesis: an agent still follows a brief this long to green. 1.6b's gate runs, one near 3,000 words and one near 5,000 (D13), are the first evidence |
| Composed brief with any one optional fragment added | 6,500 | Optional pieces are opt-in, so the user chose the extra length |

Over a limit is an error. Every composed size is reported even when under, so growth is
visible in review. Shipped Markdown under `files/` and `adapters/` is counted per entry
and reported as `shipped` rows with no limit, so moving prose into shipped docs to dodge
the cap stays visible.

### Verify layers (D7, proposed)

The `layer` vocabulary is the shared one (see roadmap, Other shared facts: Verify step
`layer`). For each stack composed with its required and default fragments, the steps must
include at least one each of `install`, `lint`, `typecheck` and `test`, and at least one
`serve` step with a probe when the stack's tags include `web` or `api`. A language without
a separate type checker (Go) marks its compile or vet step `typecheck`. Missing layer:
error naming the layer. A `serve` step without a probe is already a schema error in 1.0.

### Full check list

| Check id | Severity | What it catches |
|---|---|---|
| `schema` | error | Frontmatter fails the entry format v1 schema (see roadmap, Contracts: Entry format v1), excess keys included; message names the field path. An unreadable file or non-YAML frontmatter is this finding, with the parser's line |
| `id-matches-dir` | error | `id` differs from the directory name |
| `kind-matches-file` | error | `kind: stack` in a `FRAGMENT.md` or the reverse |
| `unknown-reference` | error | `fragments.*`, `requires`, `conflicts`, `appliesTo` (as an id) name an id in no origin of the resolution set, or outside the bundled registry when that is the root |
| `resolved-outside-root` | note | A reference resolved only through another origin; names the origin |
| `compose` | error | Composing a stack with required + default fragments fails (1.1's `ComposeConflict` or `EntryInvalid`); one finding per failing stack and preset, with the error's `details` reason |
| `stack-setup-section` | warning | A stack body has no `## Setup` heading. The brief's agent looks for one place that says how the project is created |
| `task-runner-tag` | warning | A stack's `tags` hold neither or both of `make` and `scripts` (1.0 asks for exactly one), so conditional prose keyed on them would pick nothing or both |
| `merge-path-missing` | error | A path listed in an entry's `merge` isn't one of that entry's own files (after the dotfile escape is undone) |
| `merge-json` | error | An entry's own copy of a `merge` file doesn't parse as JSON, checked per entry even when no budgeted composition includes it, and the merged output of every budgeted composition parses back to the same value it was built from. A `.tmpl` on a merge path is already 1.1's `merge_template` |
| `step-names` | error | Duplicate verify step names in a composition |
| `decision-default` | error | A `decisions` entry doesn't contain "(default" (every decision needs a default so `--sandbox` and `--yes` can proceed) |
| `conditional-syntax` | error | Unknown key, bad `mode` or `preset` value, nested or unclosed block; file and line |
| `conditional-ids` | error | `stack=` or `with=` names an id in no origin of the resolution set |
| `conditional-tag` | warning | `tag=` names a tag no stack in the resolution set declares |
| `budget-body`, `budget-composed` | error | Over the D5 limits |
| `verify-layers` | error | D7 layer missing |
| `fill-marker-owner` | error | A built-in `filled` check names a path no composed entry ships |
| `symlink` | error | Any symlink inside an entry directory |

The checks are registered one module each, so 2.2's checks join the same report and
the same zero-warning gate without touching these.

### Output

Human, grouped by entry, then sizes as a table, then a one-line total:

```
go-cli
  error   budget-composed  go-cli (sandbox): 5,212 words, limit 5,000
  warning stack-setup-section  STACK.md: no "## Setup" heading
sizes
  go-cli body              1,266 / 2,000
  go-cli (default)         3,290 / 5,000   fixed 702
  go-cli (sandbox)         5,212 / 5,000   fixed 731
...
3 stacks, 4 fragments: 1 error, 1 warning, 0 notes
```

`--json`: the encoded `ValidateReport`, one object.

### Failure modes

| Case | Error tag | Exit | What the agent sees |
|---|---|---|---|
| Any error finding | `ValidationFailed` | 2 | Full report on stdout, envelope with counts as the last stderr line |
| Path missing, or not an entry, a registry root or the bundled registry | `NotFound` | 2 | Envelope only |
| An entry file is unreadable, or its frontmatter isn't YAML | `schema` finding for that entry, not a crash | 2 | The rest of the registry still reports |
| Empty bundled registry | none | 0 | Zero entries, no findings |

`validate` never stops at the first bad entry: an author fixing a registry wants every
problem in one run.

### Decided here

| Question | Answer | Why |
|---|---|---|
| Machine-dependent brief text | Budget the canonical render, not the brief this machine would produce | Otherwise the same registry passes on one machine and fails on another |
| Which compositions are budgeted | Stack + required + default, in both presets, and each one optional fragment on top | These are the briefs `new` produces without the user naming several extras; every combination would be exponential |
| References to other origins | Resolve through all origins, report only the root's entries, note any outside resolution; bundled must be self-contained | An author's user stack may build on bundled fragments; the note keeps machine dependence visible |
| Fixed text in the budget | Counted, `fixedWords` shown (open question 7 default) | It measures what the agent reads, which is what assumption 1 is about |
| Suppression | Errors fail, warnings don't (except the bundled zero-warning gate), no suppression comment | A suppression syntax becomes the default fix |

## Files and areas touched

| Path (under `packages/cli/`) | Change |
|---|---|
| `src/commands/validate.ts` | Command and flags |
| `src/core/validate/*.ts` | One module per check group, `budget.ts` (`BUDGET`, `CANONICAL_CONTEXT`, `fixedWords`), and `index.ts` |
| `src/schemas/validate.ts` | `ValidateReport`, `Finding`, `SizeRow` |
| `src/errors.ts` | `ValidationFailed` and its `errorTable` row |
| `src/cli.ts` | Subcommand |
| `tests/validate.test.ts`, `tests/fixtures/registries/*` | Fixtures, one per check |
| `tests/bundled-registry.test.ts` | `validate` over `packages/cli/registry` through the real command tree: zero errors, zero warnings |
| repo `AGENTS.md`, package `README.md` | The command, its exit codes and the budget table |

## Acceptance tests

- One fixture registry per check, each producing exactly the expected finding (id,
  severity, entry, file, line). A clean fixture produces none.
- Budget: a fixture stack whose body is 2,001 words fails `budget-body`; a composition at
  exactly 5,000 passes and at 5,001 fails, in each preset separately (a `preset=sandbox`
  block can push only the sandbox brief over).
- Canonical context: the same fixture validated with a missing tool on PATH, inside a
  parent git repo, through a different `Host.invocation`, and with `Settings.always` and
  `Settings.agents` set gives byte-identical `sizes`.
- `fixedWords`: a fixture whose stack body grows by 50 words changes `words` by 50 and
  `fixedWords` by 0; a stack with an empty body and no fragments, steps, decisions or
  commands has `words` equal to `fixedWords`.
- Word count property test: inserting or removing conditional marker lines never changes
  a body's count; adding a word anywhere changes it by one.
- Resolution: a fixture user-directory stack listing a bundled fragment validates with a
  `resolved-outside-root` note and a composed size that includes the fragment; no
  finding names the bundled fragment. The same reference from inside the bundled root is
  `unknown-reference`.
- `verify-layers`: a `web`-tagged stack with no `serve` step fails; adding one with a
  probe passes; a `cli`-tagged stack without `serve` passes.
- One fixture each: `stack-setup-section` on a body with no `## Setup`;
  `task-runner-tag` on a stack tagged both `make` and `scripts`, and on one tagged
  neither; `merge-path-missing` for a `merge` entry naming a file the entry doesn't ship;
  `merge-json` on an optional fragment's broken JSON that no default composition
  includes.
- A registry with one broken entry still reports findings for the others.
- `--json` output decodes with `ValidateReport`; on errors, stdout holds the `ValidateReport`, the
  last stderr line is the `ValidationFailed` envelope with counts, and the exit is 2.
- The empty bundled registry (only `README.md`) exits 0 with zero entries; a different
  empty directory is `NotFound`.
- `tests/bundled-registry.test.ts` passes against today's `packages/cli/registry`, empty
  or not.

## Exit criteria

- `bun run check` green from the repo root, including `tests/bundled-registry.test.ts`.
- `AGENTS.md` lists `validate`, its exit codes and the budget; the D5 and D7 rows in
  [requirements.md](../requirements.md#proposed-decisions) note that the checks exist and
  which numbers are in `BUDGET`.
- Open question 7 is answered or still defaulted to "counted", and the file says which.

## What this plan may get wrong

- 5,000 words is a hypothesis with no measurement behind it yet. 1.6b's gate runs are the
  first measured pairs; if the near-cap stack goes green as fast as the small one, D5 can
  loosen, and if it hesitates, tighten before more stacks are written. The one-way door
  the problem statement warns about is stacks growing past the cap, not the cap moving.
- The canonical context hides real variance: a brief on a machine missing three tools, or
  inside a parent repo, is longer than the budgeted one. The difference is fixed CLI text
  of a few dozen words, which is why it was left out rather than added as worst case.
- Counting every conditional branch overstates bodies with many `stack=` blocks. That is
  intended pressure toward tags and fragments, but it may push authors into awkward
  splits; watch for it in 3.1b.
- Resolving through the user directory means an author's `validate` result can depend on
  what else is in their user directory. The `resolved-outside-root` note says when; the
  bundled registry is immune.
- Leaving `compose-each` and the staleness warnings to 2.2 means the MVP's bundled
  entries ship without them. With three stacks and a handful of fragments, a maintainer
  reading the composed briefs in the gate runs (1.6b) is the check until 2.2 lands.
