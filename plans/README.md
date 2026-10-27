# stacks plan

Status: DRAFT 2026-10-26. Planning; the CLI base is in place with no product code. The
plan is written to the demo-first proposal (D23).
**Start with [HANDOFF.md](HANDOFF.md)**, then [requirements.md](requirements.md) and
[roadmap.md](roadmap.md).

## Product to preserve

stacks gives a developer who starts projects with a coding agent a consistent,
current, fully tested setup. A stack is a short, version-less description of what a
project is made of, how it is laid out, what the tools must enforce, and what "working"
means as a list of commands that must pass. The CLI writes a few files and a brief,
then hands off to the agent the user already has. The agent installs current versions,
runs the official generators, wires up tests, lint, CI and agent config, and loops until
`stacks verify` is green.

The line the product draws: humans own what lasts (composition, layout, enforcement,
the definition of done), agents own what ages (versions, generator flags, config
formats). Templates get the first half and freeze the second; a bare agent prompt gets
the second half and has no first.

The CLI never calls an LLM and never runs a command from a stack entry.

[PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md) is the source for everything here. Every requirement, phase and decision in this folder should
trace back to a line in it. If one can't, either the plan is wrong or the problem
statement needs a change first.

## Read in this order

| File | What it answers |
|---|---|
| [HANDOFF.md](HANDOFF.md) | Current state, next steps and who owns each |
| [../product/PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md) | Who has the problem, what's broken today, evidence, jobs, success measures, assumptions |
| [requirements.md](requirements.md) | What release 1 builds, for whom, in and out of scope, proposed decisions, how success is measured |
| [roadmap.md](roadmap.md) | Every phase and sub-phase with its goal, trace and dependencies; the MVP cutline; the shared contracts and schema versions; the trust model; the repo and stack facts the plan relies on; open architecture questions A1-A4 |
| [risks-and-open-questions.md](risks-and-open-questions.md) | Risks with mitigations; open questions for the maintainers |
| [phases/](phases/) | One file per sub-phase (`phase-<phase>.<sub>[letter]-<slug>.md`), each with scope, design, files touched, acceptance tests and exit criteria |
| [runs/](runs/README.md) | Run notes: gate and bench runs, which are also the evidence for D5 |

## Phases

Proposed 2026-10-26, not agreed. The full outline, with sub-phases, dependencies and
what can run in parallel, is [roadmap.md](roadmap.md). Phases 0 and 1 are the MVP and the
demo.

| Phase | Goal | Sub-phases | Traces to | Status |
|---|---|---|---|---|
| 0 Foundation | Name held, hard-to-reverse decisions made, `npx stacks` installs the real CLI, and the base can run long and interactive commands | [0.0](phases/phase-0.0-decisions-and-npm-name.md) decisions and name, [0.1](phases/phase-0.1-repo-baseline.md) repo baseline, [0.2](phases/phase-0.2-npm-distribution-artifact.md) distribution, [0.3a](phases/phase-0.3a-errors-and-output.md) errors and output, [0.3b](phases/phase-0.3b-processes-and-signals.md) processes and signals | Open questions: npm name, brief budget, registry audience | In progress (0.1, 0.3a, 0.3b executed and merged; 0.2 and the npm reservation deferred to the final step before public release; 0.0 waits on the maintainers) |
| 1 Core loop (MVP) | `list --json`, `new --sandbox`, the brief, `verify` with tamper detection, handoff, `validate` with the brief budget, the bundled catalog with guardrail hooks, each gated stack taken to green by an agent; the manual npm release (1.6c) is the final step before public release | [1.0](phases/phase-1.0-entry-format-and-registry.md) to [1.6c](phases/phase-1.6c-first-release.md), including [1.6d](phases/phase-1.6d-guardrail-hook-fragments.md) | Jobs 1, 2 and 5; success rows 1-3; assumption 1 | In progress (round 1, 1.0-1.2b, on `feat/phase-1`) |
| 2 Stacks that prove themselves | A composition fingerprint, a run ledger, a local bench, deterministic rot checks | [2.0a](phases/phase-2.0a-composed-files-and-fingerprint.md), [2.0c](phases/phase-2.0c-run-ledger.md), [2.0b](phases/phase-2.0b-bench.md), [2.2](phases/phase-2.2-deterministic-rot-checks.md) | "How does a stack prove it still works?"; success rows 1, 2 and 4 | Not started |
| 3 Existing repos and authors | `add`, `show`, `new` naming and dry-run options, authoring tools, git sources with trust (gated on outside demand), more bundled fragments and stacks, an agent hook harness, native adapters for other agents, an agent skill, verify reporting an app's steps as their own stage | [3.0](phases/phase-3.0-add-fragments-to-repo.md) to [3.5b](phases/phase-3.5b-two-phase-brief.md) | Jobs 3 and 4; the stack author; success row 5 | Not started |
| 4 The hosted side | The format package, the API and signed registry index, usage telemetry with integrity checks and a launch runbook, stats, a browsable directory, dependency trends, an MCP server | [4.0a](phases/phase-4.0a-format-package.md) to [4.3](phases/phase-4.3-mcp-server.md) | Success rows 4 and 5 across users; assumptions 5 and 6 | Not started |
| 5 CI and scheduled inference | The release workflow with provenance, extra CI jobs, the scheduled canary, CI-built index deploys | [5.0](phases/phase-5.0-ci-release-and-checks.md) to [5.2](phases/phase-5.2-ci-index-build-and-deploy.md) | "The canary is the product's CI"; success row 4 | Not started |

