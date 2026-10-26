# Phase 2.1: The canary

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Every bundled stack is rebuilt by a real agent on a schedule, against current upstream versions, and the maintainers hear about it within a day when a stack that passed stops passing without anyone changing its prose |
| Traces to | Open question "How does a stack prove it still works? Manual end-to-end runs don't scale past a handful of stacks. The canary ... is the product's CI and probably belongs earlier"; success row "Stacks don't rot: A stack that passed last month still passes this month without a prose change"; assumption "Version-less prose rots much more slowly than templates ... How to validate: The scheduled canary; count prose edits per stack per quarter" |
| Depends on | 2.0 (bench script, ledger, fingerprint) |
| Blocks | 4.0 (publishes canary results in the registry index) |
| Decisions needed | D15: where the canary runs and on whose agent account. This sub-phase can't start its scheduling work without it. D8 (canary right after the MVP) is assumed |
| Decisions or questions this settles | The schedule, the report format, the rot signal, the cost and time caps, and the quarterly prose-edit count assumption 2 asks for |

## Scope

In:

- A runner that benches every bundled stack (default fragments, sandbox preset) with each
  configured agent, one at a time, on a schedule.
- Classification of each result against the previous record for the same key.
- Reports: a ledger change proposed as a PR, and an issue when rot is detected.
- Caps on wall time per run and runs per week.
- A quarterly report of prose edits per stack, from git history.

Out:

- Running optional-fragment combinations on a schedule (one combination per stack
  per month at most, added only if a stack's optional fragments start failing in
  user reports).
- Any canary inside GitHub-hosted CI with stored model API keys, unless D15 says so.
  The base project's rule is no inference in CI; this sub-phase keeps it unless the
  maintainers decide otherwise.
- Repairing a stack automatically. The canary reports; a person or an agent session
  fixes prose with the run note in hand.

## Design

### Where it runs (D15, proposed)

D15's proposal: a machine the maintainers control (a workstation or a small always-on
box) with the agent CLIs installed and logged in under a maintainer's own subscription,
triggered by the OS scheduler (`launchd` on macOS, a systemd timer on Linux). It pushes
results to the repo with a token scoped to opening PRs and issues. Alternatives for the
maintainers to weigh:

| Option | What it costs | What it risks |
|---|---|---|
| Maintainer-controlled machine, subscription login (proposal) | One machine, one agent subscription, no per-token billing | Machine offline means no canary that day; the report says "missed" so silence is never mistaken for green |
| Self-hosted GitHub runner on that machine, scheduled workflow | Same, plus runner upkeep | Runner token on a machine that also holds an agent login |
| GitHub-hosted runner with a model API key secret | Pay per token; simplest scheduling | Inference in CI, a long-lived key in repo secrets, and costs that scale with stack count |

### Schedule and caps

| Setting | Default | Why |
|---|---|---|
| Frequency | Each stack weekly, staggered so one stack runs per night | Upstream majors move on the scale of weeks; daily runs cost seven times more for little extra signal |
| Agents | The first configured agent every week; each other configured agent once a month | Agent changes cause failures too, but the stack signal comes from one steady agent |
| Wall time per run | 60 minutes, then killed and recorded `fail` with `timeout` | Twice the slowest MVP gate run; a run that needs more is itself a finding |
| Runs per week | 10, hard cap in the runner | Bounds subscription usage; extra runs queue to the next night |
| Concurrency | One run at a time | Port and CPU contention would make failures about the machine |

The runner is `packages/cli/scripts/canary.ts`: reads a small config file
(`packages/cli/scripts/canary.json`, committed: stacks, agents, caps), picks tonight's
stack, calls the bench (2.0) with `--max-minutes`, then classifies and reports.

### Classification

For each new record, the runner finds the previous record with the same stack, `with`,
preset and agent, and compares results and fingerprints:

| Previous | Now | Fingerprint | Class | Report |
|---|---|---|---|---|
| pass | pass | any | `green` | Ledger PR only (batched weekly) |
| pass | fail | same | `rot` | Issue: "<stack> stopped passing with no prose change" plus ledger PR |
| pass | fail | different | `regression` | Issue: "<stack> fails after its last prose change" |
| fail | pass | any | `recovered` | Comment on and close the open issue |
| fail | fail | any | `still-failing` | Comment on the open issue with the new run note; no new issue |
| none | any | any | `first` | Ledger PR |
| any | timeout | any | `fail` path as above, note says timeout | |

