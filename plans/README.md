# quickstacks plan

Status: planning, started 2026-10-26. The CLI base is in place with no product code.
**Start with [HANDOFF.md](HANDOFF.md)**, then [00-requirements.md](00-requirements.md) and
[02-roadmap.md](02-roadmap.md).

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
uses the earlier working name "stacks" (`npx stacks`, `~/.stacks`, `docs/roadmap.md`);
read those as quickstacks. Every requirement, phase and decision in this folder should
trace back to a line in it. If one can't, either the plan is wrong or the problem
statement needs a change first.

## Read in this order

| File | What it answers |
|---|---|
| [HANDOFF.md](HANDOFF.md) | Current state, next steps and who owns each |
| [../product/PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md) | Who has the problem, what's broken today, evidence, jobs, success measures, assumptions |
| [00-requirements.md](00-requirements.md) | What release 1 builds, for whom, in and out of scope, proposed decisions, how success is measured |
| [02-roadmap.md](02-roadmap.md) | Every phase and sub-phase with its goal, trace and dependencies; the MVP cutline; the repo and stack facts the plan relies on; open architecture questions A1-A4; the trust boundary |
| [10-risks-and-open-questions.md](10-risks-and-open-questions.md) | Risks with mitigations; open questions for the maintainers |
| [phases/](phases/) | One file per sub-phase (`phase-<phase>.<sub>.md`), each with scope, design, files touched, acceptance tests and exit criteria |

## Phases

Proposed 2026-10-26, not agreed. The full outline, with sub-phases, dependencies and
what can run in parallel, is [02-roadmap.md](02-roadmap.md). Phases 0 and 1 are the MVP.

| Phase | Goal | Sub-phases | Traces to | Status |
|---|---|---|---|---|
| 0 Foundation | Name held, hard-to-reverse decisions made, `npx quickstacks` installs the real CLI, and the base can run long and interactive commands | [0.0](phases/phase-0.0.md) decisions and name, [0.1](phases/phase-0.1.md) repo baseline, [0.2](phases/phase-0.2.md) distribution, [0.3](phases/phase-0.3.md) command runtime | Open questions: npm name, brief budget, registry audience | In progress (0.1 mostly executed) |
| 1 Core loop (MVP) | `list --json`, `new --sandbox`, the brief, `verify` with tamper detection, handoff, `validate` with the brief budget, three bundled stacks each taken to green by an agent | [1.0](phases/phase-1.0.md) to [1.6](phases/phase-1.6.md) | Jobs 1, 2 and 5; success rows 1-3; assumption 1 | Not started |
| 2 Stacks that prove themselves | Run records, a fingerprint and bench, a scheduled canary, deterministic rot checks | [2.0](phases/phase-2.0.md) to [2.2](phases/phase-2.2.md) | "How does a stack prove it still works?"; success rows 1, 2 and 4 | Not started |
| 3 Existing repos and authors | `add`, authoring tools, git sources with trust | [3.0](phases/phase-3.0.md) to [3.2](phases/phase-3.2.md) | Jobs 3 and 4; the stack author; success row 5 | Not started |
| 4 The hosted side | The API and registry index, usage telemetry, stats and a directory, an MCP server | [4.0a](phases/phase-4.0a.md) to [4.3](phases/phase-4.3.md) | Success rows 4 and 5 across users; assumptions 5 and 6 | Not started |

The problem statement argues the canary "probably belongs earlier". The roadmap puts it
first after the MVP (D8) and explains why not inside it.

## Decisions log

Settled decisions only, each with its date and reason. A proposal belongs in
[00-requirements.md](00-requirements.md#proposed-decisions) until the maintainers agree to it;
then it moves here with an ID that never changes.

| ID | Date | Decision and why | Governing detail |
|---|---|---|---|
| D0 | 2026-10-26 | The product is named quickstacks. `stacks` on npm is an unrelated package; `quickstack` and `quickstacks` both returned 404 on `npm view` on 2026-10-26 (free, not yet reserved). | [0.0](phases/phase-0.0.md) |
| D1 | 2026-10-26 | Not a template engine: `files/` holds only what is the same across versions; everything else is prose. Committed versions are what make templates age. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D2 | 2026-10-26 | Not an agent: the CLI never calls an LLM and never runs a command from an entry. The user's own agent does the work, and the trust story depends on the CLI executing nothing it reads. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not), [roadmap, Trust boundary](02-roadmap.md#trust-boundary) |
| D3 | 2026-10-26 | Not a package manager or version resolver: versions are the agent's job on purpose. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D4 | 2026-10-26 | No retrofitting: `add` applies fragments to an existing project and never restructures what's there. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D10 | 2026-10-26 | The repo is a TypeScript CLI built on the `typescript-cli` base stack with no product features. Ported as boilerplate the same day from the stacks registry's verified base run (`typescript-cli-base.bundle`, commit `809025a`), renamed to quickstacks. How the package is distributed is still open (A1). | [roadmap, Repository and stack](02-roadmap.md#repository-and-stack) |
| D11 | 2026-10-26 | The repo is a bun-workspace monorepo: `packages/cli` is the `quickstacks` package; `packages/api` and `packages/mcp` hold the API and MCP server; shared code gets its own package. Every package is under `packages/` (2026-10-26: the CLI moved there from `apps/cli` and `apps/` was dropped, so there is one place packages live). The harness (`.claude/`, lefthook, CI, root Biome and tsconfig base, hook tests) belongs to the root. Follows the layout in `~/Projects/poker`. | [roadmap, Repository and stack](02-roadmap.md#repository-and-stack) |

## Plan conventions

These come from the opendata and liveoak-service plans, where each one was learned the
hard way.

Every plan file opens with a status line, updated as work lands:

```
Status: DRAFT | AGREED <date> | EXECUTING | EXECUTED <date> | PARTIALLY EXECUTED (what was deferred and why)
```

Plans are hypotheses, not specifications. Verify a claim against the code before
building on it, and record what a plan got wrong next to the plan. That record is often
worth more than the record of what was built.

Cite symbols, never line numbers (`compose.ts::resolvePlan`, not `compose.ts:641`). Line
numbers drift before anyone executes the plan.

New work gets a numbered file at this level: `NN-topic.md` for specs and
`NN-rfc-topic.md` for a proposal that needs a decision. Add it to the table above with a
one-line status. Keep long evidence (per-run logs, timing tables) in linked files rather
than growing this README. Retired plans move to `archive/` with a dated name and a line
in `archive/README.md`.
