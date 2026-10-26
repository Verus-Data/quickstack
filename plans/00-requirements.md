# Product requirements: quickstacks

Status: DRAFT 2026-10-26, derived from [PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md)
and not yet reviewed by the maintainers. Settled decisions are in the
[README decisions log](README.md#decisions-log); everything under
[Proposed decisions](#proposed-decisions) below is open until agreed. Risks and open
questions are in [10-risks-and-open-questions.md](10-risks-and-open-questions.md).

## TL;DR

quickstacks is a CLI and a set of stacks. A stack is version-less prose plus a few files
that never change across versions: what the project is built from, how it is laid out,
what the tools must enforce, and a list of verify commands that define "working". The
user, or more often their agent, runs `quickstacks new <stack> <dir>`. The CLI writes
those files, a brief and a manifest, then hands off to the agent on PATH. The agent
builds the project against today's versions and loops on `quickstacks verify` until it
passes.

The goal is a project the user doesn't have to audit: the same setup they would have
built by hand, with the tests and tooling they would have added, in the time it takes to
make coffee. The sandbox target is a green `verify` in under 20 minutes with no user
intervention.

## Who this is for

Four users, in the problem statement's priority order. The full description of each,
and what success looks like for them, is in
[Who has it](../product/PROBLEM_STATEMENT.md#who-has-it).

| User | What they need from release 1 |
|---|---|
| The developer who starts projects often | A stack that matches how they'd build it, including tests, lint, CI and agent config |
| The coding agent (the CLI's main reader) | A brief with no ambiguity, a `verify` that exists and defines done, a default for every decision |
| The developer under time pressure | `--sandbox`: shortest path to a running dev environment with a passing test |
| The stack author | A way to know a stack still produces a working project without running it by hand |

The agent is the primary reader of everything the CLI emits. Requirements that trade
human readability against agent unambiguity should favor the agent, with `--json` on
every command an agent calls.

## What we're replacing

| Approach | What it gets right | Where it fails |
|---|---|---|
| Templates and generators (Yeoman, cookiecutter, the `create-*` family) | Durable choices: layout, tooling, conventions | Versions are committed, so the template ages from the day it ships; it can't express intent ("mypy strict with the pydantic plugin") without a config file that will be wrong for the next release |
| A bare agent prompt | The perishable part: current docs, running generators, fixing what breaks | No definition of done, a different layout every run, skips tests, lint, CI and agent config unless told in a level of detail that costs the afternoon |

The landscape beyond these two hasn't been researched. Before release 1 is agreed,
check spec-driven agent workflows and any agent-native scaffolders that have appeared,
and add rows here with sources. Kelvo's README competitor table is the format to follow.

## What we're building

### The entry format

Stacks and fragments are directories with a markdown definition (frontmatter plus a
prose body) and an optional `files/` folder. `files/` holds only content that is the
same across versions. Everything version-sensitive is prose the agent interprets. A
fragment is a known-good piece (CI, agent hooks, Postgres) that composes onto a stack or
an existing repo.

### The CLI

| Command | Job it serves | Requirement |
|---|---|---|
| `list --json` | Agent picks a stack | Enough metadata for an agent to choose and explain why |
| `new <stack> <dir> [--sandbox] [--with ...]` | Start a project | Writes files, brief and manifest; hands off; runs no entry commands |
| `verify` | Definition of done | Runs the manifest's steps; the brief forbids weakening a step; detects tampering with the steps |
| `add <fragment>` | Improve an existing repo | Applies a fragment without overwriting existing files; never restructures |
| `validate` | Stack author trust | Checks entries, including the brief budget once one is set (D5) |

### The brief

The brief is the agent's whole instruction set. It must say which layers of testing to
set up, which verify command exists, and a default for every decision, so the agent
reaches green without asking the user anything the brief could have answered.

### The registry

Stacks come from layered origins: a project, the user's directory, third-party sources
and the bundled set. Who the bundled set is for is open (D6).

## In scope and out of scope

In scope for release 1 (proposed): the entry format, `list`, `new` with `--sandbox`,
`verify`, the brief, handoff to the agent on PATH, `validate` with a brief budget, and
enough stacks to test the core assumption at both small and large brief sizes. `add` and
user-authored stacks are wanted (jobs 3 and 4) but can follow in P3.

Out of scope, from [What this is not](../product/PROBLEM_STATEMENT.md#what-this-is-not), settled
as D1-D4:

- A template engine. `files/` holds only what is the same across versions.
- An agent. The CLI never calls an LLM and never runs a command from an entry.
- A package manager or version resolver. Versions are the agent's job.
- Retrofitting a project onto a stack. `add` applies fragments only.

## Proposed decisions

Each needs the maintainers' call. When agreed, move it to the README decisions log with the same
ID and the date.

| ID | Proposal | Why | Traces to |
|---|---|---|---|
| D5 | Set a per-stack brief budget, enforced by `validate`, before writing the second stack. Starting point: a cap near the 3,200-3,900 words the first stacks needed, with a separate cap for stack plus optional fragments | Once stacks are 10,000 words nobody will cut them; the problem statement calls this a one-way door | Assumptions row 1; open question "What is the brief budget?" |
| D6 | The bundled registry is a curated catalog of stacks a stranger would want. Personal tooling lives in the user directory or a personal source | Mixed content makes the product unclear either way; origin layering already supports the split | Open question "Who is the bundled registry for?" |
| D7 | Every shipped stack's `verify` covers install, lint, typecheck, test, and a dev-server probe when there is a server. A stack can't ship without it | This is the "result is complete" success measure; making it a format rule turns it into something `validate` can check | Success table row 3 |
| D8 | Bring the canary forward to straight after P2, ahead of add and authoring | Manual end-to-end runs are the only quality signal and nobody has time to run them | Open question "How does a stack prove it still works?" |
| D9 | Hand off to whatever agent is on PATH, and treat "ask your agent to run quickstacks" as an equal entry point. Instrument which one people use | Low-confidence assumption; cheap to support both and measure | Assumptions row 5 |

## How success is measured

Measured per stack, not per release. These come from
[What success looks like](../product/PROBLEM_STATEMENT.md#what-success-looks-like). None are
collected today; P2 exists to collect the first two.

| Outcome | Measure | Target | Collected by |
|---|---|---|---|
| The agent finishes without help | Fraction of `new --sandbox` runs reaching green `verify` with no user intervention | To set in P0 | P2 run records |
| It's faster than by hand | Median time from `new` to green `verify` | Under 20 minutes (sandbox) | P2 run records |
| The result is complete | Shipped stacks whose verify covers all D7 layers | Every shipped stack | `validate` (if D7 is agreed) |
| Stacks don't rot | A stack that passed last month passes this month with no prose change | To set | P4 canary |
| People write their own | Stacks and fragments in user directories and third-party sources | Anyone outside the maintainers | Usage telemetry, if adopted (not yet decided) |

Telemetry isn't decided. If it's adopted, the privacy model and opt-in or opt-out choice
need their own RFC before any collection ships.
