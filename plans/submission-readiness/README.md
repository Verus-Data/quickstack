# Submission readiness

Status: DRAFT 2026-10-28. Reviewed twice by ce:devils-advocate; implementation has not started.
This folder replaces `plans/submission-readiness-rfc.md`.

This is the queue of work between today and a judge-ready submission of stacks: the CLI
(this repository, published as `@steamfield/stacks`), the hosted API and site
(`stacks-api`, deployed at `https://stacks.steamfield.io`) and a recorded demo. Each task
has its own file. This README is the index, the tracker, the decision log and the rules
every task follows. Read all of this file before taking a task.

## What "judge-ready" means

A judge, with no help from us, can:

1. read the submission and watch a video that fits the organizer's limits;
2. open the live site and see a working directory, stack pages, dependency pages and
   stats that agree with each other;
3. install the released CLI with the command the site shows, run
   `stacks search "<their words>"`, get relevant results ranked by the hosted API, and
   get a useful next step when nothing matches;
4. scaffold the demonstrated stack, have an agent build it, and see `stacks verify --all`
   go green with meaningful assertions;
5. read the source they are entitled to see;
6. do all of the above during the judging window without the service being down or
   redeployed under them.

Rows R0 to R6, R10 and R11 deliver that. R8 and R9 come after submission.

## How to use this folder

1. Read this README, then the task file, then every file the task's "Read first" lists.
2. Check the tracker below. Take only a row whose dependencies are `Done` (or whose
   file says which part can start early). Change its state to `In progress` and put your
   session or agent name in the Owner column in the same commit as your first change.
3. Follow the task's steps in order. Steps say which repository each command runs in.
   `quickstack` means `/Users/riley/Projects/quickstack` (this repository); `stacks-api`
   means `/Users/riley/Projects/stacks-api`.
4. Write evidence as you go into the task's evidence file (see "Evidence"). Never prefill
   a result you have not observed.
5. When every "Done when" box is checked with evidence, set the row to `Done` and link
   the evidence. If you stop early, set it to `Blocked` or leave it `In progress`, and write
   what's missing in the evidence file.

