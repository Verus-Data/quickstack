# Phase 1.6a: Bundled stack content

Status: DRAFT 2026-10-26 (not agreed). Re-scoped 2026-10-26 by the roadmap to "Bundled
catalog: port and validate": bring the whole bundled catalog (8 stacks and 19 fragments,
listed in the roadmap's Feature gaps section) into entry format v1 as amended and pass
`validate`, recording each composed size, instead of writing three stacks to D13's word
targets. The body below predates that and needs rewriting before execution; in
particular the `_dot_` escape (dotfiles are now literal, and packing is 0.2's), the
`check: { filled }` steps (built-in checks are out of v1) and `api-client` (not in the
catalog) no longer apply

| Field | Value |
|---|---|
| Goal | Three bundled stacks and the default fragments they compose with (the guardrail hooks are 1.6d), written to D13's word targets (`astro-blog` about 3,000 composed words, `python-react` about 4,800), passing `validate` with zero errors and zero warnings, with dotfiles stored escaped so the packed tarball holds exactly the registry tree |
| Traces to | Assumption "Agents can follow a 3,000 to 10,000 word brief faithfully ... The first assumption is the one to test next"; D5 (the budget hypothesis 1.6b's runs test); open question "Who is the bundled registry for?"; success row "The result is complete" |
| Depends on | 1.5 (`validate`, the budget and the canonical render). Drafting can start once 1.0 fixes the entry format (D18); drafts are checked when 1.5 lands |
| Blocks | 1.6d (its hooks ship in `agent-ops` and are tested on files these stacks write), 1.6b (the gate runs these stacks) |
| Decisions needed | D18 (entry format) before drafting. D6 (registry audience) and D13 (which three stacks, word targets) before drafting; if D13 changes the set, keep its shape: one small stack with a dev server, one small without, one near the budget. D5 and D7 before the stacks are final; if D5's composed cap moves, the large stack's target moves with it to about 200 words under the cap |
| Settles | The bundled default fragments, including the one stack-specific default fragment the large stack needs (below); [open question 4](../risks-and-open-questions.md#open-questions-for-the-maintainers) (`astro-blog` first) as far as content goes |

## Where this fits

1.6 is split four ways. This sub-phase writes the stacks and their prose and proves they
pack; 1.6d writes the Claude Code guardrail hooks that ship in `agent-ops`. 1.6b
takes each stack once through a real agent run from the packed tarball and records the
result (D20); 1.6c publishes that tarball. 1.6a hands 1.6b a registry that passes
`validate`, a composition test per stack, and a tarball file-list test, so a gate run that
fails is a prose or CLI problem, not a packing one. Fixes that 1.6b's run notes call for
land in these same entry files, done by 1.6b.

## Scope

In:

- Stacks (D13): `astro-blog`, `go-cli`, `python-react`.
- Default fragments shared by all three: `agent-ops` (its body, the AGENTS.md skeleton
  and its verify steps; the guardrail hooks are 1.6d), `git-hooks` (lefthook, Conventional Commits, pre-push tests),
  `ci-github` (one workflow that runs the project's `check` command in the generated
  project; this is shipped content, not this repo's CI).
- One stack-specific default fragment, `api-client`, for `python-react` (see "Word
  targets").
- Composition, packing, lint and typecheck tests for the bundled set.
- The repo `README.md` and package `README.md` describing the core loop and the stack
  table. These ship in the tarball, so they are done before 1.6b packs it.

Out:

- The guardrail hooks and their behavior tests (1.6d).
- `typescript-cli`, `react-router`, and tooling fragments that suit one person's setup
  rather than a new project. Under D6 they belong in a user directory or, later, a git
  source (3.2a).
- Deploy, release and service fragments (Postgres, Docker images, static hosting).
  `--sandbox` drops those categories anyway; 3.3a and 3.3c add them to the bundled set once
  each has a green bench run.
- Gate runs (1.6b) and publishing (1.6c).
- A `validate` CI step for the bundled registry ([5.0](phase-5.0-ci-release-and-checks.md)).
  1.5's bundled-registry test already runs in `bun run test`.

## Design

### Why these three

| Stack | Shape | Composed brief (default preset) | What it tests |
|---|---|---|---|
| `astro-blog` (first) | Static site with content collections, one dev server | about 3,000 words (D13) | Every D7 layer including a `serve` probe, at the small end. Open question 4: "Ideally one with a small brief and a dev server" |
| `go-cli` | Single binary CLI, no server | about 3,300 words (no D13 target) | A non-JavaScript toolchain and a `typecheck` layer that is a compile or vet step |
| `python-react` | Python API and a React frontend, two dev servers | about 4,800 words (D13), near the 5,000 cap | The long-brief end, two `serve` steps, generated API types between the halves |

`astro-blog` goes first because it exercises the whole verify loop with the least prose,
so a failure there is a CLI or format problem. `python-react` is the experiment on
assumption 1.

### Word targets and how each stack reaches them

All sizes are 1.5's composed sizes: `countWords` of the brief rendered with 1.5's
canonical context (see roadmap, Contracts: Word count). `fixedWords` is measured, not
assumed; about 700 is the current estimate (open question 7). The verify and commands
tables are generated from the entries, so they count against the entries.

| Part | `astro-blog` | `go-cli` | `python-react` |
|---|---|---|---|
| Fixed text (`fixedWords`) | ~700 | ~700 | ~700 |
| Generated verify and commands tables | ~150 | ~150 | ~250 |
| Stack body (cap 2,000) | ~1,200 | ~1,500 | ~2,000 |
| `agent-ops` + `git-hooks` + `ci-github` | ~950 | ~950 | ~1,150 (their `tag=python` blocks: two toolchains in hooks and CI) |
| `api-client` | n/a | n/a | ~700 |
| Total | ~3,000 | ~3,300 | ~4,800 |

The large stack can't reach 4,800 on body text alone: the body cap is 2,000. The
remaining words come from content the stack really needs rather than padding:

- `api-client` (default fragment, `appliesTo` stacks tagged `api` and `web`): generating
  a typed client from the backend's OpenAPI schema, the commands table entry that
  regenerates it, and a `typecheck` step that fails when the frontend is stale against the
  API. It is a separate fragment rather than body text because any later API-plus-frontend
  stack reuses it.
- `tag=python` blocks in `git-hooks` and `ci-github`, since a two-toolchain project needs
  both linters in pre-commit and both test runners in CI.

Decided here: adding `api-client` as a default fragment beyond D13's list of shared
fragments. Reason above; the D13 row should be amended to name it if the maintainers
agree. If they'd rather not, the alternative is a 2,000-word body and accepting about
4,100 words, which no longer tests the near-budget end; record that in D13.

Targets are ranges, not exact: `astro-blog` 2,700 to 3,300, `python-react` 4,600 to
4,900. The 100 to 400 words of headroom under 5,000 is deliberately small; a CLI wording
change that adds more than that to `fixedWords` pushes `python-react` over and shows up in
1.5's `fixedWords` column. Both presets must be under the cap; the sandbox preset drops the
deploy and release blocks, so it is the shorter one.

### Entry content rules

Every entry follows entry format v1 (see roadmap, Contracts: Entry format v1) and passes
1.5. Beyond what `validate` checks:

- No versions anywhere, Gotchas included. Something only true of today's release is
  rewritten as the durable rule, a discovery step ("read the installed package's exports
  before writing imports"), or a verify step that asks the tool. If it has none of those
  forms it stays out; the building agent records it in the project's Build workarounds.
- Setup is a numbered procedure. Generators run non-interactively into a named
  subdirectory or a temp dir, never into the populated root. Flags are not named.
- Tool configuration is intent ("strict mode, no implicit any, unchecked index access"),
  never a pasted config file.
- Every decision states its default.
- Verify steps call project commands (`make test`, `bun run lint`), carry a `layer`, set a
  `timeout` only when the 10-minute default is wrong, and read ports from `env`
  (`PORT_WEB`, `PORT_API`) with defaults in the entry.
- `files/` holds only what is the same across versions: `.gitignore`, `.editorconfig`, an
  AGENTS.md skeleton with `quickstacks:fill` markers, a Makefile or scripts skeleton that
  calls tools by name, agent hooks. Every shipped source file passes the stack's own lint
  and format rules as shipped; a run that fails `lint` on files the agent didn't write is
  a stack bug.
- Each stack names its proving slice in Setup: the smallest piece that exercises every
  layer (one content page and the RSS route; one real command and `--version`; one API
  route consumed by one page). The agent knows where the stack ends, and 1.6b checks the
  slice by hand.

### The `agent-ops` fragment

This sub-phase writes `agent-ops`'s `FRAGMENT.md`, its `AGENTS.md` skeleton in `files/`
(with `quickstacks:fill` markers for overview, commands, layout, conventions, testing and
Build workarounds), and its verify steps. The Claude Code guardrails it ships under
`adapters/claude/` (hooks, `.claude/settings.json`, `.claude/README.md`) are
[1.6d](phase-1.6d-guardrail-hook-fragments.md)'s, which also owns the body paragraph
about them.

Verify steps the fragment adds, both `phase: check`, `layer: docs`: `agents-md`
(`check: { filled: AGENTS.md }`) and `readme` (`check: { filled: README.md }`; the
stack ships the README skeleton). They make "AGENTS.md and the README describe the real
project" part of done rather than a request in the brief.

Budget (D5): the fragment's body stays near 300 words, including 1.6d's paragraph on the
hooks. That keeps `agent-ops`, `git-hooks` and `ci-github` together near the 950 words in
the table above.

### Dotfiles and packing

npm leaves some dotfiles out of a package (`.gitignore` among them, and `agent-ops` and
every stack ship one). Every dotfile under `files/` or `adapters/` is stored under the
escaped name the format defines (see roadmap, Other shared facts: Entry directories;
the escape rule is 1.0's and 1.2a undoes it when writing). No path segment under an
entry's `files/` or `adapters/` starts with `.`.

Because the escape list could still miss a case npm handles specially, the real guard is
a packing test: the files under `package/registry/` in the packed tarball (packed the way
0.2 packs) are exactly the files under `packages/cli/registry/`, path for path. An e2e
test then runs `new astro-blog <tmp> --sandbox --no-launch --json` from the installed
tarball and checks that `<tmp>/.gitignore` exists with the shipped content, which proves
the escape round-trips through npm.

### Failure modes

| Case | What happens |
|---|---|
| `python-react` is over 5,000 in either preset | Cut prose first. If the generated client can't fit, make `api-client` optional and record in D13 that the cap forced the split; the stack then no longer tests the near-budget end, which is itself a D5 data point |
| `python-react` is under 4,600 | Don't pad. Record the real size; D13's spread is a target, and 1.6b's notes report what was run |
| A shipped file fails the stack's own lint | Fix the file; it is a stack bug |
| The tarball file list differs from the tree | Fix the escape or the package `files` field; never accept the difference |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/registry/stacks/{astro-blog,go-cli,python-react}/` | `STACK.md`, `files/`, `adapters/claude/` |
| `packages/cli/registry/fragments/{agent-ops,git-hooks,ci-github,api-client}/` | `FRAGMENT.md`, `files/`, `adapters/claude/` (for `agent-ops`, everything except the guardrail files 1.6d owns) |
| `packages/cli/tests/registry.test.ts` | Composition tests below |
| `packages/cli/e2e/registry-pack.test.ts` | Tarball file list and the `.gitignore` round trip |
| `packages/cli/tsconfig.registry.json`, `package.json` (`typecheck`) | `tsc --noEmit` over shipped `.ts` under `registry/` |
| `packages/cli/README.md`, repo `README.md` | The core loop, the stack table, `--sandbox` |

## Acceptance tests

- `validate` on `packages/cli/registry`: zero errors, zero warnings (1.5's
  `tests/bundled-registry.test.ts`, now with content).
- `tests/registry.test.ts`, for each stack and preset: `new --no-launch --json` into a temp
  dir succeeds; `briefWords` is under the D5 cap; the manifest has every D7 layer; and no
  command was run (PATH holds only a recording shim for `git`, which `new` may call). It
  also asserts that no rendered file contains `{{`, and D13's spread on 1.5's composed sizes: `astro-blog` default at most 3,300 and
  `python-react` default at least 4,600, so later edits can't quietly collapse the
  experiment. Changing those bounds needs a D13 change.
- Shipped files lint clean: Biome over every shipped `.ts` and `.json` under the
  registry, through the package's `lint` (confirm the root Biome includes reach the
  registry path, and that escaped names still get the right parser). Biome doesn't lint
  Markdown, and no Markdown linter is added: shipped `.md` is checked by 1.5's `validate`
  (markers, budget rows) and by the composition test's "no rendered file contains `{{`"
  assertion below.
- Shipped TypeScript typechecks: the package `typecheck` script also runs `tsc --noEmit
  -p tsconfig.registry.json`, strict, over every shipped `.ts` under `registry/` (the
  MVP's shell hooks ship none, so this guards whichever adapter content adds TypeScript
  first, and 3.4a's harness).
- `e2e/registry-pack.test.ts`: the packed tarball's `registry/` file list equals the
  tree's; the installed package lists the three stacks; `new astro-blog --sandbox
  --no-launch` writes `.gitignore` from the escaped source.

## Exit criteria

- `bun run check` green from the repo root.
- `validate` over the bundled registry: zero errors, zero warnings, with the size rows
  for every stack and preset pasted into the change description.
- `astro-blog` and `python-react` composed sizes inside their target ranges, or the
  D13 row in [requirements.md](../requirements.md#proposed-decisions) amended with the
  real numbers and why.

## What this plan may get wrong

- The word estimates for fixed text and fragments are guesses until 1.5 measures them.
  If `fixedWords` comes in well above 700, `python-react` has less room for prose and
  `api-client` may have to shrink.
- Writing a brief toward a word target risks padding. The rule is the reverse: write what
  the stack needs, then check the size; a near-cap stack that turns out shorter is a
  result, not a failure.
- One stack-specific default fragment is the first of its kind in the bundled set. If
  3.0's `add` treats default fragments as universally applicable, `api-client`'s
  `appliesTo` has to hold.
- The escaped-name rule depends on npm's current dotfile handling; the tarball test, not
  the rule, is what keeps it honest.
