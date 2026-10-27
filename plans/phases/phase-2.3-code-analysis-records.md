# Phase 2.3: Code-analysis records

Status: DRAFT 2026-10-26 (not agreed; revised the same day after review)

| Field | Value |
|---|---|
| Goal | Every run records what it produced, not only whether it passed: measured facts about the project — layout, language mix, test ratio, size, markers — plus whatever the local analyzers found, attached to that run's `LedgerRecord` as `analysis` |
| Traces to | Success row 4, "The result is consistent: sandbox runs of the same stack agree on layout, language mix and test ratio" ([PROBLEM_STATEMENT](../../product/PROBLEM_STATEMENT.md#what-success-looks-like)). D29 records the decision that the record hangs off the run ledger |
| Acceptance tests | [2.3#1] to [2.3#18], then the "Realistic edge cases" subsection. Every one ends in a claim about the artifact or about the record's honesty, and none asserts on log formatting. Traced to: success row 4, and to the three trust rules below |
| Depends on | [0.3a](phase-0.3a-errors-and-output.md) (`Output`, `errorTable`), [0.3b](phase-0.3b-processes-and-signals.md) (`Processes.exec`, `AppConfig.childEnv`), [2.0c](phase-2.0c-run-ledger.md) (`LedgerRecord`, which gains the `analysis` field), Effect's `FileSystem` and `Path`. Soft: reads `.quickstacks/manifest.json` when [1.2b](phase-1.2b-manifest-state-and-detection.md) writes it, and only to attribute a record |
| Blocks | Nothing hard. [2.0b](phase-2.0b-bench.md) compares consecutive `analysis` values, [5.1](phase-5.1-scheduled-canary.md) compares across months, [4.2a](phase-4.2a-stats-rollup-and-routes.md) rolls them up, [4.3](phase-4.3-mcp-server.md) serves them |
| Decisions needed | Which analyzers ship in the first cut (question 1); whether tools are assumed present or provisioned (question 2) |
| Settles | The record shape and its `analysis` field; the analyzer adapter contract; the attribution key; how findings reach the ledger; what a partial record means |

## Why this exists, and why it is not already in the plan

Walked every sub-phase on 2026-10-26. All of them read or write registry content, or
record whether commands passed:

| Sub-phase | What it does | Why this is different |
|---|---|---|
| [1.3a](phase-1.3a-verify-runner-and-probes.md) `verify` | Runs the manifest's lint, typecheck, test and build steps | Answers pass or fail on the project's own commands. No measurement, no cross-language tooling, nothing kept |
| [2.0c](phase-2.0c-run-ledger.md) run records | One record per verify run: outcome, timing, step status | Describes the run. It has nowhere to say what the run produced — this sub-phase gives it that |
| [2.2](phase-2.2-deterministic-rot-checks.md) rot checks | Shipped files against the composition: commands, hook wiring, ports, import closure | Author-time checks of registry content, inside `validate`. Never sees a built project |
| [4.2a](phase-4.2a-stats-rollup-and-routes.md) stats | Green rate, time to green, entry points | Aggregates usage events, not code properties |

The plan measures the recipe (budget, layers, composition) and the run (verify, ledger,
canary). Nobody measures the artifact. This sub-phase adds that measurement to the record
the ledger already keeps, so a stack's history stays one file and one lookup.

## Scope

In:

- `packages/cli/src/core/analyze/` — the analysis itself: a tree walk with metrics and a
  digest, the adapter table, the tool runner, and the assembly of the record.
- `packages/cli/src/schemas/analyze.ts` — `AnalysisSummary` and the SARIF log types, as
  Effect schemas, so the ledger can hold the summary and the CLI can encode the log.
- `packages/cli/scripts/analyze.ts` — a development script, the way `scripts/dev.ts` and
  2.0b's `scripts/bench.ts` are, so the module can be run and reviewed before `verify`
  calls it.
- Tests and fixtures under `packages/cli/tests/analyze/`.
- The `analysis` field on 2.0c's `LedgerRecord`, and the sentence in 2.0b, 5.1 and 4.2a
  that says how each reads it.

Out:

- A package of its own, a workspace entry, a root `package.json`, `bun.lock` or CI change.
  Built in the CLI core, the feature needs none of them (D11, D23).
- A `quickstacks analyze` subcommand. Phase 1 owns `src/cli.ts` and the command surface;
  this lands as a core module plus a dev script, and the subcommand is a later, small
  change once the command surface is quiet.
- A database, an ORM, migrations, a server, an ingest endpoint. The ledger file is the
  store; the SARIF log is the artefact.
- The MCP server (4.3), stats rollups (4.2a) and any scoring weights. Those read this
  shape; they do not live here.
- Running anything a stack entry names (D2 stands). The analyzer runs a fixed, known set
  of analyzers against a directory the caller names.

## Design

### The record hangs off the run, not beside it

The first draft called this "stack metadata" and gave it its own file. Review settled it
the other way: a run already has a record ([2.0c](phase-2.0c-run-ledger.md)'s `LedgerRecord`),
and "what this run produced" is a field of that record, not a parallel history. So
`LedgerRecord.analysis` is an optional `AnalysisSummary`, and the readers are the ones the
plan already named: the bench compares it run to run, the canary month to month, the stats
rollup groups by stack and preset.

Two artefacts, each doing one job:

| Artefact | Holds | Read by |
|---|---|---|
| `LedgerRecord.analysis` | The summary: digest, size, layout, language mix, test ratio, markers, findings counts, which tools did not run, and a path to the log | Ledger readers, bench, canary, stats |
| The SARIF log, at `analysis.sarif` | Every finding, in the tool's own vocabulary, with the tool's own rule metadata | Anything that scores or explains a finding |

The path is relative to the ledger file, so a ledger and its logs move together.

### SARIF is the finding format, not the record

SARIF 2.1.0 is an OASIS standard (a JSON schema), not a library. It is what semgrep,
trivy, gitleaks, osv-scanner, CodeQL, ESLint's SARIF formatter, ruff and clippy-sarif
already emit, so the module writes one log shape and every consumer reads one shape. What
this plan relies on, and nothing more:

| SARIF element | Used for |
|---|---|
| `runs[]` | One run per contributing tool, plus the envelope run at index 0 |
| `run.tool.driver` | Which tool, which version |
| `run.results[]` | The findings: `ruleId`, `level`, `message.text`, `locations`, `partialFingerprints` |
| `run.artifacts[]` | Left empty in v1. Large trees would otherwise carry every path twice; an ingest that wants per-file rows asks for `--artifacts` later |
| `run.properties` | The envelope's `quickstacks` block (SARIF allows an arbitrary property bag here) |

Findings are not judged here. A `note` from a linter and an `error` from a security
scanner are both findings; what they are worth is the scoring layer's problem, and that
layer runs over stored records so changing a weight never rewrites history.

### Record shape

`AnalysisSummary`, in `src/schemas/analyze.ts`:

```jsonc
{
  "schemaVersion": 1,
  "runId": "01JB…",                 // unique per invocation, not derived from content
  "createdAt": "2026-10-26T18:04:11Z",
  "digest": "sha256:…",             // sorted (relative path, content) list
  "target": { "files": 214, "bytes": 918273, "skippedSymlinks": 0,
              "excluded": ["node_modules", "dist", ".git"] },
  "layout": { "topLevel": ["src", "tests", "package.json"], "maxDepth": 4 },
  "metrics": {
    "lines": 8123, "codeLines": 6904, "blankLines": 431, "testRatio": 0.19,
    "byLanguage": { "typescript": 61, "python": 22, "go": 17 },
    "markers": { "TODO": 4, "FIXME": 1 },
    "manifests": ["package.json"]
  },
  "attribution": { "kind": "sandbox", "stack": "astro-blog", "with": [],
                   "preset": "default", "agent": "claude", "fingerprint": "sha256:…" },
  "toolsNotRun": [ { "id": "semgrep", "status": "absent" },
                   { "id": "eslint", "status": "skipped", "reason": "not-selected" },
                   { "id": "trivy", "status": "failed", "reason": "exit-code:2" } ],
  "findings": { "total": 7, "byLevel": { "error": 1, "warning": 4, "note": 2 } },
  "sarif": "analysis/2026-10-26-01JB.sarif"
}
```

`layout` is what makes "the same stack produces the same shape" checkable: the sorted
top-level entries and the tree's depth, capped at 40 entries.

`toolsNotRun` holds only the tools that produced no log. A tool that ran is described by
its own SARIF run — name, version, findings — and listing it again would duplicate the
standard and drift from it. Sorted by adapter order, so two runs over the same input
produce the same order.

### No tiers

The first draft numbered three tiers: 0 measurements, 1 analyzer binaries, 2 an adopted
log. Review dropped the ladder, and it was right to: it implied three deliverables where
there is one record, and it made the analyzer table look optional in a way it is not.

There is one record with two kinds of content:

- **Measurements**, computed in TypeScript, always. No binary required, so a record is
  produced on a bare machine and in CI.
- **Findings**, from an analyzer that resolves on `PATH`, or from a log the caller passes
  with `--sarif <file>`. Neither is required. A tool that is absent, excluded, broken or
  too slow is recorded in `toolsNotRun` and the record still lands.

### Where the analyzer runs

`verify` ([1.3a](phase-1.3a-verify-runner-and-probes.md)) is the natural caller: it is the
moment a project is known to be built and known to pass, which is exactly when measuring
it means something. When 1.3a lands, its run produces the summary and hands it to 2.0c's
ledger write; this sub-phase supplies the module and the dev script, and does not touch
`verify`. Until then the callers are the bench script (2.0b) and `scripts/analyze.ts`.

### Adapter contract

```ts
// src/core/analyze/tools.ts — a value, not a file loaded from disk
type ToolAdapter = {
  readonly id: string;                        // "semgrep", "ruff"
  readonly languages: readonly string[];     // empty means any
  readonly binary: string;                    // argv[0]; resolved by the spawn, never by a shell
  readonly versionArgv: readonly string[];    // its version probe
  readonly sarifArgv: readonly string[];      // `{target}` is substituted
  readonly timeoutMs: number;
  readonly note?: string;                     // the read-only conclusion, or why unverified
  readonly verified: boolean;                 // flags confirmed against an installed binary
};
```

An adapter is data plus two argv arrays. Adding an analyzer is one table entry and one
fake-binary test. The table lives in TypeScript rather than a JSON file: the JSON version
resolved its path relative to `src/`, where the file did not live, and every unit test
missed it because they injected the path — a `const` cannot have that defect.

Spawn through `Processes.exec` with an `ArgvSpec`. Absence is decided by the spawn
failing, not by a preceding `which`. The child environment comes from
`AppConfig.childEnv`; nothing is inherited implicitly and no value is ever written to the
record.

The first cut is proposed as semgrep (multi-language), ruff (Python), ESLint with its
SARIF formatter (JS/TS), golangci-lint (Go), trivy (dependencies and images) and gitleaks
(secrets). Each entry's invocation is verified against the installed binary when the entry
is written, and a test asserts the argv shape, not a remembered flag.

### Three rules the code must keep

Each was found by running the thing rather than reading it, and each has a test:

1. **Analysis never writes into the target.** `ruff` creates `.ruff_cache/` inside whatever
   it scans, which changed file counts and made the digest depend on what had previously
   run in the directory. `ruff` gets `--no-cache`; generated directories are excluded from
   the digest through one documented list; a regression test hashes every file before and
   after a run and requires an identical tree.
2. **A found violation is not a failed run.** Linters exit non-zero because they found
   something — `ruff check --output-format sarif` exits 1 and still emits complete valid
   SARIF. Success is "emitted valid SARIF", not "exited 0", and the findings are kept
   whatever the exit code was.
3. **Absence is recorded, not treated as failure.** `absent` (not installed) and `skipped`
   (excluded with `--tool`, reason `not-selected`) are distinct, so a record distinguishes
   a machine that lacks a tool from a run that chose not to use it. Nothing is installed
   or downloaded.

The digest's ignore policy is why `EXCLUDED_NAMES` is not delegated to `.gitignore`: the
target may not be a git repository at all (a freshly built project, a temp directory, an
unpacked tarball), nested repositories carry their own rules, and the digest has to be
identical on any machine. Honouring a target's own `.gitignore` when one exists is a
possible later feature, not a silent fallback.

### Metrics without a tool

- `files`, `bytes`, `lines`, `codeLines`, `blankLines`: line counts with a per-language
  comment heuristic, documented as an approximation, not true SLOC.
- `byLanguage`: share of lines per language, by extension.
- `testRatio`: test files over source files, by the language's own naming convention.
- `markers`: TODO, FIXME, HACK, XXX counts.
- `manifests`: which dependency manifests exist — the ecosystem signal a scoring layer needs.
- `layout`: sorted top-level entries and maximum depth.

### Attribution

Read `.quickstacks/manifest.json` when it exists. Every field is optional and unknown
fields are ignored; a manifest that does not parse is a warning, not a failure, and the
record still lands with `kind: "label"` or `kind: "none"`. 1.2b owns that file's schema, so
this reader decodes the three fields it needs and nothing else.

Attribution uses 2.0c's ledger key exactly — stack, `with`, preset, agent, fingerprint — so
no ingest needs a mapping table. Two identities, and the difference is the point:

| Field | Identifies | Computed from |
|---|---|---|
| `fingerprint` | What we asked for: the composition | 2.0a's composition hash; absent until 1.2b writes a manifest |
| `digest` | What we got: the artifact | sha256 over the sorted (relative path, content) list, excluding ignored roots |

A stack's history is `fingerprint → digest → analysis`. A digest with no fingerprint is
still a valid record: analysis of a repo `add` touched, or of this repo itself.

### Invocation and safety

- `analyze()` returns an Effect and never sets `process.exitCode`, writes to the terminal,
  or decides the process outcome. `scripts/analyze.ts` maps its result to an exit code.
- The analyzed directory is passed explicitly; the log is never written inside it unless
  the caller names a path there.
- No environment variable value reaches the record, for the same reason `logging.ts` does
  not log argument values.
- Per-tool stdout is capped; a capped log is marked `truncated` in its reason and the tool
  still counts as run.
- Teardown always runs: a tool that times out is killed by process group, recorded
  `timeout`, and the record still lands.

### Exit contract

As a core module, errors are the CLI's errors and go through `errorTable`; the script adds
nothing of its own:

| Situation | Error | Exit |
|---|---|---|
| A record was written, with or without findings and with or without tools | none | 0 |
| Bad path, unknown flag, unreadable output location | `BadInput` / `Usage` / `PermissionDenied` | 2 |
| Defect (bug) | `Defect` | 1 |

Findings never fail anything. A `--fail-on level` flag is the way to gate CI on them, and
it is out of scope: the first consumer of this data is a database, not a build.

### Failure modes

| Case | Handling |
|---|---|
| No analyzer installed | `toolsNotRun[].status: "absent"`; the record still lands |
| A tool excluded with `--tool` | `toolsNotRun[].status: "skipped"`, reason `not-selected` |
| A tool exits non-zero with valid SARIF 2.1.0 | Counted as run; findings kept; the tool is not in `toolsNotRun` |
| A tool exits non-zero with no stdout | `toolsNotRun[].status: "failed"`, reason `exit-code:N` |
| A tool emits invalid SARIF | `toolsNotRun[].status: "failed"`, reason `invalid-sarif`; other runs kept |
| A tool emits SARIF 2.0.0 or another version | Rejected, reason names the version; never silently upgraded |
| Binary present but not executable | `toolsNotRun[].status: "failed"`, reason `not-executable` |
| Target directory is empty | Valid record, zero files |
| Output path unwritable | `PermissionDenied`, exit 2, no partial file left behind (write to temp, rename) |
| Manifest present but malformed | `Output.note` warning, `kind: "none"`, record still lands |

## Decisions settled here

| Decision | Why |
|---|---|
| The record is a field on `LedgerRecord`, not its own file | One place to look per stack; the run is the unit that has history (D29) |
| It lives in the CLI core, not in a package | It reuses `Processes`, `childEnv`, `errorTable` and `Output`; a package would reimplement all four, and its excuse for standing apart — staying out of the root catalog — did not hold, because it edited `package.json` and `bun.lock` anyway |
| Measurements always run; findings are optional | A record with no analyzer installed is still useful, so the feature works on a bare machine |
| Findings live in a SARIF log, counts in the summary | A ledger of 200 runs must stay readable; the log keeps the tool's own vocabulary for anything that scores it |
| Findings never fail the run | This is a data producer, not a gate. `verify` is the gate |
| No score is stored | Weights will change; recomputing from stored records costs nothing and keeps history honest |
| Absolute base in `originalUriBaseIds`, relative artifact URIs | Records from different machines must aggregate in one database |
| Two trust rules are test-enforced | They were each broken once by a plausible-looking implementation |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/schemas/analyze.ts` | `AnalysisSummary` and the SARIF log types, as Effect schemas |
| `packages/cli/src/core/analyze/index.ts` | `analyze()`, the orchestration |
| `packages/cli/src/core/analyze/inventory.ts` | Tree walk, layout, metrics, digest |
| `packages/cli/src/core/analyze/tools.ts` | The adapter table and `runTool`, through `Processes.exec` |
| `packages/cli/src/core/analyze/record.ts` | Attribution, envelope assembly, SARIF encoding |
| `packages/cli/scripts/analyze.ts` | Dev script: run it over any directory, print or write the log |
| `packages/cli/tests/analyze/` | Unit tests and the read-only regression |
| `packages/cli/tests/fixtures/analyze/` | Polyglot fixture tree, one `fake-tool.mjs` with `--mode=` |
| `packages/cli/e2e/` | One smoke test over the script |
| `plans/phases/phase-2.3-code-analysis-records.md` | This file |
| `plans/phases/phase-2.0c-run-ledger.md` | `analysis` on `LedgerRecord`, and what a reader may assume about it |
| `plans/phases/phase-2.0b-bench.md`, `phase-5.1-scheduled-canary.md`, `phase-4.2a-stats-rollup-and-routes.md` | One line each naming the comparison or rollup they do |
| `plans/requirements.md` | D29 (proposed), and the success-measure table row |
| `product/PROBLEM_STATEMENT.md` | Success row 4, "The result is consistent" |
| `plans/roadmap.md` | The 2.3 row, the graph edge to 2.0c, the contract line |
| `AGENTS.md` | Architecture map and the script's command |
| `.gitignore` | `*.bun-build`, the build temp files the CLI test suite regenerates |

No change to root `package.json`, `bun.lock`, `.github/workflows/ci.yml`, `biome.json` or
`tsconfig.base.json` — the module is inside the existing package and adds no dependency.

## Acceptance tests

Traced to: success row 4 ("The result is consistent") and D29. Each test ends in a claim
about the artifact or about the record's honesty; none asserts on log formatting, wording
or file layout.

- [2.3#1] Measurements over the polyglot fixture: file count, bytes, language mix, line and
  marker counts match hand-computed values.
- [2.3#2] `layout.topLevel` lists the fixture's top-level entries sorted, and `maxDepth`
  matches the deepest path.
- [2.3#3] Determinism: the same tree twice produces identical summary output once `runId`,
  `createdAt` and timings are removed.
- [2.3#4] Digest: changes on a byte edit, an added file and a rename; unchanged by a
  `touch`, by directory-entry reordering, and by the presence of an ignored root
  (`node_modules/`, `dist/`, `.git/`).
- [2.3#5] A symlink is skipped, never followed, and counted in `skippedSymlinks` — content
  outside the target must not enter the record.
- [2.3#6] A run leaves the target byte-identical: every file hashed before and after.
- [2.3#7] A fake analyzer that emits valid SARIF is counted as run and does not appear in
  `toolsNotRun`; its findings are in the log and counted in `findings`.
- [2.3#8] A fake analyzer that exits 1 while emitting valid SARIF is counted as run with
  its findings kept — the rule that a found violation is not a failure.
- [2.3#9] A fake analyzer that exits 2 with no stdout lands in `toolsNotRun` as `failed`
  with reason `exit-code:2`, and the record still lands.
- [2.3#10] A fake analyzer that emits malformed JSON lands as `failed` with reason
  `invalid-sarif`, and any other tool's run survives.
- [2.3#11] A log declaring SARIF 2.0.0 is rejected with the version named, never upgraded.
- [2.3#12] A missing binary is `absent`; a tool the caller excluded with `--tool` is
  `skipped` with reason `not-selected`.
- [2.3#13] A tool that outlives its timeout is `timeout`, is killed by process group, and
  the record still lands.
- [2.3#14] `--sarif <file>` adopts an external log and its findings reach the same
  summary counts.
- [2.3#15] Attribution: with a manifest, stack, fragments, preset and fingerprint are
  carried; without one, `kind: "none"` and the record is still valid; with a malformed
  one, a note is written and the record still lands.
- [2.3#16] The summary decodes against `AnalysisSummary` and, once 2.0c exists, against
  `LedgerRecord` with `analysis` present; the log decodes against the SARIF subset, with
  every artifact URI relative and POSIX-separated.
- [2.3#17] No planted environment variable's value appears anywhere in the encoded output.
- [2.3#18] The summary attaches to a `LedgerRecord` unchanged, and a record without
  `analysis` still decodes — old ledgers are not invalidated.

### Realistic edge cases

Not hypotheticals: each is a directory or a machine the maintainer met while building this.

| Case | Expected | Covered by |
|---|---|---|
| The target is this repo, including `node_modules/` and `dist/` | Ignored roots excluded from digest and metrics; the run finishes in seconds, not minutes | [2.3#4] |
| A file with no extension, and a `.min.js` | Counted as unknown or as JavaScript; never crash, never silently dropped from `files` | [2.3#1] |
| A binary file, and a UTF-8 file with CRLF endings | Counted by bytes; no decode failure; line count either correct or documented as approximate | [2.3#1] |
| A directory the process cannot read | `PermissionDenied` naming the path; no half-written record | [2.3#6], exit table |
| An empty directory, and a directory containing only ignored roots | Valid record with zero measured files | failure table |
| A symlink loop, and a symlink pointing outside the tree | Skipped, counted, never followed | [2.3#5] |
| A target that is a git worktree with submodules | Submodule directories treated as ignored roots, not descended into | [2.3#4] |
| An analyzer that writes a cache into the target | Not shipped as an adapter without a disabling flag; caught by [2.3#6] | [2.3#6] |
| An analyzer that prints 40 MB of SARIF | Log capped, tool still counted as run, reason records the truncation | [2.3#7] |
| An analyzer that hangs on a large tree | `timeout`, killed by group, record lands | [2.3#13] |
| The same tree measured on Linux and on macOS | Identical digest and identical summary apart from timestamps — POSIX separators, sorted entries | [2.3#3], [2.3#16] |

## Exit criteria

- `bun run check` green from the repo root; the module is inside the existing package, so
  the fan-out is unchanged.
- `bun packages/cli/scripts/analyze.ts <dir>` produces a valid record for this repo, for a
  TypeScript tree, for a Python tree and for a Go tree, with no flags.
- `LedgerRecord` decodes with and without `analysis`.
- `AGENTS.md` names the module and the script; the plan's three rules are each backed by a
  test that fails if the rule is broken.

## What this plan may get wrong

- **`layout` may be too coarse to prove consistency.** Top-level names and depth catch a
  stack that starts emitting `src/` where it used to emit `app/`; they won't catch a
  reorganisation inside `src/`. Per-file rows would, at the cost of a much bigger summary.
- **Tool flags drift.** Every adapter's invocation is verified when written, but an
  upstream rename breaks it silently as `failed`. The version probe is what makes that
  visible later.
- **Line counting is not SLOC.** The comment heuristic will over- or under-count unusual
  syntax. It is labelled an approximation.
- **`testRatio` by filename is a convention, not a fact.** A project with tests in an
  unusual place scores zero. It is a signal, not a verdict.
- **A summary can be smaller than the thing it describes** on a tiny target, where the
  measurement costs more than the code. The cap on `layout` and the empty `artifacts[]` are
  the answer.
- **Whether `verify` is the right caller is still a guess.** If measuring on every verify
  turns out to be too slow on a large repo, the answer is a flag on verify, not a separate
  command.

## Open questions for the maintainers

1. **Which analyzers ship in the first cut.** Proposed: the six in the adapter table, every
   one optional at runtime. The alternative is measurements plus `--sarif` only, which is
   smaller and defers every flag to the first caller who needs one.
2. **Are tools assumed present, or provisioned?** Proposed: assumed present, never
   installed by the CLI — it records `absent` and moves on. Provisioning (a container
   image, a `tool:install` script) is a separate decision with a supply-chain cost, and
   D2's spirit argues against a tool that downloads binaries.
3. **Does a log ever belong inside the analysed project?** Proposed: no — the caller names
   a path, and the ledger's own directory is the default. Writing into the target would
   touch 1.2b's `.quickstacks/` contract.
