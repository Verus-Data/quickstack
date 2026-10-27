# Pitch

Status: DRAFT 2026-10-26 — product positioning and proposed demo; not a release announcement.

## One sentence

**quickstack gives your coding agent a reusable project blueprint and a verifiable definition of done, so every new project starts with your standards already written down.**

## Elevator pitch — 30 seconds

Every new project starts with the same tax: dependencies, tests, lint, CI, and explaining your preferences to a coding agent again.

Templates freeze yesterday's setup. A bare prompt leaves the agent guessing what complete means.

quickstack separates the durable decisions from the details that change. You describe the stack and the checks that must pass; your coding agent handles current versions and configuration.

Write your setup once. Reuse it. Start on the actual product sooner.

## Opening hook

“Your agent can write the app. Why are you still explaining how to set up the project?”

## Demo pitch — 60 seconds

Suppose you want an agent that reviews Rho sandbox transactions and flags charges above $500.

Before you can test that idea, you need a project foundation: structure, dependencies, tests, lint, and clear instructions for your coding agent.

quickstack captures that foundation in a reusable stack. It prepares a build brief and a definition of done. Your existing coding agent implements the project, resolves current tooling, and works toward passing verification.

Then we test the actual use case: a transaction is flagged with an explanation. We change the requirements to detect possible duplicates within seven days, update the tests, and demonstrate the result again.

The product is quickstack. The Rho agent is the example it helps us build.

## What makes it different

| Approach | What it preserves | What still needs attention |
| --- | --- | --- |
| Static template | A snapshot of project files | Updating dependencies and configuration |
| Bare agent prompt | Flexibility to generate current code | Consistent decisions and a complete definition of done |
| quickstack design | Reusable intent, stable files, and verification requirements | The coding agent implements and verifies current tooling |

The core design choice: **humans own the standards; agents handle the details that age.**

## Audience and adoption

Start with developers who repeatedly build projects using coding agents and already have a setup they trust. Their first reason to adopt is saving repeated setup work while preserving their standards.

The first useful adoption loop is: capture one trusted stack → use it for a real project → improve the brief from the run → reuse it on the next project.

Community distribution and hosted services are later opportunities, not evidence of current traction or a settled pricing model.

## What the demo must prove

- The brief contains useful project decisions that the developer did not have to repeat.
- The coding agent receives explicit acceptance checks.
- The resulting project passes meaningful checks without weakening them.
- The Rho example produces an understandable result using clearly identified data.
- Any claimed speed improvement has a comparable measured baseline.

## Claims discipline

Current repository state: CLI foundation with doctor and version support; the product loop is planned. See [the handoff](../plans/HANDOFF.md) and [the problem statement](PROBLEM_STATEMENT.md).

Do not announce shipping integrations, deployment automation, npm availability, or measured speedups without checking the implementation and evidence. A goal such as “10× faster” is a hypothesis until measured.

The repository's settled design says the CLI does not call an LLM or execute commands supplied by stack entries. Attribute implementation and application deployment to the coding agent and the configured tools.

## Closing line

**Stop rebuilding your starting point. Write it once, give it to your agent, and verify the result.**