The problem statement calls a scheduled canary "the product's CI". The roadmap puts it
in phase 5 (D8, revised under D23) and explains why.

## Decisions log

Settled decisions only, each with its date and reason. A proposal belongs in
[requirements.md](requirements.md#proposed-decisions) until the maintainers agree to it;
then it moves here with an ID that never changes.

| ID | Date | Decision and why | Governing detail |
|---|---|---|---|
| D0 | 2026-10-26, amended 2026-10-27 | The product is named stacks. It was first named stacks; on 2026-10-27 the maintainers renamed it to stacks, the repository's name. `stacks` on npm is an unrelated package; `stacks` and `stacks` both returned 404 on `npm view` on 2026-10-26 and again on 2026-10-27. | [0.0](phases/phase-0.0-decisions-and-npm-name.md) |
| D1 | 2026-10-26 | Not a template engine: `files/` holds only what is the same across versions; everything else is prose. Committed versions are what make templates age. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D2 | 2026-10-26 | Not an agent: the CLI never calls an LLM and never runs a command from an entry. The user's own agent does the work, and the trust story depends on the CLI executing nothing it reads. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not), [roadmap, Trust model](roadmap.md#trust-model) |
| D3 | 2026-10-26 | Not a package manager or version resolver: versions are the agent's job on purpose. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D4 | 2026-10-26 | No retrofitting: `add` applies fragments to an existing project and never restructures what's there. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D10 | 2026-10-26 | The repo is a TypeScript CLI built on the `typescript-cli` base stack, with no product features yet: Effect commands, `doctor` and `--version`, lazy configuration, safe output and logs. It gives every later phase a tested command runtime to build on. How the package is distributed is still open (A1). | [roadmap, Repository and stack](roadmap.md#repository-and-stack) |
| D11 | 2026-10-26, amended 2026-10-27 | The repo is a bun-workspace monorepo: `packages/cli` is the `stacks` package; `packages/mcp` holds the MCP server; shared code gets its own package. The API was first `packages/api`; on 2026-10-27 it moved to its own private repository (D35). Every package in this repository lives under `packages/`, so there is one place to look. The harness (`.claude/`, lefthook, CI, root Biome and tsconfig base, hook tests) belongs to the root. | [roadmap, Repository and stack](roadmap.md#repository-and-stack) |
| D29 | 2026-10-26 | Agent output is the default. Without `--json`, output is for a human only when stdout is a terminal and no agent is detected (`Host.stdoutIsTTY` and `AppConfig.agent`); an agent's shell, a pipe, CI and any non-TTY get agent output. Agent output carries no log lines on stderr (they go to the log file, as in JSON mode), prints paths in command result text relative to the working directory when inside it (error detail paths, `Path:` and `Looked for:`, stay absolute for now), and leaves out what another line or file already says (`new`'s file listing, `validate`'s within-budget sizes, the counts repeated under `Validation failed.`, which human output drops too). `--json` is unchanged. The audiences never behave differently, only render differently. The CLI is agent-first; human output stays as the readable fallback for a person at a terminal. | [roadmap, Output audience](roadmap.md#types-and-schemas), `.claude/rules/cli/cli.md` "Three audiences" |
| D30 | 2026-10-26 | `check` is a `VerifyStep.layer` value, for file and config checks (a README with no fill markers, a hooks file that defines hooks). It isn't a D7 required layer, so no stack needs one, and `step-layer` stays a warning for a step with no layer. Without it such a step had no honest layer, and `step-layer` warned on it. | [roadmap, Verify step `layer`](roadmap.md#other-shared-facts), [1.5](phases/phase-1.5-validate-and-brief-budget.md) |
| D33 | 2026-10-27 | A2, streaming output: stdout keeps one result at the end (neither A2 option moved events to stdout). A long-running command reports live events on stderr through `Output.event`: one JSON object per line in `--json` (verify's `step-started` and `step-finished`, `VerifyEvent`), a short line in agent mode (`> <step>` as each verify step starts), nothing new in human mode, which keeps `Output.progress`. The error envelope stays the last stderr line and gains `next`, the action a text-mode `Next:` line gives. A silent multi-minute verify left an agent unable to tell a slow step from a hung one, and its shell tool's timeout cut the run off with nothing to show; agents that capture whole output lose nothing. | [roadmap, Progress and flush, JSON contract](roadmap.md#types-and-schemas), `.claude/rules/cli/cli.md` |
| A1 | 2026-10-27 | Distribution is a Node ESM bundle on npm, option (a): one `stacks` package with every dependency bundled, so `npx` resolves no dependency tree. The compiled Bun binary leaves the gate. Per-platform binaries would bring signing and notarization for no gain an agent sees. | [0.2](phases/phase-0.2-npm-distribution-artifact.md) |
| A3 | 2026-10-27 | Signals during handoff, option (b), as built in 0.3b: the agent runs in the foreground with the terminal, SIGINT and SIGQUIT are ignored while it runs, SIGTERM and SIGHUP are forwarded, and the CLI exits with its status. Node can't `exec`. | [0.3b](phases/phase-0.3b-processes-and-signals.md), AGENTS.md "Error handling" |
| A4 | 2026-10-27 | Structured errors, option (a), as built in 0.3a: tagged errors with a closed `details` object in the envelope, one exit/retry/keeps-result table, `VerifyFailed` and `VerifyChanged` on exit 5 with the report kept on stdout. Publishing makes these permanent for agents that branch on them. | [0.3a](phases/phase-0.3a-errors-and-output.md), `errors.ts::errorTable` |
| D12 | 2026-10-27 | The npm package supports Node 22 or newer (`engines.node` `>=22`), checked by the package's entry before Effect loads. 22 is the oldest Node line still maintained; the development floor of 24 would refuse many `npx` users. | [requirements, D12](requirements.md#proposed-decisions), [0.2](phases/phase-0.2-npm-distribution-artifact.md) |
| D22 | 2026-10-27 | Release 1 supports macOS and Linux on the Node runtime only (`"os": ["darwin", "linux"]`); the entry refuses the Bun runtime, because Bun loads a project's `.env` before the CLI captures its environment. | [requirements, D22](requirements.md#proposed-decisions), [0.2](phases/phase-0.2-npm-distribution-artifact.md) |
| D34 | 2026-10-27 | 0.1.0 is published by hand from the packed tarball, without npm provenance (open question 20: yes; the 5.0 workflow adds provenance). D20's gate is waived for 0.1.0: three of eight bundled stacks have a green bench run, and `list` marks the other five unproven, which tells a user and an agent the truth. The package is `@steamfield/stacks`, in the maintainer's own scope (npm refuses the unscoped `stacks` as too similar to the existing `quick-stack`); the command it installs is `stacks`. The product name, `.stacks/` and `STACKS_*` remain stacks. It keeps the repository's Apache-2.0 license. | [1.6c](phases/phase-1.6c-first-release.md) |
| D31 | 2026-10-27 | `stacks update [--check]` reports the running and latest published versions and, without `--check`, upgrades a global npm install in place with `npm install -g` at the exact latest version. npx and any other install get the version report and the command to run, exit 0. It never checks in the background or on other commands, and under a detected agent it refuses an install (exit 6) but still checks. Proposed as `upgrade` across several install methods; A1 left npm as the only distribution, and the command a person typed first was `update`. | [4.4d](phases/phase-4.4d-self-update.md) |
| D16 | 2026-10-27 | The API's production host is Cloudflare Workers with D1, static assets and a scheduled entry, the design phase 4's plans already assume. It is reached by migrating (4.0f), not first: until then the API runs as a Node server under D35 and has no store. The Node-and-Postgres alternative is dropped. Storage and telemetry (4.1b onward) arrive after 4.0f, on D1, so no data moves between hosts. | [4.0b](phases/phase-4.0b-api-skeleton-on-node.md), [4.0f](phases/phase-4.0f-workers-migration.md) |
| D35 | 2026-10-27 | The hosted API (phase 4) lives in a separate private repository, `stacks-api`, so its source isn't published; its plans stay public here, and `packages/api` is removed. In plans, a path written `stacks-api/...` is relative to that repository's root. It is a bun workspace scaffolded from the bundled `astro-api` stack: `apps/api` (the Effect `HttpApi` server), `apps/web` (an Astro static site with React islands, which holds the directory and stats pages that used to be planned here) and `packages/contract` (the `HttpApi` definition and its schemas, imported by both apps; islands call the API through Effect's `HttpApiClient`). It runs first as a Node HTTP server on a host the maintainers control, under a maintainers' domain that stays the same after the move, so the hackathon demo needs no Cloudflare account. Before the move it serves only `/healthz`, `/openapi.json`, the signed index files and the built site; storage and telemetry wait for Workers (D16). To keep the move an adapter swap: routes are one `HttpApi` served through `HttpRouter`, only `apps/api/src/platform/` knows the runtime (including static file serving), and scheduled work is an Effect program that a platform entry triggers. Shared schemas reach it as the published `@stacks/format` package (4.0a), through an npm alias so the import name stays `@stacks/format`, because a workspace link can't cross repositories. The index and `names.json` are still built and signed in this repository, because they need CLI code. | [4.0b](phases/phase-4.0b-api-skeleton-on-node.md), [roadmap, Repository and stack](roadmap.md#repository-and-stack) |

## Plan conventions

Every plan file opens with a status line, updated as work lands:

```
Status: DRAFT <date> | AGREED <date> | IN PROGRESS <date> | EXECUTING | EXECUTED <date> | PARTIALLY EXECUTED (what was deferred and why) | DEFERRED <date> (why, and until when) | WITHDRAWN <date> (why)
```

`tests/acceptance/status.test.ts` checks each plan's Status keyword and date against its roadmap
row.

`DRAFT` is written but not agreed with the maintainers. `IN PROGRESS` is for a file whose
work is owned by people rather than an agent (0.0's reviews and decisions). Anything after
the keyword is a short note.

Plans are hypotheses, not specifications. Verify a claim against the code before
building on it, and record what a plan got wrong next to the plan. That record is often
worth more than the record of what was built.

Cite symbols, never line numbers (`compose.ts::compose`, not `compose.ts:641`). Line
numbers drift before anyone executes the plan. Don't cite commit hashes either: history
gets rewritten. Say what landed and check `git log` when it matters.

A contract used by more than one sub-phase is defined once, in the roadmap's
[shared contracts](roadmap.md#contracts-every-sub-phase-shares) or by the sub-phase that
table names, and every other file cites it by name. The same holds for the
[trust model](roadmap.md#trust-model).

A plan's `## Acceptance tests` section is a numbered list (`1.`, `2.`, and `12a.` for one
inserted later), ending with a `### Realistic edge cases` subsection whose items continue
the numbering. Those are the cases from `.claude/rules/cli/testing.md` "Realistic edge
cases" that apply to this sub-phase, and each becomes a test like any other item. Every
item's test carries a tag in its name, `[<sub-phase>#<number>]`, such as
`test("a second new into the same directory is TargetNotEmpty [1.2a#4]", ...)`. A plan
opts into checking with a line `Acceptance tests: traced` under its status line; from
then on the root `tests/acceptance/trace.test.ts` fails when a number has no tagged test
under `packages/cli/tests` or `packages/cli/e2e`, or when a tag names a number the plan
doesn't list.

Each new sub-phase, starting with 1.3a, gets its acceptance tests before its code. A test
author, a different agent from the implementer, writes them from the plan as tagged,
failing tests and adds the traced line. The implementer makes them pass without editing
their assertions. A change to a test's intent is a change to the plan, made there first.
A test the implementer believes is wrong is reported to the maintainers, not quietly
rewritten.

No individual's name appears in a plan. Owners are "the maintainers" or "an agent".

New work gets a file at this level named for its topic (`topic.md`), or
`rfc-topic.md` for a proposal that needs a decision. Add it to the table above with a
one-line status. Keep long evidence (per-run logs, timing tables) in linked files, such as
[runs/](runs/README.md), rather than growing this README. Retired plans move to `archive/`
with a dated name and a line in `archive/README.md`.