`rot` is the signal assumption 2 is about: the prose didn't move, the world did. The
quarterly count of `rot` issues per stack, beside the count of prose edits, is the
number that says whether version-less prose ages slower than a template would. A
`rot` that keeps recurring for one tool is a candidate for a verify step that asks the
tool (a framework's own doctor command), per the content rules in 1.6.

Before opening a `rot` issue the runner reruns the stack once. Two failures in a row
open the issue; a pass on the rerun is recorded as `flaky` in the ledger note and noted
in the weekly PR. This keeps a single network blip from paging anyone.

### Report contents

The issue body has: stack, agent, CLI version, fingerprint, the failing verify steps
with exit codes and the last 40 lines of each step's output from the verify report,
time to the failure, the agent's `NOTES.md` (which usually says what changed upstream),
and links to the previous passing record. No machine paths, usernames or tokens: the
runner rewrites the throwaway directory and `HOME` paths to placeholders before
posting.

### Quarterly prose report

`scripts/canary.ts --quarterly` prints, per stack: commits touching the entry in the
last quarter, `rot` issues, `regression` issues, median time to green, and pass rate
across canary runs. The maintainers paste it into HANDOFF or a run note; it is the
validation row for assumption 2.

### Failure modes

| Case | Handling |
|---|---|
| Machine asleep or offline at the scheduled time | Next run notices the missed night (gap in ledger dates) and the weekly PR lists missed stacks |
| Agent login expired | Bench fails before scaffolding; runner opens one issue labeled `canary-infra`, not `rot` |
| GitHub API unavailable | Results stay in a local outbox file and are posted on the next run |
| A run hangs past the cap | Process group killed by the bench; recorded as timeout |
| Two scheduler triggers overlap | Lock file in the runner's state directory; the second exits 0 |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/scripts/canary.ts`, `packages/cli/scripts/canary.json` | runner and config |
| `packages/cli/scripts/canary/classify.ts`, `report.ts` | pure classification; issue and PR text |
| `packages/cli/tests/canary.test.ts` | below |
| `docs/canary.md` (repo docs) | how to install the schedule on the canary machine, which token scopes it needs, how to pause it |
| repo `AGENTS.md` | the canary's existence and where its issues land |

The scheduler unit files (`launchd` plist, systemd timer) are documented in
`docs/canary.md` as text to copy, not committed as installers.

## Acceptance tests

- `classify` table test covering every row above, including the rerun-before-`rot`
  rule.
- Report text never contains the throwaway paths or the home path (assert placeholders
  over a record built from real temp dirs).
- Runner with a fake bench (the 2.0 fake-agent fixture): picks the right stack for a
  given date, respects the weekly cap, writes to the outbox when the GitHub client fails,
  exits 0 when the lock is held.
- `--quarterly` against a fixture git history and ledger prints the expected counts.
- One real scheduled run on the canary machine, by the maintainers, posting a ledger PR.

## Exit criteria

- `bun run check` green from the repo root.
- D15 agreed and recorded in the README decisions log.
- The canary has run each bundled stack at least once on schedule, and one deliberately
  broken fixture branch has produced a `regression` issue and then a `recovered` close.
- `docs/canary.md` and `AGENTS.md` updated; HANDOFF lists the canary machine's owner role
  (maintainers) and how to pause it.

## What this plan may get wrong

- Weekly may be too slow for a fast-moving stack and too fast for a stable one. The
  config allows per-stack frequency; set it from the first quarter's `rot` counts.
- A subscription-based agent account may have usage limits that change. The weekly cap
  is the lever; if limits tighten, drop the monthly second-agent runs first.
- `rot` assumes the fingerprint covers everything the agent read. It doesn't cover the
  CLI's brief text by design (2.0), so a CLI release can cause a failure classed as `rot`.
  The issue includes the CLI version so a person can tell the difference.
