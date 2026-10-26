# Risks and open questions

Status: DRAFT 2026-10-26, from the assumptions and open questions in
[PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md#assumptions).

## Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Agents don't follow a long brief faithfully (confidence medium at 3,000 words, low at 10,000) | Skipped instructions show up as incomplete projects that still look finished; this is the assumption the problem statement says to test next | Set the brief budget (D5) before the second stack; run a large and a small brief and count hesitations and skipped instructions |
| Stack prose grows without a budget | Briefs tripled in size across the first five stacks; past a point nobody cuts them | `validate` enforces the budget (D5); detail that only one project needs goes into a fragment |
| Version-less prose rots anyway (confidence medium) | The product's main advantage over templates is unproven past one stack | Record prose edits per stack per quarter; the canary ([2.1](phases/phase-2.1.md), straight after the MVP under D8) |
| `verify` isn't enough to keep an agent honest (confidence medium) | An agent can reach green with no-op targets or weakened tests, and the user trusts a project they shouldn't | Tamper detection on verify steps; the brief forbids weakening a step; changed steps fail verify (D14, [1.3](phases/phase-1.3.md)); inspect projects from bench runs ([2.0](phases/phase-2.0.md)) for no-op targets and weakened tests |
| Stacks are only tested by hand | The only quality signal is a manual end-to-end run nobody has time for; stacks silently break | Run records from the MVP on ([1.3](phases/phase-1.3.md)); bench and ledger ([2.0](phases/phase-2.0.md)); the canary (D8) |
| Nobody besides the author writes a stack (confidence low) | Jobs 3 and 4 and the registry plans assume they will | Make release 1 worth using with bundled stacks alone; watch for any outside stack before investing in third-party sources |
| A community registry never forms (confidence low) | Work on third-party sources and a directory would be wasted | Third-party sources wait until someone outside asks for them |
| The entry point is wrong (confidence low) | Handoff to the agent on PATH matches how the author works, not necessarily anyone else | Support both entry points and measure which is used (D9) |
| Third-party stacks ship hooks or scripts the user's agent will run | A source is a supply-chain path into the user's machine | The CLI never runs entry commands (D2); untrusted origins are marked in `list --json`; git sources ship with pinning, a first-use listing of executables and confirmation ([3.2](phases/phase-3.2.md)) |
| The base stack ships a Bun binary, but users arrive through `npx` | Without a Node-runnable package, the problem statement's first command fails | Decide A1 in [0.2](phases/phase-0.2.md) ([roadmap](02-roadmap.md#open-architecture-questions)); e2e tests the packed tarball that's actually published |
| The name is taken before it's published | `stacks` was lost this way | Reserve `quickstacks` on npm in [0.0](phases/phase-0.0.md) |
| Agents running inside sandboxes can't write the user's state directory | The second copy of the step digest and first-green times go missing, so tamper detection falls back to the manifest's own copy | Commands still work and report `stateRecord: false`; bench runs use a writable throwaway HOME ([1.2](phases/phase-1.2.md), [2.0](phases/phase-2.0.md)) |
| The canary depends on one maintainer machine and one agent subscription (D15) | A machine that's off or a lapsed subscription looks like stacks passing silently | The canary reports its own last successful run; a missed schedule is itself an alert ([2.1](phases/phase-2.1.md)) |
| Telemetry, once added, costs trust in a tool that already hands a repo to an agent | The emotional job is trust | No collection before D17 and a published schema; the first enabled run sends nothing ([4.1a and 4.1b](phases/phase-4.1a.md)) |

## Open questions for the maintainers

1. Who is the bundled registry for: a community catalog, or the author's own stack
   written down once? Proposal D6 picks the catalog. The answer decides which entries
   ship bundled.
2. What is the brief budget, per stack and for stack plus fragments? Proposal D5.
3. Does the canary belong before `add` and authoring? Proposal D8.
4. Which stack goes first in phase 1? Proposal D13 says `astro-blog`. Ideally one with a small brief and a dev server, so phase 1
   exercises every verify layer in D7 without testing the long-brief assumption at the
   same time.
5. Should there be usage telemetry, and if so opt-in or opt-out? Two success measures
   ("finishes without help" across real users, "people write their own") can't be
   collected without it. Proposal D17; blocks [4.1a and 4.1b](phases/phase-4.1a.md).
6. Does `quickstack` (the repo name) need reserving on npm as well as `quickstacks`, to
   stop a lookalike?
7. Does D5's budget count the brief's fixed text (about 700 words of ground rules,
   versions and definition of done), or only what authors write? Counting it keeps the
   number honest about what the agent reads; excluding it means a CLI wording change
   can't push a stack over. Blocks [1.5](phases/phase-1.5.md), and should be settled
   before [1.6](phases/phase-1.6.md) measures anything.
8. Is the agent's own log of the questions it asked the user (`## Asked` in
   `.quickstacks/NOTES.md`) good enough to count interventions in interactive runs, or
   do interactive runs only count as anecdotes and headless bench runs carry the
   measure? Needed before the [1.6](phases/phase-1.6.md) gate.
9. `verify --accept-changes` is refused when an agent is detected or there is no TTY.
   Some agents' shell tools may allocate a TTY and not set a marker. Is "a determined
   agent can still accept changes" acceptable, given D14 guards against accidental
   weakening and not an adversary? Blocks [1.3](phases/phase-1.3.md).
10. Should dev-server probes be limited to local hosts as a format rule (so a verify step
   can't be pointed at an external URL)? Proposed in [1.3](phases/phase-1.3.md); needed
   before [1.6](phases/phase-1.6.md) writes stack verify steps.
11. The bench ([2.0](phases/phase-2.0.md)) runs the agent with full permissions inside a
   throwaway directory and a throwaway HOME, because allowlisted headless runs can't
   write agent config or git hook files that every stack ships. Is that posture
   acceptable on a maintainer's machine? Blocks 2.0.
12. A green bench run whose notes show a deliverable was never built is relabeled
   `partial` by hand, which means a maintainer reads every bench run. Is that a
   commitment the maintainers want, or should only failing and canary-regression runs
   get a human read? Blocks 2.0's exit.
13. The canary posts pull requests and issues with a token kept on the canary machine.
   Which scopes is it allowed (part of D15)? Blocks [2.1](phases/phase-2.1.md).
14. Should the registry index serve only stack content whose fingerprint has a passing
   canary run? Recommended in [4.0a](phases/phase-4.0a.md): it makes the canary a release
   gate for stack prose, which means 2.1 has to be reliable first. Blocks 4.0a and 4.0b.
15. What evidence starts the MCP server ([4.3](phases/phase-4.3.md))? Proposed: more than
   half of `new` runs hand off inside an agent for two 28-day windows, plus evidence that
   agents struggle with the shell path. Blocks 4.3.
