# Phase 1.6: Bundled stacks and the MVP gate

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Three bundled stacks and their default fragments, written to the budget and passing `validate`, each taken once by a real agent from `new --sandbox` to a green `verify` with no user intervention, with the run measured. Then the first public npm release, so the MVP cutline in the roadmap is met |
| Traces to | Assumption "Agents can follow a 3,000 to 10,000 word brief faithfully ... The first assumption is the one to test next"; "Two of the five stacks have not been taken to a green `verify` by an agent since their last change"; success rows "The agent finishes without help", "It's faster than by hand (target: under 20 minutes for a sandbox run)", "The result is complete"; open question "Who is the bundled registry for?" |
| Depends on | 1.3 (`verify`), 1.4 (handoff), 1.5 (`validate`), 0.2 (publishing). Drafting prose can start as soon as 1.0 fixes the entry format |
| Blocks | Phase 2 (the bench and canary need stacks that went green once), 3.0 (fragments to `add`) |
| Decisions needed | D6 (registry audience) and D13 (which three stacks) before drafting; D5 and D7 before the stacks are final. If D13 changes the set, keep its shape: one small stack with a dev server, one small without, one large near the budget |
| Decisions or questions this settles | Open question 4 in 10 (which stack goes first); the first data point on assumption 1; the "agent finishes without help" target the maintainers set in 0.0 gets its first measurement |

## Scope

In:

