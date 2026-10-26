# quickstacks plan

Status: planning only, started 2026-10-26. No code exists yet. **Start with
[HANDOFF.md](HANDOFF.md)**, then [00-requirements.md](00-requirements.md).

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
| [01-architecture.md](01-architecture.md) | Not started: the design questions the build has to settle, and what each one traces to |
| [10-risks-and-open-questions.md](10-risks-and-open-questions.md) | Risks with mitigations; open questions for the maintainers |
| [phases/](phases/) | The execution plan, one file per phase, each with tasks and exit criteria |

## Phases

Proposed 2026-10-26, not agreed. Only P0 has a phase file so far; write the next one
when its predecessor is close to exiting, not before.

| Phase | Goal | Traces to | Status |
|---|---|---|---|
| [P0 foundation](phases/P0-foundation.md) | Name secured, requirements agreed, brief budget and registry audience decided, repo and gates in place | Open questions: npm name, brief budget, registry audience | Not started |
| P1 core loop | `list --json`, `new`, the brief, `verify`, handoff, and one stack an agent takes to a green `verify --sandbox` with no help | Jobs 1, 2 and 5; success rows 1-3 | Not planned |
| P2 measured runs | Every sandbox run recorded (time to green, interventions, brief size), so the success table has numbers | "None of these are collected today" | Not planned |
| P3 add and authoring | `add` applies a fragment to an existing repo without overwriting; authors can write and validate their own stacks in a user directory | Jobs 3 and 4; stack author user | Not planned |
| P4 stacks that prove themselves | A scheduled canary that scaffolds each stack headlessly and reports when one stops passing | "How does a stack prove it still works?"; success row 4 | Not planned |

The problem statement argues P4 "probably belongs earlier". Where it lands is decision
D8 below.

## Decisions log

Settled decisions only, each with its date and reason. A proposal belongs in
[00-requirements.md](00-requirements.md#proposed-decisions) until the maintainers agree to it;
then it moves here with an ID that never changes.

| ID | Date | Decision and why | Governing detail |
|---|---|---|---|
| D0 | 2026-10-26 | The product is named quickstacks. `stacks` on npm is an unrelated package; `quickstack` and `quickstacks` both returned 404 on `npm view` on 2026-10-26 (free, not yet reserved). | [P0](phases/P0-foundation.md) |
| D1 | 2026-10-26 | Not a template engine: `files/` holds only what is the same across versions; everything else is prose. Committed versions are what make templates age. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D2 | 2026-10-26 | Not an agent: the CLI never calls an LLM and never runs a command from an entry. The user's own agent does the work, and the trust story depends on the CLI executing nothing it reads. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not), [01](01-architecture.md#security-boundaries) |
| D3 | 2026-10-26 | Not a package manager or version resolver: versions are the agent's job on purpose. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D4 | 2026-10-26 | No retrofitting: `add` applies fragments to an existing project and never restructures what's there. | [PROBLEM_STATEMENT](../product/PROBLEM_STATEMENT.md#what-this-is-not) |
| D10 | 2026-10-26 | The repo is a TypeScript CLI built on the `typescript-cli` base stack with no product features. Ported as boilerplate the same day from the stacks registry's verified base run (`typescript-cli-base.bundle`, commit `809025a`), renamed to quickstacks. How the package is distributed is still open (A1). | [01, Stack](01-architecture.md#stack) |
| D11 | 2026-10-26 | The repo is a bun-workspace monorepo: `apps/cli` is the `quickstacks` package; an API and an MCP server will each be their own package under `apps/`; shared code goes in `packages/`. The harness (`.claude/`, lefthook, CI, root Biome and tsconfig base, hook tests) belongs to the root. Follows the layout in `~/Projects/poker`. | [01, Repository layout](01-architecture.md#repository-layout) |

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