If a step's facts don't match what you find (a file moved, a flag doesn't exist, a
command fails in a way the file doesn't predict), stop and record the mismatch in the
evidence file. Don't improvise a different procedure for anything marked "user only".

## Tracker

States: `Open`, `In progress`, `Blocked (<reason>)`, `Done`. Update this table in place.

| ID | Pri | Task | Depends on | Owner | State | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| [R0](r0-baseline.md) | P0 | Release baseline, in-flight work inventory, demo scope | none | | Open | `baseline.md` |
| [R1](r1-search-contracts.md) | P0 | Compatible search and clear agent contracts | R0; D2, D3 | | Open | `contracts.md` |
| [R2](r2-seed.md) | P0 | Realistic active seed with a quality report | R0 | | Open | `seed-quality.md` |
| [R3](r3-recipe-proof.md) | P0 | Fresh proof for the demonstrated recipe | R0; D5, D8 | | Open | `recipe-proof.md` |
| [R4](r4-website.md) | P0 | Website decision and handoff gaps | R0; R2 sample for final QA | | Open | `web.md` |
| [R10](r10-judge-access.md) | P0 | Source access and judge-facing docs | R0; D6 | | Open | `judge-access.md` |
| [R5](r5-release.md) | P0 | Coordinated release and deployed acceptance | R1, R2, R3, R4, R10 | | Open | `release.md` |
| [R6](r6-submission.md) | P0 | Recorded demo, reconciled plans, submission | R5 | | Open | `submission.md` |
| [R11](r11-judging-operations.md) | P0 | Judging-window freeze, monitoring and fallback kit | R5 | | Open | `operations.md` |
| R7 | | Signed remote-only recipe discovery: dropped 2026-10-28, deferred in R9 | | | Dropped | |
| [R8](r8-telemetry-launch.md) | P1 | Live telemetry collection | R6 | | Open | `telemetry-launch.md` |
| [R9](r9-follow-up.md) | P1/P2 | Scheduled proof and later product work | R6 | | Open | per item |

IDs are stable; R10 and R11 were added in the second review, so they are numbered after R9
but belong to the P0 set.

```text
R0 ──┬─> R1 ──────────────┐
     ├─> R2 ──> R4 (final)├─> R5 ──┬─> R6
     ├─> R3 ──────────────┤        └─> R11
     ├─> R4 (start) ──────┤
     └─> R10 ─────────────┘
R6 ──> R8, R9
```

After R0, R1, R2, R3, R4 and R10 run in parallel. R1's format publication (D2) is on the
critical path: start it first. R6 and R11 both start once R5 is done; R11's freeze begins
at submission.

## Decisions

The user decides these. Each has a recommended default; a task that depends on an `Open`
decision stops at that step and asks. Record the answer and date here when it's made.

| ID | Decision | Recommended | State |
| --- | --- | --- | --- |
| D1 | Who runs irreversible commands (`npm publish`, `prod:seed`, `prod:deploy`, anything with `--replace-production-data`, git pushes of release tags, repository visibility changes) | The user. Agents prepare the exact command, inputs and expected digests in the evidence file and stop | Open |
| D2 | Versions | `@steamfield/stacks-format` 0.5.0 (R1 adds optional fields and changes ranking: a minor bump per `packages/format/README.md`); `@steamfield/stacks` 0.4.0 | Open |
| D3 | `/v1/search` changes in place, or gets a `/v2` group as `stacks-api/.claude/rules/api/http-contract.md` requires for retyped fields | In place, if R0 confirms no published CLI calls `/v1/search` (0.3.1 has no `search`). Record the exception in `contracts.md` | Open |
| D4 | Production `STACKS_DEMO` value | Leave it unset (`false`), as production runs today, so stats keep the `seeded development data` population. Labeling work is out of scope; this decision only stops agents changing the value | Open |
| D5 | Demo scope: local starter only, or add the Rho sandbox example from `product/DEMO_OUTLINE.md` | Local starter only, unless organizer rules require a sponsor integration (R0 finds out) | Open |
| D6 | How judges see `stacks-api` source (`steamfield/stacks-app` is private and has no LICENSE; `steamfield/stacks` is public with a LICENSE) | Depends on organizer rules. If source must be public, add a LICENSE and run R10's pre-publication audit before the user flips visibility; otherwise grant reviewers access | Open |
| D7 | How the final seed reaches production | Regenerate with `prod:seed` using the exact flags recorded by R2 (about an hour). Don't build artifact-reuse tooling for this submission | Open |
| D8 | R3 proof route | `bun run bench` with the packed CLI and `--keep`, then `verify --all` by hand in the kept project. Needs a `CLAUDE_CODE_OAUTH_TOKEN` or `CODEX_ACCESS_TOKEN` the user provides | Open |
| D9 | Release coordinator and demo owner | The user for both; agents assist | Open |

## Rules for every task

These add to each repository's `AGENTS.md`; where they conflict, the stricter rule wins.

Safety. Agents never run `npm publish`, `npm unpublish`, `npm dist-tag`, `bun run prod:seed`,
`bun run prod:deploy`, any command with `--replace-production-data`, `git push --tags`, or
`gh repo edit --visibility`. Agents never write to the production host's volumes or the
deployed database, never copy a seed store into `stacks-api/.dev/data/seeded.sqlite`
(the file `prod:seed` ships), and never stop or kill a process they didn't start (the
in-flight active seed run in `stacks-api` is pid-owned by another session). When a step
needs one of these, write the exact command and its preconditions into the evidence file
and hand off to the user.

Repositories. Each repository's own `AGENTS.md` governs work inside it: in `stacks-api`,
tests run through `bun run test` (never `bun test`), dev servers through `bun run dev:bg`, and
the full gate is `bun run check` or `rr check`. In `quickstack`, follow its `AGENTS.md`
equally. Read the path-scoped rules for files you change.

Testing. Scoped tests while working (a file or `-t` filter). Each repository's full gate
once on its final candidate, and again only after a fix to something the gate found.
Read pass, fail and skip counts. Never run two whole-suite gates on the same host at once.
Cross-repository checks use the published format package, never a checkout alias.

Contracts. Shared wire schemas and ranking live in `quickstack/packages/format`; CLI
orchestration in `quickstack/packages/cli`; HTTP validation in
`stacks-api/packages/contract`. Prefer additive optional fields. A changed public
contract updates its one owner and its tests, and follows R5's release order.