- Stacks (per D13, proposed): `astro-blog`, `go-cli`, `python-react`.
- Default fragments shared by them: `agent-ops` (AGENTS.md skeleton and the Claude Code
  adapter config), `git-hooks` (lefthook, Conventional Commits, pre-push tests),
  `ci-github` (one workflow that runs the project's `check` command).
- One recorded sandbox run per stack, by hand, under the procedure below.
- The release: version `0.1.0` (or what 0.2's release process names), README and the
  package README describing the core loop.

Out:

- `typescript-cli`, `react-router` and the personal tooling fragments (remote test
  runners, plugin bundles, model-provider SDKs). Under D6 these belong in a user
  directory or, later, a git source (3.2). The maintainers can keep them in their own
  user directory and they will work the same way.
- Deploy, release and service fragments (Postgres, Docker images, static hosting).
  `--sandbox` drops those categories anyway; they come with 3.0 or later.
- The bench script and ledger (2.0). Gate runs are recorded by hand in a run note.

## Why these three

| Stack | Shape | Expected composed brief | What it tests |
|---|---|---|---|
| `astro-blog` (first) | Static site with content collections, one dev server | about 3,000 words | Every D7 layer including a `serve` probe, at the small end of the brief range. Answers open question 4: "Ideally one with a small brief and a dev server" |
| `go-cli` | Single binary CLI, no server | about 3,500 words | A non-JavaScript toolchain and a `typecheck` layer that is a compile or vet step |
| `python-react` | Python API and a React frontend, two dev servers | 4,500 to 5,000 words, near the D5 cap | The long-brief end, two `serve` steps, generated API types between the halves |

Astro goes first because it exercises the whole verify loop, including a dev-server
probe, with the least prose; a failure there is a CLI or format problem, not a long
brief problem. `python-react` goes last because it is the experiment on assumption 1.

## Design

### Entry content rules

Every entry follows the format from 1.0 and passes 1.5. Beyond what `validate` checks:

- No versions anywhere, Gotchas included. Something only true of today's release is
  rewritten as the durable rule, a discovery step ("read the installed package's exports
  before writing imports"), or a verify step that asks the tool. If it has none of those
  forms it stays out of the entry; the building agent records it in the project's Build
  workarounds.
- Setup is a numbered procedure. Generators run non-interactively into a named
  subdirectory or a temp dir, never into the populated root. Flags are not named.
- Tool configuration is intent ("strict mode, no implicit any, unchecked index access"),
  never a pasted config file.
- Every decision states its default.
- Verify steps call project commands (`make test`, `bun run lint`), carry a `layer`, and
  read ports from `env` (`PORT_WEB`, `PORT_API`) with defaults in the manifest.
- `files/` holds only what is the same across versions: `.gitignore`, `.editorconfig`,
  an AGENTS.md skeleton with `quickstacks:fill` markers, a Makefile or scripts skeleton
  that calls tools by name, agent hooks. Every shipped source file passes the stack's
  own lint and format rules as shipped; a run that fails `lint` on files the agent didn't
  write is a stack bug.
- Each stack names its proving slice in Setup: the smallest piece that exercises every
  layer (one content page and the RSS route; one real command and `--version`; one API
  route consumed by one page). The agent knows where the stack ends.

### The brief's measurement hooks

1.1's brief already tells the agent to keep `.quickstacks/NOTES.md`. For the gate the
rule must include the `Asked` section: every question the agent put to the user, one line
each. Zero lines under `Asked` plus no user message after the prompt is what "no
intervention" means (roadmap, Measurement).

### Gate procedure (maintainers-owned)

Run once per stack, in the order above, on a machine with the stack's tools installed
and nothing listening on the default ports.

1. Build and pack the CLI the way 0.2 publishes it; install the tarball into a fresh
   prefix so the run uses the artifact that ships.
2. In a fresh empty directory outside any git repo, with a throwaway `HOME` whose agent
   login is copied in: `quickstacks new <stack> run --sandbox`. Let the handoff launch
   the agent (this also tests 1.4).
3. Don't type anything after the prompt. If the agent asks a question, answer with
   "use the default", and count it as an intervention.
4. When the agent stops, run `quickstacks verify --json` yourself from the project. The
   agent's own claim of green doesn't count.
5. Record a run note in `plans/runs/<date>-<stack>.md`: CLI version, agent and how it was
   launched, brief words (from the `new` result), wall-clock minutes from `new` to first
   green (from the run records 1.3 writes), number of verify runs, interventions,
   `NOTES.md` copied in full, and anything the agent got wrong that verify didn't catch
   (a project command that does nothing, a skipped deliverable).
6. Fix the stack prose for every hesitation or wrong turn the notes show, re-run
   `validate`, and rerun the stack if the fix changed its verify steps or Setup.

The run is a pass when the final independent verify is green, the manifest is
unchanged (1.3's tamper check), and interventions are zero.

### Agent split

| Step | Owner |
|---|---|
| Draft each stack and fragment, pass `validate`, add composition tests | Agent |
| Run the gate for each stack, record run notes | Maintainers (an agent can drive the terminal, but a person confirms no intervention and that the project is real) |
| Port findings from run notes back into prose | Agent, reviewed by the maintainers |
| Tag the release, publish to npm, check `npx quickstacks@latest list --json` on a clean machine | Maintainers, using 0.2's procedure |

### Release checks

Before publishing: `bun run check` green; `validate` on the bundled registry zero errors
and zero warnings; the packed tarball contains `registry/` and nothing from `tests/` or
`e2e/`; `npx <tarball> list --json` on Node at the lowest version D12 allows lists the
three stacks; all three run notes say pass. After publishing: `npx quickstacks@latest new
astro-blog /tmp/check --sandbox --no-launch --json` writes the brief and manifest.

### Failure modes

| Case | What happens |
|---|---|
| A gate run fails on CLI behavior (verify, handoff, scaffold) | Fix in the owning sub-phase's code with a regression test first, then rerun |
| A gate run fails on prose | Fix the entry; rerun |
| The near-cap stack goes green but slowly or with skipped instructions | Record it; this is the assumption-1 data point. Raise it as a D5 change before writing more stacks |
| An agent can't write its own config directories in a headless or sandboxed session | Run interactively for the gate; record the limitation for 2.0's bench design |
| Ports busy on the gate machine | Override with the `PORT_*` env at `new` time; never stop a process you didn't start |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/registry/stacks/{astro-blog,go-cli,python-react}/` | `STACK.md`, `files/`, `adapters/claude/` |
| `packages/cli/registry/fragments/{agent-ops,git-hooks,ci-github}/` | `FRAGMENT.md`, `files/`, `adapters/claude/` |
| `packages/cli/tests/registry.test.ts` | composes each bundled stack in both presets; asserts budgets, layers and that every shipped TypeScript or JSON file parses |
| `packages/cli/README.md`, repo `README.md` | the core loop, the stack table, `--sandbox` |
| `plans/runs/` | one note per gate run (new folder; linked from HANDOFF) |
| `plans/10-risks-and-open-questions.md` | assumption 1's first data point |

## Acceptance tests

- `validate` on `packages/cli/registry`: zero errors, zero warnings.
- `tests/registry.test.ts`: for each stack and preset, `new --no-launch --json` into a
  temp dir succeeds, `briefWords` is under the D5 cap, the manifest has every D7 layer,
  and no command was run (assert with a PATH holding only a recording shim for `git`,
  which `new` may call, and nothing else).
- Shipped files lint clean: Biome over every shipped `.ts`, `.json` and `.md` under the
  registry in the package's `lint` (the root Biome config already covers the path once it
  exists; confirm the include).
- e2e: the packed artifact lists the three stacks and scaffolds `astro-blog` in sandbox.
- Three run notes, each a pass by the definition above.

## Exit criteria

- All of the MVP cutline in the roadmap is true.
- `bun run check` green from the repo root.
- `quickstacks@0.1.0` (or the agreed version) on npm; `npx quickstacks@latest list
  --json` works on a machine with only Node.
- HANDOFF.md says the MVP shipped, links the run notes, and states assumption 1's first
  result in one sentence. The D6 and D13 rows in 00-requirements record what shipped.

## What this plan may get wrong

- One run per stack is one sample. It can show a stack works; it can't show the success
  rate. That is what 2.0 and 2.1 are for, and the run notes say so rather than claiming
  a rate.
- The gate is run by the people who wrote the stacks, who know what the prose meant. The
  "no intervention" rule and the independent verify limit that bias but don't remove it.
- `python-react` may not fit 5,000 words without losing the generated API client. If it
  doesn't, the honest outcome is moving the client to an optional fragment and recording
  that the cap forced it, which is the split the problem statement predicted.
