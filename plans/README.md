# quickstacks plan

Status: DRAFT 2026-10-26. Planning; the CLI base is in place with no product code. The
plan is written to the demo-first proposal (D23).
**Start with [HANDOFF.md](HANDOFF.md)**, then [requirements.md](requirements.md) and
[roadmap.md](roadmap.md).

## Product to preserve

quickstacks gives a developer who starts projects with a coding agent a consistent,
current, fully tested setup. A stack is a short, version-less description of what a
project is made of, how it is laid out, what the tools must enforce, and what "working"
means as a list of commands that must pass. The CLI writes a few files and a brief,
then hands off to the agent the user already has. The agent installs current versions,
runs the official generators, wires up tests, lint, CI and agent config, and loops until
`quickstacks verify` is green.

The line the product draws: humans own what lasts (composition, layout, enforcement,
the definition of done), agents own what ages (versions, generator flags, config
formats). Templates get the first half and freeze the second; a bare agent prompt gets
the second half and has no first.

The CLI never calls an LLM and never runs a command from a stack entry.

[PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md) is the source for everything here. It
calls the product "stacks" (`npx stacks`, `~/.stacks`, `docs/roadmap.md`); read those
as quickstacks. Every requirement, phase and decision in this folder should
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
| 0 Foundation | Name held, hard-to-reverse decisions made, `npx quickstacks` installs the real CLI, and the base can run long and interactive commands | [0.0](phases/phase-0.0-decisions-and-npm-name.md) decisions and name, [0.1](phases/phase-0.1-repo-baseline.md) repo baseline, [0.2](phases/phase-0.2-npm-distribution-artifact.md) distribution, [0.3a](phases/phase-0.3a-errors-and-output.md) errors and output, [0.3b](phases/phase-0.3b-processes-and-signals.md) processes and signals | Open questions: npm name, brief budget, registry audience | In progress (0.1 executed) |
| 1 Core loop (MVP) | `list --json`, `new --sandbox`, the brief, `verify` with tamper detection, handoff, `validate` with the brief budget, three bundled stacks with guardrail hooks each taken to green by an agent, a manual npm release | [1.0](phases/phase-1.0-entry-format-and-registry.md) to [1.6c](phases/phase-1.6c-first-release.md), including [1.6d](phases/phase-1.6d-guardrail-hook-fragments.md) | Jobs 1, 2 and 5; success rows 1-3; assumption 1 | Not started |
| 2 Stacks that prove themselves | A composition fingerprint, a run ledger, a local bench, deterministic rot checks | [2.0a](phases/phase-2.0a-composed-files-and-fingerprint.md), [2.0c](phases/phase-2.0c-run-ledger.md), [2.0b](phases/phase-2.0b-bench.md), [2.2](phases/phase-2.2-deterministic-rot-checks.md) | "How does a stack prove it still works?"; success rows 1, 2 and 4 | Not started |
| 3 Existing repos and authors | `add`, `show`, `new` naming and dry-run options, authoring tools, git sources with trust (gated on outside demand), more bundled fragments and stacks, an agent hook harness, native adapters for other agents, an agent skill, apps with a two-phase brief | [3.0](phases/phase-3.0-add-fragments-to-repo.md) to [3.5b](phases/phase-3.5b-two-phase-brief.md) | Jobs 3 and 4; the stack author; success row 5 | Not started |
| 4 The hosted side | The format package, the API and signed registry index, usage telemetry with integrity checks and a launch runbook, stats, a browsable directory, dependency trends, an MCP server | [4.0a](phases/phase-4.0a-format-package.md) to [4.3](phases/phase-4.3-mcp-server.md) | Success rows 4 and 5 across users; assumptions 5 and 6 | Not started |
| 5 CI and scheduled inference | The release workflow with provenance, extra CI jobs, the scheduled canary, CI-built index deploys | [5.0](phases/phase-5.0-ci-release-and-checks.md) to [5.2](phases/phase-5.2-ci-index-build-and-deploy.md) | "The canary is the product's CI"; success row 4 | Not started |

The problem statement argues the canary "probably belongs earlier". The roadmap puts it
in phase 5 (D8, revised under D23) and explains why.

## Decisions log

Settled decisions only, each with its date and reason. A proposal belongs in
[requirements.md](requirements.md#proposed-decisions) until the maintainers agree to it;
then it moves here with an ID that never changes.

| ID | Date | Decision and why | Governing detail |
|---|---|---|---|
| D0 | 2026-10-26 | The product is named quickstacks. `stacks` on npm is an unrelated package; `quickstack` and `quickstacks` both returned 404 on `npm view` on 2026-10-26 (free, not yet reserved). | [0.0](phases/phase-0.0-decisions-and-npm-name.md) |
| D1 | 2026-10-26 | Not a template engine: `files/` holds only what is the same across versions; everything else is prose. Committed versions are what make templates age. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D2 | 2026-10-26 | Not an agent: the CLI never calls an LLM and never runs a command from an entry. The user's own agent does the work, and the trust story depends on the CLI executing nothing it reads. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not), [roadmap, Trust model](roadmap.md#trust-model) |
| D3 | 2026-10-26 | Not a package manager or version resolver: versions are the agent's job on purpose. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D4 | 2026-10-26 | No retrofitting: `add` applies fragments to an existing project and never restructures what's there. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D10 | 2026-10-26 | The repo is a TypeScript CLI built on the `typescript-cli` base stack, with no product features yet: Effect commands, `doctor` and `--version`, lazy configuration, safe output and logs. It gives every later phase a tested command runtime to build on. How the package is distributed is still open (A1). | [roadmap, Repository and stack](roadmap.md#repository-and-stack) |
| D11 | 2026-10-26 | The repo is a bun-workspace monorepo: `packages/cli` is the `quickstacks` package; `packages/api` and `packages/mcp` hold the API and MCP server; shared code gets its own package. Every package lives under `packages/`, so there is one place to look. The harness (`.claude/`, lefthook, CI, root Biome and tsconfig base, hook tests) belongs to the root. | [roadmap, Repository and stack](roadmap.md#repository-and-stack) |

## Plan conventions

Every plan file opens with a status line, updated as work lands:

```
Status: DRAFT <date> | AGREED <date> | IN PROGRESS <date> | EXECUTING | EXECUTED <date> | PARTIALLY EXECUTED (what was deferred and why)
```

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

No individual's name appears in a plan. Owners are "the maintainers" or "an agent".

New work gets a file at this level named for its topic (`topic.md`), or
`rfc-topic.md` for a proposal that needs a decision. Add it to the table above with a
one-line status. Keep long evidence (per-run logs, timing tables) in linked files, such as
[runs/](runs/README.md), rather than growing this README. Retired plans move to `archive/`
with a dated name and a line in `archive/README.md`.
