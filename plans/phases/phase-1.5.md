# Phase 1.5: `validate` and the brief budget

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | `quickstacks validate [path]` checks a stack, a fragment, or a whole registry directory before anyone spends an agent run on it: schema, composition, conditional prose, the brief budget (D5), the verify layers (D7), and the two cheapest staleness signals. The bundled registry passes with zero errors and zero warnings, and `bun run check` runs it |
| Traces to | Open question "What is the brief budget? ... A per-stack cap on brief size, enforced by `validate`, would force the fragment split"; success row "The result is complete: Every shipped stack's verify covers install, lint, typecheck, test, and a dev-server probe where there is a server"; evidence "the brief an agent gets is roughly 3,200 words for astro-blog ... 10,300 for react-router-ai"; the stack author: "nothing tells them when their prose has gone stale" |
| Depends on | 1.1 (composition and brief assembly; `validate` composes, it doesn't reimplement) and 1.0 (entry schema, origins) |
| Blocks | 1.6 (stack prose is written against it), 2.2 (adds checks to the same pipeline), 3.1 (authoring preview) |
| Decisions needed | D5 (numbers) and D7 (layers) agreed before this exits. The checks can be built with the proposed numbers as constants; the numbers change in one place if the maintainers pick others |
| Decisions or questions this settles | How words are counted; which compositions are budgeted; error versus warning for each check; the `layer` vocabulary D7 is checked against; the report shape |

## Scope

In:

- `validate [path]`: a single entry directory, a registry root (has `stacks/` or
  `fragments/`), or, with no path, the bundled registry.
- Checks in four groups: schema and identity, composition, conditional prose, and
  content (budget, layers, staleness signals). Listed below with their severity.
- A human report and a `--json` report.
- Running `validate` over `packages/cli/registry` inside the package's `check` script.

Out:

- `validate --brief <stack>` to print a composed brief (3.1, authoring). The MVP author
  is a maintainer who can run `new --no-launch` into a temp dir.
- Shipped-file reference checks, import closure, dated-phrase list, ledger notes (2.2).
- Anything that runs a command from an entry. `validate` reads files only (D2).

## Design

### CLI surface

```
quickstacks validate [path] [--json]
```

Exit 0 when there are no errors (warnings allowed). Exit 2 with `ValidationFailed`
when there is at least one error. A path that doesn't exist or isn't an entry or
registry is `NotFound` (exit 2).

`ValidationFailed` is a new tagged error that carries a report (the 0.3 "failure with a
result" form): the full report stays on stdout and the error envelope is the last stderr
line, with `details: { errors: number, warnings: number }`.

### Interfaces

```ts
// src/core/validate/index.ts
export type Severity = "error" | "warning";
export type Finding = {
  readonly check: CheckId;          // stable, kebab-case, e.g. "budget-composed"
  readonly severity: Severity;
  readonly entry: string;           // entry id, or "<registry>" for cross-entry checks
  readonly file?: string;           // relative to the validated root
  readonly line?: number;           // line in the source file, never in the brief
  readonly message: string;         // fixed template plus ids and numbers, no file content
};
export type SizeRow = {
  readonly subject: string;         // "go-cli" body, "go-cli (sandbox)" composed
  readonly words: number;
  readonly limit: number;
};
export type ValidateReport = {
  readonly root: string;
  readonly entries: { stacks: number; fragments: number };
  readonly findings: ReadonlyArray<Finding>;
  readonly sizes: ReadonlyArray<SizeRow>;
};

export const validate: (root: string) =>
  Effect.Effect<ValidateReport, NotFound, FileSystem.FileSystem | Path.Path>;
```

Each check is a function from the loaded registry (1.0's `Registry` read from `root`
only, no other origins) to `Finding[]`. Checks live one per module under
`src/core/validate/` so 2.2 adds modules without touching the existing ones. The
schema for `ValidateReport` lives in `src/schemas/validate.ts` and is what `--json`
encodes.

### Word counting

One function, `countWords(markdown)`, used by both `validate` and the `new` result's
`briefWords` (1.1): whitespace-separated tokens, code fences included, conditional
marker lines removed. For an entry body every conditional branch counts (the worst case
any project can get). For a composed brief, the brief as 1.1 renders it, with its fixed
CLI text included, because that is what the agent reads.

### Budget (D5, proposed numbers)

These are D5's proposal, not settled. They sit in one constant, `BUDGET`, with a comment
pointing to D5.

| Subject | Limit (words) | Why this number |
|---|---|---|
| Stack body | 2,000 | Leaves room for three default fragments inside the composed cap |
| Fragment body | 1,000 | A fragment is one known-good piece; past this it is a stack |
| Composed brief: stack + required + default fragments, in each of `default` and `sandbox` presets | 5,000 | Composed briefs near 4,500 words have reached green in about ten minutes; the problem statement's first stacks needed 3,200 to 3,900 |
| Composed brief with any one optional fragment added | 6,500 | Optional pieces are opt-in, so the user chose the extra length |

Over a limit is an error. Every composed size is reported even when under, so growth is
visible in review. Shipped Markdown under `files/` and `adapters/` is counted per entry
and printed with no limit, so moving prose into shipped docs to dodge the cap stays
visible.

### Verify layers (D7, proposed)

1.0's step schema has an optional `layer` field: `install`, `lint`, `typecheck`, `test`,
`build`, `serve`, `docs`. For each stack composed with its required and default
fragments, the steps must include at least one each of `install`, `lint`, `typecheck`
and `test`, and at least one `serve` step (with a probe) when the stack's tags include
`web` or `api`. A language without a separate type checker (Go) marks its compile or vet
step `typecheck`. Missing layer: error naming the layer. A `serve` step without a probe
is already a schema error in 1.0.

### Full check list

| Check id | Severity | What it catches |
|---|---|---|
| `schema` | error | Frontmatter fails the 1.0 schema (excess keys included); message names the field path |
| `id-matches-dir` | error | `id` differs from the directory name |
| `kind-matches-file` | error | `kind: stack` in a `FRAGMENT.md` or the reverse |
| `unknown-reference` | error | `fragments.*`, `requires`, `conflicts`, `applies_to` (as an id) name an entry that isn't in the root |
| `compose` | error | Composing each stack with required + default fragments fails (conflict, missing requirement, two owners of a path without `merge`); one finding per failing stack, with 1.1's composition error details |
| `step-names` | error | Duplicate verify step names in a composition |
| `decision-default` | error | A `decisions` entry doesn't contain "(default" (every decision needs a default so `--sandbox` and `--yes` can proceed) |
| `conditional-syntax` | error | Unknown key, bad `mode` or `preset` value, nested or unclosed block; file and line |
| `conditional-ids` | error | `stack=` or `with=` names an unknown id |
| `conditional-tag` | warning | `tag=` names a tag no stack in the root declares |
| `budget-body`, `budget-composed` | error | Over the D5 limits |
| `verify-layers` | error | D7 layer missing |
| `fill-marker-owner` | error | A built-in `filled` check names a path no composed entry ships |
| `version-sensitive-file` | warning | A file under `files/` or `adapters/` whose name is on the version-sensitive list: `tsconfig.json`, `vitest.config.*`, `vite.config.*`, `biome.json`, `.eslintrc*`, `eslint.config.*`, `pyproject.toml`, `.golangci.yml`, `go.mod`, `package.json`, `Dockerfile`, `.github/workflows/*`, `astro.config.*` |
| `pinned-version` | warning | An exact semver (`\d+\.\d+\.\d+` not touching another dot or digit) in an entry body, in `decisions`, or in shipped Markdown, outside code fences |
| `symlink` | error | Any symlink inside an entry directory |

The version-sensitive filename list is a warning, not an error, because a stack can
legitimately ship one of these as a skeleton the agent rewrites; the warning makes the
author say so in review. `pinned-version` is a warning for the same reason, and 2.2
adds the wider dated-phrase list. Neither has an escape syntax: the fix is rewording.

### Output

Human, grouped by entry, then sizes as a table, then a one-line total:

```
go-cli
  error   budget-composed  go-cli (sandbox): 5,212 words, limit 5,000
  warning pinned-version   STACK.md:41: "1.27.2"
sizes
  go-cli body              1,266 / 2,000
  go-cli (default)         3,890 / 5,000
...
3 stacks, 3 fragments: 1 error, 1 warning
```

`--json`: the encoded `ValidateReport`, one object.

### Failure modes

| Case | Error tag | Exit | What the agent sees |
|---|---|---|---|
| Any error finding | `ValidationFailed` | 2 | Full report on stdout, envelope with counts on stderr |
| Path missing or not an entry/registry | `NotFound` | 2 | Envelope only |
| An entry file is unreadable | finding `schema` for that entry, not a crash | 2 | The rest of the registry still reports |
| Frontmatter is not YAML | finding `schema` with the parser's line | 2 | Same |

`validate` never stops at the first bad entry: an author fixing a registry wants every
problem in one run.

### Decisions settled here

- Budgets count the rendered brief, CLI text included. Reason: it measures what the
  agent reads, which is what assumption 1 is about.
- Budgeted compositions are stack + required + default, in both presets, and each one
  optional fragment on top. Reason: these are the briefs `new` produces without the user
  naming several extras; every combination would be exponential.
- Errors fail the run, warnings don't, and there is no suppression comment. Reason: a
  suppression syntax becomes the default fix.

## Files and areas touched

| Path (under `packages/cli/`) | Change |
|---|---|
| `src/commands/validate.ts` | command, flags |
| `src/core/validate/*.ts` | one module per check group, plus `index.ts` |
| `src/core/words.ts` | `countWords`, shared with 1.1's brief result |
| `src/schemas/validate.ts` | `ValidateReport`, `Finding` |
| `src/errors.ts` | `ValidationFailed` in the exit and retryable table (exit 2, not retryable) |
| `src/cli.ts` | subcommand |
| `package.json` | `check` gains `bun run dev validate registry` (or the built CLI) after lint |
| `tests/validate.test.ts`, `tests/fixtures/registries/*` | fixtures, one per check |
| repo `AGENTS.md`, package `README.md` | the command and the budget table |

## Acceptance tests

- One fixture registry per check, each producing exactly the expected finding (id,
  severity, entry, file, line). A clean fixture produces none.
- Budget: a fixture stack whose body is 2,001 words fails `budget-body`; a composition
  at exactly 5,000 passes and at 5,001 fails, in each preset separately (a
  `preset=sandbox` block can push only the sandbox brief over).
- Word count property test: inserting or removing conditional marker lines never
  changes a body's count; adding a word anywhere changes it by one.
- `verify-layers`: a `web`-tagged stack with no `serve` step fails; adding one with a
  probe passes; a `cli`-tagged stack without `serve` passes.
- `pinned-version` hits `1.27.2` and misses `127.0.0.1`, `0.0.0.0` and text inside a
  code fence.
- A registry with one broken entry still reports findings for the others.
- `--json` output decodes with `ValidateReport`; on errors, stdout holds the report and
  the last stderr line is the envelope with `ValidationFailed`.
- `validate` on `packages/cli/registry` returns zero errors and zero warnings (asserted in a
  test once 1.6 has content; until then on the fixture registry).

## Exit criteria

- `bun run check` green from the repo root, including the new validate step over the
  bundled registry.
- `AGENTS.md` lists `validate`, its exit codes and the budget; the D5 and D7 rows in
  00-requirements note that the checks exist and which numbers are in `BUDGET`.

## What this plan may get wrong

- 5,000 words is a guess bounded by two data points. 1.6's gate runs are the first test;
  if the near-cap stack goes green as fast as the small one, D5 can loosen, and if it
  hesitates, tighten before more stacks are written. The one-way door the problem
  statement warns about is stacks growing past the cap, not the cap moving.
- Counting every conditional branch overstates bodies with many `stack=` blocks. That
  is intended pressure toward tags and fragments, but it may push authors into awkward
  splits; watch for it in 3.1.
- The version-sensitive filename list is incomplete by nature. It grows only when a run
  finds a shipped file that broke on a new release.
