# Submission readiness

Status: DRAFT 2026-10-28. Reviewed twice by ce:devils-advocate, then cut to the deadline
scope; implementation has not started. Replaces `plans/submission-readiness-rfc.md`.

This is the work left before the hackathon submission of stacks: the CLI (this repository,
published as `@steamfield/stacks`), the hosted API and site (`stacks-api`, live at
`https://stacks.steamfield.io`) and a recorded demo. Each task has its own file; this README
is the tracker, the decision list and the rules. Read all of it before taking a task.

## Priority

A high-quality, working demo experience comes first. Every task here exists because a
judge or the demo would see the result. Hardening, security features, production
operations and internal tidiness wait until after submission (R9) unless they break
something a judge sees. When a step looks like engineering for its own sake, skip it and
note it in R9.

## What "judge-ready" means

A judge, with no help from us, can:

1. watch a video that fits the organizer's limits;
2. open the live site and see a working directory, stack pages, dependency pages and
   stats that look believable and agree with each other;
3. install the released CLI with the command the site shows, search in plain words, get
   relevant results, and get a next step when nothing matches;
4. scaffold the demonstrated stack, have an agent build it, and see `stacks verify --all`
   go green;
5. read the source they're allowed to see;
6. do all of this during judging without the site going down or changing under them.

## How to use this folder

1. Read this README, the task file, and the files its "Read first" lists.
2. Take a row whose dependencies are `Done`. Set it `In progress` with your name in Owner.
3. Follow the steps in order. `quickstack` is `/Users/riley/Projects/quickstack` (this
   repository); `stacks-api` is `/Users/riley/Projects/stacks-api`.
4. Write evidence as you go (see "Evidence"). Never prefill a result.
5. When every "Done when" box is checked, set the row `Done`. If blocked, set
   `Blocked (<reason>)` and move to an independent row.

If a fact in a task file doesn't match what you find, record the mismatch and ask rather
than improvising.

## Tracker

| ID | Task | Depends on | Owner | State | Evidence |
| --- | --- | --- | --- | --- | --- |
| [R0](r0-baseline.md) | Baseline, in-flight work, demo scope | none | | Open | `baseline.md` |
| [R1](r1-search-contracts.md) | Search and guidance an agent can follow | R0 | | Open | `contracts.md` |
| [R2](r2-seed.md) | Seed data that looks right on the site | R0 | | Open | `seed-quality.md` |
| [R3](r3-recipe-proof.md) | Fresh proof for the demo recipe | R0; S5, S8 | | Open | `recipe-proof.md` |
| [R4](r4-website.md) | Website demo polish | R0; R2 sample for the walkthrough | | Open | `web.md` |
| [R10](r10-judge-access.md) | Judge-facing docs and source access | R0; S6 | | Open | `judge-access.md` |
| [R12](r12-web-search.md) | Website search page | R0; R13 for the final walkthrough | | Open | `web-search.md` |
| [R13](r13-search-relevance.md) | Search relevance tuning from manual QA | R0 | | Open | `search-relevance.md` |
| [R5](r5-release.md) | Release and deploy | R1, R2, R3, R4, R10, R12, R13 | | Open | `release.md` |
| [R6](r6-submission.md) | Record the demo and submit | R5 | | Open | `submission.md` |
| [R11](r11-judging-operations.md) | Keep it up during judging | R5 | | Open | `operations.md` |
| [R9](r9-follow-up.md) | After submission | R6 | | Open | per item |

R7 (signed remote distribution) and R8 (live telemetry launch) were dropped for the
deadline and live in R9. IDs are kept so earlier references still make sense.

```text
R0 ──┬─> R1 ───────────────┐
     ├─> R2 ──> R4 (walk) ─┤
     ├─> R3 ───────────────┤
     ├─> R4 (fixes) ───────┼─> R5 ──┬─> R6
     ├─> R10 ──────────────┤        └─> R11
     ├─> R13 ──> R12 (walk)┤
     └─> R12 (build) ──────┘
```

R1, R2, R3, R4, R10, R12 and R13 run in parallel after R0. R3 has the longest lead time (an
agent build per attempt), so start it early. R13 edits cards in `packages/cli/registry/search/`,
which is outside recipe content, so it doesn't invalidate R3's proof (R13 step 8 checks).
If R13 changes `rank.ts`, a format patch release joins R5's order.

## Decisions for the user

| ID | Decision | Recommended | State |
| --- | --- | --- | --- |
| S1 | Who runs irreversible commands (`npm publish`, `prod:seed`, `prod:deploy`, release tags, repository visibility) | The user; agents prepare the exact command and stop | Open |
| S2 | CLI release version | `@steamfield/stacks` 0.4.0. No format release is needed | Open |
| S4 | Production `STACKS_DEMO` | Leave unset, as today (stats keep the seeded-data label). Agents don't change it | Open |
| S5 | Rho sandbox example in the demo | Leave out unless organizer rules require a sponsor integration | Open |
| S6 | How judges see the private `steamfield/stacks-app` source | Invite reviewers if the rules allow; otherwise make it public with a LICENSE | Open |
| S8 | R3 proof run | `bun run bench` with `--keep`, then `verify --all` by hand. Needs a `CLAUDE_CODE_OAUTH_TOKEN` or `CODEX_ACCESS_TOKEN` from the user | Open |