Scope. Build only what the task asks. Mention unrelated problems in the evidence file
instead of fixing them. Don't mark old phase files complete unless the task says so.

Stopping. If a fix fails twice with no new diagnostic, stop, write what you learned and
two or three hypotheses into the evidence file, and ask the user. If credentials, a
decision or organizer details block a task, mark it `Blocked (<reason>)` and move to an
independent row.

## Evidence

Every task writes to `plans/runs/2026-10-28-submission-readiness/<file>` in this
repository (file names in the tracker). Create the file when you start. Record:

- the commands you ran, from which repository and commit (`git rev-parse --short HEAD`);
- versions (`npm view`, `package.json`), digests and dates;
- inputs (seed flags, profile versions, fragment lists, model and agent);
- what you observed, including failures and skip counts, quoted from output where short;
- what remains open, and why.

Omit credentials, tokens and home-directory paths (write `~/` instead).

## Facts every task can rely on (verified 2026-10-28)

| Fact | Where |
| --- | --- |
| Published CLI is 0.3.1 and has no `search` or hosted stats; source is also versioned 0.3.1 | `packages/cli/package.json`, `npm view @steamfield/stacks version` |
| Published and source format are both 0.4.0; `stacks-api` takes `^0.4.0` | `packages/format/package.json`, `stacks-api/package.json` catalog |
| Production still serves the pre-0.4.0 penalty encoding; a CLI built from `main` can't decode it and falls back to local ranking | `plans/HANDOFF.md` "Earlier phase 4 handoff" item 1 |
| `bin.ts::DEFAULT_API_URL` is `https://stacks.steamfield.io`; `officialUrl` (remote index) is `undefined` | `packages/cli/src/bin.ts:100-114` |
| A release-build CLI ignores `STACKS_DEV_API_URL`, so a packed CLI only talks to production | `packages/cli/src/config.ts:227-240`, `scripts/build.ts` sets `STACKS_RELEASE_BUILD` |
| `prod:deploy` and `prod:seed` build the hosted index from whatever `$STACKS_CLI_DIR` (the user's quickstack checkout) holds | `stacks-api/scripts/production.ts::buildIndex` |
| `prod:seed` always regenerates (the input digest includes a build timestamp), ships `.dev/data/seeded.sqlite`, defaults to `--profile default` and `--through` yesterday | `stacks-api/scripts/production.ts::seed`, `scripts/seed/index.ts:36-50` |
| The active seed run started 2026-10-28 writes `.dev/data/active.sqlite` and was `complete: false` at 17:17 | `stacks-api`: `sqlite3 -readonly .dev/data/active.sqlite "select value from maintenance_state where key='seed'"` |
| The site's canonical origin is hardcoded `site: "https://example.com"` | `stacks-api/apps/web/astro.config.mjs:135` |
| Production has no dependency pages because `prod:deploy` doesn't set `DEPS_ENABLED` | `stacks-api/docs/operations.md:56`, `scripts/production.ts:171` |
| `prod:seed` backs volumes up to `~/stacks-backups/telemetry-<ts>.tgz` on the host; no script restores them | `stacks-api/scripts/production.ts::seed` |
| Bench runs `verify --json` without `--all` | `packages/cli/scripts/bench/verify.ts:26-30` |
| API search answers any bad `q` with an empty `BadInput({})` | `stacks-api/apps/api/src/handlers/search.ts:13` |

## Where unfinished phase 4 and 5 work lands

Checked 2026-10-28 against every phase file's status line and dated notes. Executed
phases whose only leftovers are below are otherwise done.

| Phase item not yet shipped | Row |
| --- | --- |
| 4.0b first live deploy and hosted CI run; 4.5e redeploy of `main` | R5 (deploy); CI is R9 (5.0) |
| 4.0c "rerun the bench per stack so the index proves something" | R3 for `python-react`; other stacks R9 "Wider library proof". Judges will see no ledger run on the other stacks; the site already says so honestly |
| 4.0c/4.0d index key and official index URL | R9 (deferred: the CLI ships its catalog in the bundle) |
| 4.0e no source link until a public repository | R10 step 5 |
| 4.1a/4.1e live telemetry launch, production acceptance, alert destination | R8; the uptime half of alerts is R11 step 2 |
| 4.2b site tests 10 and 11; 4.2c telemetry views; 4.2f stats pages (both `IN PROGRESS`, acceptance tests unmerged on `delegate/t-4.2f`) | R4 step 1a |
| 4.2d production rerun | R8 step 4 |
| 4.2d/4.2e allowlist names review | R4 step 1 (needed before `/deps/` goes live) |
| 4.2g active seed run and its tuning | R2 |
| HANDOFF open question: index `lastRun` and local search disagree | R1 step 2 (`sameContent`) |
| HANDOFF: site index reader requires signatures | R4 step 5 notes it; production already signs with its local key, so nothing more is needed |
| 4.4c Codex link and Copilot marker; 4.4d real `npm install -g` update | R9 |
| 4.5a judgments review | R9 |
| 4.0f Workers, 4.3 MCP, 4.5d embeddings (deferred or gated) | R9, P2 |
| 5.0 CI release, 5.1 canary, 5.2 CI index build (drafts, not agreed) | R9 |

## Out of scope

Accounts, ratings, AI recommendation chat, automatic agent execution, a comparison
builder, a search UI on the site, seed-labeling changes, Workers/D1, MCP, embeddings.
New ideas stay out of P0 unless they fix a reproduced blocker to a judge journey above.

## What this plan may get wrong

- Other agents are landing work while this runs. R0's inventory beats this file's facts;
  update the facts table when they drift.
- Seed volume may not overcome suppression. Diagnose maturity, population and dependency
  reporting before raising scale or touching a publication gate.
- The fresh demo may expose a recipe defect after the release candidate is built. Go
  back to R3, refresh the proof, cut a new CLI version. Never edit demo output.
- Organizer requirements are unknown. R0 records them; R6 and R10 stay blocked on them.

## Review record

First ce:devils-advocate review (2026-10-28): API gate preceded its format dependency
update (R1 now owns the format publication, R5 gates the API afterwards); the blanket
no-skips rule conflicted with the sandbox build skip (R0, R3 and R6 require `verify --all`);
API content-match had no defined source (R1 leaves it unknown with no proof bonus;
publisher attestation is deferred with remote distribution in R9).

R7 (signed remote-only recipe discovery) was dropped on 2026-10-28 at the user's direction:
the submission ships its catalog inside the CLI, so remote distribution adds key handling and
two extra releases without changing what a judge sees.

Second review (2026-10-28), resolved by restructuring into this folder:

| Finding | Resolution |
| --- | --- |
| `prod:seed` can't reuse a seed artifact and can ship a stale file | D7; R2 records exact flags and uses non-default local paths; R5 step 5 gives the full `prod:seed` command and preconditions |
| Hosted catalog builds from an uncontrolled checkout | R5 requires a clean `$STACKS_CLI_DIR` at the release commit and checks `payload.commit` after deploy |
| Nothing stops agents running destructive or irreversible commands | D1 and "Rules for every task" |
| A packed CLI can't reach a local API, so R1's round-trip couldn't close before deploy | R1 tests a source-build CLI locally; the packed CLI check moves to R5 |
| Bench doesn't run `verify --all` and needs a token | D8; R3 step-by-step route |
| R1 forces a format release; the proof bonus lives in `rank.ts` | D2; R1 names `rank.ts::quality` and schedules publication first |
| `/v1/search` in-place change breaks the API contract rule | D3 |
| R4 and R5 depended on each other | R4 closes on a local build against the R2 sample; the deployed smoke is in R5 |
| Dependency pages, canonical origin and restore procedure were unnamed | R4 and R5 name the lines, tests and commands |
| `STACKS_DEMO` undecided; HANDOFF's demo-host steps conflict | D4; R5 supersedes HANDOFF items 2 to 4 |
| Wrong test path, no repro command for the EPERM failure | R0 step 6 |
| Dependency-version fixtures don't exist | R2 creates and reviews them |
| `BadInputDetails.value` is required but `q` must not echo | R1 step 5 |
| CLI writes a 10-minute backoff on any non-200, including 400 | R1 step 5 |
| npx can run a cached older CLI | R5 and R6 pin `@<version>` |
| Judge readiness lacked source access, docs and judging-window operations | New rows R10 and R11; R0 inventories in-flight worktrees |
