# Phase 1.6b: MVP gate runs

Status: DRAFT 2026-10-26 (not agreed). Revised 2026-10-26: runs use a compiled binary or
a packed tarball, since packaging (0.2) moved to the final step before public release;
the "release tarball" this file ends with is produced by 1.6c in that case. With 1.6a now
bringing the whole catalog into v1 and validating it, D20 implies one run per bundled stack unless the maintainers
narrow it to D13's three

| Field | Value |
|---|---|
| Goal | One recorded green `new --sandbox` run per bundled stack, from the packed tarball, with zero interventions and `tamperCheck: "full"` (D20), each written up in `plans/runs/` with the repo commit, brief size, `firstTestPassAt`, `firstGreenAt` and a by-hand check of the deliverables. Ends with one release tarball, identified by file digest, that 1.6c publishes |
| Traces to | Assumption "Agents can follow a 3,000 to 10,000 word brief faithfully ... The first assumption is the one to test next"; the problem statement's assumption that a stack is only known to work once an agent has taken it to a green `verify` since its last change; D5 (the brief budget is a hypothesis, and these runs are its first evidence); success rows "The agent finishes without help", "It's faster than by hand (target: under 20 minutes for a sandbox run)"; the developer under time pressure: "Success is time to first passing test" |
| Depends on | 1.6a (stack content), 1.6d (guardrail hooks), 1.3b (tamper check, run records, `firstGreenAt`, `firstTestPassAt`), 1.4 (handoff), and a compiled binary (0.1's build) or a packed tarball (0.2, if it has landed) |
| Blocks | 1.6c (publishes the tarball this ends with), 2.0c (imports these runs into the ledger) |
| Decisions needed | D20 (the gate rule) before the first run counts; if the maintainers choose a weaker rule, this sub-phase still records every run the same way and only the pass line changes. [Open question 8](../risks-and-open-questions.md#open-questions-for-the-maintainers) (is `## Asked` good enough to count interventions in interactive runs): runs proceed on the proposed yes, with the maintainer's own observation as the second source. [Open question 22](../risks-and-open-questions.md#open-questions-for-the-maintainers) (20 minutes to green as the stand-in for time to first passing test): both times are recorded either way. D24 (headless auth) only matters if a run uses a token login |
| Settles | Assumption 1's first measured pairs of brief size and time to green, which are the evidence D5's budget is judged on; open question 4's first stack in practice; whether `bun pm pack` output is reproducible from a commit |

## Where this fits

1.6a wrote the stacks and proved they pack, and 1.6d wrote the guardrail hooks. This sub-phase runs each one through a real
agent from the tarball that ships, fixes what the runs show, and reruns until every stack
has a passing run against one final tarball. 1.6c publishes exactly that tarball and
records the gate as an exit criterion. Nothing here touches CI; the bench that automates
these runs is 2.0b, and scheduling them is 5.1.

## Scope

In:

- Packing the release candidate at the version 1.6c will publish, and recording its
  digest.
- One gate run per stack, in the order `astro-blog`, `go-cli`, `python-react`, and reruns
  after fixes.
- Prose fixes in the 1.6a and 1.6d entry files, and CLI fixes in the owning sub-phase's code with a
  regression test first.
- A run note per run in [plans/runs/](../runs/README.md), and the first data point on
  assumption 1 in [risks-and-open-questions.md](../risks-and-open-questions.md#risks).

Out:

- The bench (2.0b). Decided in the roadmap: 2.0b is not built before the gate, because
  three runs by hand cost less than the bench. If the gate needs more than about six
  reruns in total across the three stacks, stop, pull 2.0b forward, and record why in this
  file's "Rerun log" before continuing.
- Publishing (1.6c) and any CI change (phase 5).
- A success rate. One passing run per stack shows the stack can work; it does not show how
  often (2.0b, 5.1).

## Design

### Who does what

| Step | Who |
|---|---|
| Pack, record digests, prepare run directories and the clean agent environment | Agent |
| Launch a gate run that needs a maintainer's agent login (an interactive handoff under their subscription), and confirm nothing was typed after the prompt | Maintainers |
| Launch a gate run that can use a token the maintainers provided for this purpose (D24's mechanism) | Agent, if the maintainers provide the token; otherwise maintainers |
| Independent `verify --json`, collect `runs.jsonl` and the state record, check deliverables by hand, write the run note | Agent |
| Prose and CLI fixes, `validate`, rerun decision | Agent, reviewed by the maintainers |

A maintainer confirms every run that counts toward the gate, because "no intervention" is
partly an observation.

### The release candidate

1. Set `packages/cli/package.json` `version` to the version 1.6c will publish (0.0's
   reservation decides it; `0.1.0` unless it says otherwise). Check
   `npm view quickstacks versions` first: a version already on npm can't be published,
   and changing it later changes the tarball.
2. Commit. Pack from a clean checkout of that commit the way 0.2 packs (`bun pm pack`).
3. Record the tarball's sha256 and the commit. Keep the file outside the repo (so
   `bun run clean` can't remove it), at a path written in the run note.
4. Pack the same commit a second time and compare digests. Record whether packing is
   reproducible: if it is, a lost tarball can be rebuilt from the commit; if not, the kept
   file is the only copy.
5. Install it into a fresh prefix (`npm install -g --prefix <tmp> <tarball>`) and put that
   prefix's `bin` first on PATH.
6. Check the invocation the brief will tell the agent to use: run
   `new astro-blog <tmp> --sandbox --no-launch --json` and read the verify command in the
   brief. It must be the installed `quickstacks`, which the contract gives for any install outside
   npm's npx cache. If it is `npx -y quickstacks@<version>` (see roadmap, Contracts: Invocation string), the
   agent would fetch from npm, where this version doesn't exist yet: stop and raise it
   against the `Host.invocation` contract (0.2, 1.1) rather than working around it.

### One gate run

On a machine with the stack's tools installed and nothing listening on the stack's
default ports.

1. Make a fresh empty directory outside any git repo, and a fresh `HOME` with fresh
   `XDG_*` directories. The agent gets no personal instruction or memory files and no
   copied credential files (D24): either a maintainer logs in fresh inside that HOME, or
   the run uses a token passed through the environment. Record which.
2. `quickstacks new <stack> run --sandbox` and let the handoff launch the agent (this also
   tests 1.4).
3. Nobody types after the prompt. If the agent asks a question, the answer is "use the
   default", and the run no longer counts toward D20 (it is still recorded).
4. Cap the run at 60 minutes of agent time. A run still going at the cap is stopped and
   recorded `failed`.
5. When the agent stops, run `quickstacks verify --json` from the project yourself. The
   agent's claim of green doesn't count.
6. Check the deliverables by hand, because verify only checks exit codes and probes, so a
   run can pass verify with deliverables missing: the proving slice named in the stack's Setup exists and works
   (open the page and the RSS route; run the command and `--version`; load the page that
   calls the API route); project commands verify calls do real work (no `exit 0` or `echo`
   targets, no skipped or deleted tests); AGENTS.md has no `quickstacks:fill` left and
   matches the real commands. Anything missing makes the run `partial`, whatever verify
   said.
7. Write the run note (below).

A run passes the gate when all of these hold: the independent verify is `green` with
`tamperCheck: "full"` (see roadmap, Trust model point 5; `manifest-only` never passes),
`## Asked` in `.quickstacks/NOTES.md` is empty and the maintainer typed nothing, and the
deliverables check found nothing missing.

### Run notes

One file per run, `plans/runs/<date>-<stack>.md` (`-<n>` for a second the same day), with
every field in [runs/README.md](../runs/README.md). Where each comes from:

| Field | Source |
|---|---|
| Repo commit, CLI | The release candidate's commit and tarball sha256 |
| Brief size | `briefWords` from the `new --json` result; `fixedWords` from the same result (see roadmap, Contracts: Word count) |
| Times | `firstTestPassAt - createdAt` and `firstGreenAt - createdAt` from the project state record (see roadmap, Contracts: Project state record), in minutes. Report both against the 20-minute target (open question 22) |
| Verify count | Lines in `.quickstacks/state/runs.jsonl` (see roadmap, Contracts: Run record) |
| Interventions | `## Asked` lines, plus anything the maintainer typed |
| Outcome | `green`, `partial`, `failed` or `infra`, with `tamperCheck` |
| Findings | The `## Findings` lines worth acting on, each with the fix it led to; `NOTES.md` copied in full at the end; the deliverables check result |

Also record: agent and version, how it was launched and who launched it, and the clean
HOME method. Copy `runs.jsonl` into the note as a fenced block so 2.0c can import it.

### Fixing and rerunning

Fix the stack prose for every hesitation or wrong turn the notes show, rerun `validate`,
and rerun the stack. A run fails on CLI behavior (verify, handoff, scaffold): fix it in
the owning sub-phase's code with a failing regression test first, then rerun.

Every fix changes the tarball, so earlier passing runs have to be shown to still apply.
The release tarball is the one the last passing run used. An earlier passing run for
another stack still counts if, comparing its tarball with the release tarball unpacked,
the only differing files are under entry directories that stack's composition doesn't
use. Any difference in `dist/`, `package.json`, or a fragment the stack composes (so any
change to `agent-ops`, `git-hooks` or `ci-github`) means that stack reruns. Record the
comparison in the final run note.

### Rerun log

Kept in this file while the sub-phase runs: one line per run (date, stack, outcome, why it
was rerun). Past about six reruns in total, the 2.0b decision above applies.

### Failure modes

| Case | What happens |
|---|---|
| A gate run fails on CLI behavior | Fix in the owning sub-phase's code with a regression test first, repack, rerun |
| A gate run fails on prose | Fix the entry, `validate`, repack, rerun |
| The near-cap stack goes green but slowly or with skipped instructions | Record it; this is the assumption-1 data point and evidence against D5's cap. Raise a D5 change before more stacks are written |
| The agent can't write its config directories, or the CLI's state directory, inside its sandbox | Run with the agent's sandbox loosened for the gate and record it for 2.0b's design. A missing state record gives `tamperCheck: "manifest-only"`, which can't pass |
| Default ports are busy on the gate machine | Free them before the run, stopping only processes you started; otherwise use another machine and record the run as `infra`. Overriding `PORT_*` when running `new` does nothing, because verify applies env when it runs (1.3a), and the agent runs verify itself, so the gate runs on the defaults |
| The agent login expires or the machine fails mid-run | `infra`; rerun, and don't count it toward the six |
| More than about six reruns | Pull 2.0b forward; write why in the rerun log |

## Files and areas touched

| Path | Change |
|---|---|
| `plans/runs/<date>-<stack>.md` | One note per run |
| `packages/cli/registry/` | Prose fixes from run findings |
| CLI code in the owning sub-phase's areas | Fixes found by runs, each with a regression test |
| `packages/cli/package.json` | `version` |
| `plans/risks-and-open-questions.md` | Assumption 1's first data point in the first risk row |
| This file | Rerun log |

## Acceptance tests

- Three run notes, one per stack, each a pass by the rule above, each listing the same
  release tarball digest or a recorded comparison showing why its run still applies.
- Each note has every field in [runs/README.md](../runs/README.md), both times, and the
  deliverables check.
- Every CLI fix has a regression test that failed before the fix.
- `validate` over the bundled registry still has zero errors and zero warnings at the
  release commit.

## Exit criteria

- `bun run check` green from the repo root at the release commit.
- Every bundled stack has one passing gate run (D20), recorded.
- The release tarball's path, sha256, commit and reproducibility result are written in
  the last run note, for 1.6c.
- `HANDOFF.md` links the run notes and states assumption 1's first result, and what it
  says about D5's budget, in one sentence each.

## What this plan may get wrong

- One run per stack is one sample. The notes say so rather than claiming a rate.
- The gate is run by the people who wrote the stacks, who know what the prose meant. The
  no-typing rule, the independent verify and the deliverables check limit that bias but
  don't remove it.
- `## Asked` is self-reported (open question 8). A maintainer watching the run is the
  check on it; a headless bench run (2.0b) measures it better.
- The six-rerun threshold is a guess at where hand runs cost more than the bench.
- If packing isn't reproducible and the tarball is lost, the whole gate reruns. Keeping
  the file is cheap; losing it is not.