S-numbers are local to this plan, separate from the project decisions log's D-numbers.
S3, S7 and S9 were folded in when the plan was cut: no `/v1/search` change remains,
`prod:seed` regenerates with R2's flags, and the user is the release owner.

## Rules for every task

User-only commands (S1). Agents never run `npm publish`, `bun run prod:seed`,
`bun run prod:deploy`, `git push --tags` or visibility changes, never write
`stacks-api/.dev/data/seeded.sqlite` or `.dev/data/active.sqlite`, and never stop a process
they didn't start. Write the command into the evidence file and hand off.

Each repository's `AGENTS.md` governs work inside it. In `stacks-api`: `bun run test`,
never `bun test`; dev servers via `bun run dev:bg`; gate is `bun run check` or `rr check`.

Scoped tests while working; each repository's full gate once on its release candidate
(R5). Don't run two whole-suite gates on one host at once.

Build only what the task asks. If a fix fails twice with no new information, stop and ask.

## Evidence

Each task writes `plans/runs/2026-10-28-submission-readiness/<file>` in this repository:
commands run (with repository and commit), versions, inputs, what you observed (including
failures), and what's left. No credentials or home paths.

## Facts (verified 2026-10-28)

| Fact | Where |
| --- | --- |
| Published CLI is 0.3.1 with no `search` or hosted stats; source is also 0.3.1 | `packages/cli/package.json` |
| Format 0.4.0 is published and `stacks-api` `main` uses it; production still runs the older API, so a CLI from `main` falls back to local search until R5 deploys | `plans/HANDOFF.md` |
| A release-build CLI only talks to production (`STACKS_DEV_API_URL` is ignored) | `packages/cli/src/config.ts:227-240` |
| `prod:deploy` and `prod:seed` build the catalog from the user's quickstack checkout (`$STACKS_CLI_DIR`) | `stacks-api/scripts/production.ts::buildIndex` |
| `prod:seed` always regenerates, ships `.dev/data/seeded.sqlite`, and defaults to `--profile default` and `--through` yesterday | `stacks-api/scripts/production.ts::seed`, `scripts/seed/index.ts:36-50` |
| An active seed run (another session) writes `.dev/data/active.sqlite`; `complete: false` at 17:17 | `sqlite3 -readonly .dev/data/active.sqlite "select value from maintenance_state where key='seed'"` |
| Canonical origin is hardcoded `https://example.com` | `stacks-api/apps/web/astro.config.mjs:135` |
| Production has no `/deps/` because `prod:deploy` doesn't set `DEPS_ENABLED` | `stacks-api/docs/operations.md:56` |
| Bench runs `verify` without `--all` | `packages/cli/scripts/bench/verify.ts:26-30` |

## Where unfinished phase 4 and 5 work lands

| Phase item not yet shipped | Row |
| --- | --- |
| 4.5e redeploy of `main`; 4.0b first live deploy | R5 |
| 4.0c bench per stack | R3 for `python-react` only; the rest R9 |
| 4.0e no source link | R10 step 4 |
| 4.2c/4.2f stats views (`IN PROGRESS`) | R4 walks them; their unmerged browser tests are R9 |
| 4.2d/4.2e allowlist names review | R4 step 1 (one skim, before `/deps/` goes live) |
| 4.2g active seed tuning | R2 |
| 4.0c/4.0d signed remote index; 4.1e/4.2d live telemetry launch | R9 |
| 4.4c, 4.4d leftovers; 4.5a judgments; 5.0 to 5.2; 4.0f, 4.3, 4.5d | R9 |

## Out of scope before submission

Accounts, ratings, AI chat, a comparison builder, search-as-you-type, seed labeling,
signed remote distribution, live telemetry, CI automation, error-detail and backoff
hardening, restore tooling, Workers, MCP, embeddings. New ideas stay out unless they fix
something a judge would see break.

## What this plan may get wrong

- Other agents are landing work; R0's inventory beats this file.
- The demo may expose a recipe defect late. Go back to R3 and cut a patch release; never
  edit demo output.
- Organizer requirements are unknown until R0 asks.

## Review record

Two ce:devils-advocate reviews on 2026-10-28 corrected the release and seed mechanics:
`prod:seed` regenerates and ships a fixed path, the deploy reads the user's checkout, a
packed CLI can't reach a local API, bench skips `--all`, and nothing stopped agents running
irreversible commands. Those corrections are in R2, R3, R5 and the rules above.

The same day the user cut the plan to the deadline: signed remote distribution (R7), the
live telemetry launch (R8), search evidence plumbing (`sameContent` and a format release),
API error details, backoff changes, restore rehearsal, host hardening and most
judging-window operations moved to R9. The priority is a working, polished demo.
