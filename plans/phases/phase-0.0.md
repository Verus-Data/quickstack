# Phase 0.0: Decisions and name

Status: IN PROGRESS 2026-10-26. Competitive research done (see
[00-requirements.md](../00-requirements.md#what-were-replacing)); everything else waits on
the maintainers.

| Field | Value |
|---|---|
| Goal | The npm name is held, the requirements are agreed, and every decision that later sub-phases block on is either made or explicitly deferred with a reason |
| Traces to | Open question "Is the npm name available? ... The name needs resolving before anything else in the roadmap matters"; open questions "Who is the bundled registry for?" and "What is the brief budget?" |
| Depends on | nothing |
| Blocks | 0.2 (A1, D12), 1.4 (D9), 1.5 (D5, D7), 1.6 (D5, D6, D13), phase 2 ordering (D8), 2.1 (D15), 4.0 (D16), 4.1 (D17) |
| Decisions needed | All of D5-D9 and D12-D17, and A1. Not all at once: the table below says which ones gate the MVP |
| Settles | Nothing by itself. Each agreed proposal moves to the README decisions log with its ID unchanged |

## Scope

In: reserving the name, reviewing the requirements, deciding or deferring each proposal,
setting the one success target that has no number yet, and naming the first stack.

Out: any code. The repo work that was in the old foundation phase is in
[0.1](phase-0.1.md) (baseline) and [0.2](phase-0.2.md) (distribution).

## Tasks

| Task | Owner | Done when |
|---|---|---|
| Reserve `quickstacks` on npm with a placeholder package. Decide whether to hold `quickstack` too (open question 6) | maintainers | `npm view quickstacks` shows the placeholder |
| Check `quickstacks` on GitHub and as a domain; record what's taken in this file | Agent | A short table below, with the date checked |
| Review [00-requirements.md](../00-requirements.md) and mark it AGREED or list the changes | maintainers | Its `Status:` line says AGREED with a date |
| Decide the MVP-gating proposals (table below) | maintainers | Each is in the decisions log or deferred here with a reason |
| Set the target for "the agent finishes without help" | maintainers | A number in 00's success table. Proposal: 2 of 3 bundled stacks green with zero interventions at the MVP gate, then 80% of bench runs per stack per month in phase 2 |
| Name the first stack (open question 4) | maintainers | Proposal in D13: `astro-blog`, the smallest brief with a dev server, so 1.3 exercises every D7 layer without also testing the long-brief assumption |
| Competitive research | Agent | Done 2026-10-26 |

## Which decisions gate what

The MVP needs seven answers. The rest can wait until their phase starts, and the
roadmap is written so that a "not yet" on them doesn't block phase 1.

| ID | Proposal, short form | Gates | Needed by |
|---|---|---|---|
| A1 | Ship a Node ESM bundle on npm | 0.2 | Before 0.2 starts |
| D12 | Node range `>=22` for the published package | 0.2 | Before 0.2 starts |
| D5 | Brief budget numbers | 1.5 enforcement, and 1.6's stack prose | Before 1.5 |
| D7 | Verify layers every stack must cover | 1.5 | Before 1.5 |
| D9 | Both entry points, handoff kind recorded | 1.4 | Before 1.4 |
| D6 | Bundled registry is a curated catalog | 1.6 | Before 1.6 |
| D13 | The three MVP stacks | 1.6 | Before 1.6 (drafting can start earlier) |
| D14 | Changed verify steps fail verify | 1.3 | Before 1.3 |
| D8 | Canary right after the MVP | Phase 2 start | After the MVP gate |
| D15 | Where the canary runs, on whose agent account | 2.1 | Before 2.1 |
| D16 | API hosting | 4.0 | Before phase 4 |
| D17 | Telemetry consent | 4.1 | Before 4.1 |

A2-A4 are architecture questions the Agent answers in [0.3](phase-0.3.md) and the
maintainers review there; they don't need a decision here.

## Name check

To be filled in by the Agent.

| Where | `quickstacks` | `quickstack` | Checked |
|---|---|---|---|
| npm | Free (404) | Free (404) | 2026-10-26 |
| GitHub org or repo | | | |
| Domain | | | |

## Acceptance tests

None in code. The checks are on the documents:

- Every ID in the gating table has a row in either the README decisions log or the
  "Deferred" list below, with a date.
- `grep -n "Status:" plans/*.md plans/phases/*.md` shows no file without a status line.

## Deferred

Decisions the maintainers chose not to make yet, each with its reason and the
sub-phase that will ask again. Empty until the review.

## Exit criteria

- `npm view quickstacks` shows our package.
- 00-requirements.md is AGREED.
- A1, D5, D6, D7, D9, D12, D13 and D14 are each in the decisions log or deferred with a
  reason. Anything deferred that gates an MVP sub-phase blocks that sub-phase, not this
  one.
- The first stack is named.
- `bun run check` is still green from the repo root (no code changes are expected; this
  is the same check [0.1](phase-0.1.md) ends with).

## What this plan may get wrong

- Reserving a name with a placeholder package can trip npm's policy on squatting if
  nothing is published for a long time. If phase 1 slips, publish a real 0.0.x with
  `doctor` and `--version` rather than leave the placeholder.
- Eight decisions in one review is a lot. If the review stalls, take A1 and D12 first:
  they unblock 0.2, and nothing in 0.3 or 1.0-1.2 waits on the rest.
