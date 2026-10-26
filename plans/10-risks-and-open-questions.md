# Risks and open questions

Status: DRAFT 2026-10-26, from the assumptions and open questions in
[PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md#assumptions).

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Agents don't follow a long brief faithfully (confidence medium at 3,000 words, low at 10,000) | Skipped instructions show up as incomplete projects that still look finished; this is the assumption the problem statement says to test next | Set the brief budget (D5) before the second stack; run a large and a small brief and count hesitations and skipped instructions |
| Stack prose grows without a budget | Briefs tripled in size across the first five stacks; past a point nobody cuts them | `validate` enforces the budget (D5); detail that only one project needs goes into a fragment |
| Version-less prose rots anyway (confidence medium) | The product's main advantage over templates is unproven past one stack | Record prose edits per stack per quarter; the canary (P4, or earlier under D8) |
| `verify` isn't enough to keep an agent honest (confidence medium) | An agent can reach green with no-op targets or weakened tests, and the user trusts a project they shouldn't | Tamper detection on verify steps; the brief forbids weakening a step; inspect projects from P2 runs for no-op targets and weakened tests |
| Stacks are only tested by hand | The only quality signal is a manual end-to-end run nobody has time for; stacks silently break | Record every run (P2); the canary (D8) |
| Nobody besides the author writes a stack (confidence low) | Jobs 3 and 4 and the registry plans assume they will | Make release 1 worth using with bundled stacks alone; watch for any outside stack before investing in third-party sources |
| A community registry never forms (confidence low) | Work on third-party sources and a directory would be wasted | Third-party sources wait until someone outside asks for them |
| The entry point is wrong (confidence low) | Handoff to the agent on PATH matches how the author works, not necessarily anyone else | Support both entry points and measure which is used (D9) |
| Third-party stacks ship hooks or scripts the user's agent will run | A source is a supply-chain path into the user's machine | The CLI never runs entry commands (D2); untrusted origins are marked in `list --json`; design source trust (pinning, first-use listing of executables, confirmation) before third-party sources ship |
| The base stack ships a Bun binary, but users arrive through `npx` | Without a Node-runnable package, the problem statement's first command fails | Decide A1 in P0 ([01](01-architecture.md#a1-distribution-open)); e2e tests the artifact that's actually published |
| The name is taken before it's published | `stacks` was lost this way | Reserve `quickstacks` on npm in P0 |

## Open questions for the maintainers

1. Who is the bundled registry for: a community catalog, or the author's own stack
   written down once? Proposal D6 picks the catalog. The answer decides which entries
   ship bundled.
2. What is the brief budget, per stack and for stack plus fragments? Proposal D5.
3. Does the canary belong before `add` and authoring? Proposal D8.
4. Which stack goes first in P1? Ideally one with a small brief and a dev server, so P1
   exercises every verify layer in D7 without testing the long-brief assumption at the
   same time.
5. Should there be usage telemetry, and if so opt-in or opt-out? Two success measures
   ("finishes without help" across real users, "people write their own") can't be
   collected without it.
6. Does `quickstack` (the repo name) need reserving on npm as well as `quickstacks`, to
   stop a lookalike?
