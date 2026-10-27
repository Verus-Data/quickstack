# Handoff for the next quickstacks session

Status: DRAFT 2026-10-26 (phase 0 merged; phase 1 round 1 executed and batch-reviewed, fixes
being applied; plan awaiting the maintainers' review)

Start here, then read repo `AGENTS.md`, the README's
[product summary](README.md#product-to-preserve), and
[PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md). Keep this file short: current state,
next steps, who owns each. When it grows past a couple of screens, move the dated detail
to `archive/` and leave a link.

## 1.6b gate runs (2026-10-27)

[1.6b](phases/phase-1.6b-mvp-gate-runs.md) ran headless from the compiled binary for D13's
three stacks, six rounds with brief fixes between them (rerun log in the plan). Each stack
has a green counting run on `e6f5da2`: [astro-blog](runs/2026-10-27-astro-blog.md),
[go-cli](runs/2026-10-27-go-cli.md), [python-react](runs/2026-10-27-python-react.md).
A maintainer still has to confirm each run, and the other four bundled stacks have none.

- Assumption 1, first result: an agent followed composed briefs of 3,200 to 4,800 words to a green `verify` in 3 to 5 minutes with nothing asked, once the briefs' own contradictions were fixed.
- D5: the 6,000-word budget held with room to spare for these stacks; no run tested a brief near the limit.

## 3.0 shared pipeline refactor (2026-10-27)

The refactor against `fa2b3e3` is left uncommitted for orchestrator review. `new` and `add`
share command handoff, project layout, template values and tool lookups; add planning,
project reading, manifest merging, reporting and writes each have their own module.
`replaceProjectState` owns scoped state-record restoration. The independent review found
no additional issues, and lint, typecheck, 14 new tests and 18 binary tests pass.

The gate has 130 passing harness tests and 1,071 passing CLI tests, with one failure:
`tests/skill.test.ts` requires that the skill omit add and say existing repos are unsupported.
That contradicts the requested skill update. The skill now documents add within 462 words;
permission to update those obsolete assertions is pending. Existing tests remain unchanged.

## Phases 2 and 3 (2026-10-27, in progress)

Phases 2 and 3 are being executed through Codex delegates (`/execute:codex`), one test-author
then one implementer per sub-phase, merged to `main` as each lands. Work runs off the dev build
and the compiled binary: there is no packed tarball until 0.2, so every tarball check is
reworded for `dist/quickstacks` or deferred in its plan.

- Executed: [2.0a](phases/phase-2.0a-composed-files-and-fingerprint.md) (composed files and
  the fingerprint), [3.5b](phases/phase-3.5b-two-phase-brief.md) (base then app stages in
  `verify`), [3.4c](phases/phase-3.4c-agent-skill.md) (the agent skill and `skill install`).
- In progress: 3.0 (`add`), 2.0c (run ledger), 3.1c (`new --dry-run`); then 3.1a, 2.2, 2.0b,
  3.1b, 3.4a, 3.4b and 3.3a-c.
- Deferred to phase 4 or later: [3.2a](phases/phase-3.2a-user-sources.md) and
  [3.2b](phases/phase-3.2b-source-trust-and-updates.md), gated on outside demand and open
  question 18.
- Left to maintainers: the real bench runs beyond a few seed runs, and the proofs that need
  them (3.3a-c, parts of 3.4a, 3.4b, 3.5b and 2.0b).

## Current state (2026-10-26)

Phase 0's agent work is merged to `main`, with `ci-ok` green on Ubuntu and macOS (so the
process and signal tests have now run on Linux too): [0.1](phases/phase-0.1-repo-baseline.md),
[0.3a](phases/phase-0.3a-errors-and-output.md) (error table, exit 5, kept results,
progress, did-you-mean) and [0.3b](phases/phase-0.3b-processes-and-signals.md) (the
`Processes` service and the signal policy) are executed.
[0.0](phases/phase-0.0-decisions-and-npm-name.md) stays in progress for the decisions.
Packaging ([0.2](phases/phase-0.2-npm-distribution-artifact.md)), the npm name
reservation and the first publish ([1.6c](phases/phase-1.6c-first-release.md)) are the
final step before public release, after the roadmap's
[feature gaps](roadmap.md#feature-gaps-to-close-before-release); none of them comes
before 1.6b.

Phase 1 round 1 ([1.0](phases/phase-1.0-entry-format-and-registry.md),
[1.1](phases/phase-1.1-composition-and-brief.md),
[1.2a](phases/phase-1.2a-new-scaffold-and-templates.md),
[1.2b](phases/phase-1.2b-manifest-state-and-detection.md) and
[1.5](phases/phase-1.5-validate-and-brief-budget.md)) is executed, batch-reviewed once
with its fixes applied, and merged to `main` (PR #4).
Before it started, D18 (entry format v1) was amended on 2026-10-26:
snake_case frontmatter, literal dotfiles, `package_scope` in v1, apps as
`category: app` fragments, and `expect` on serve steps. That is an agent's proposal and
still needs the maintainers' agreement; it supersedes D26 and D28, withdraws 3.5a and
re-scopes 1.6a to bring the whole bundled catalog into v1 and validate it. The CLI on `main`
has `doctor`, `--version`, `list`, `new` and `validate`, run from the repo (`bun run dev`) or
the compiled binary; `verify` (1.3a) is next. The bundled registry holds its first stack,
`typescript-cli`, with the fragments it names, and validates clean; conditional blocks for stacks
and tags it doesn't have yet were trimmed and come back when 1.6a brings those in. The repo is a bun-workspace monorepo (D11): the CLI is `packages/cli`, with
`packages/api` and `packages/mcp` as placeholders.

Output is agent-first (D29, on `feat/agent-default-output`): without `--json`, only a
terminal with no agent detected gets human output; everything else gets agent output, which
keeps log lines off stderr, prints paths relative to the working directory, and drops what the
brief or another line already says. `.claude/rules/cli/cli.md` "Three audiences" is the
contract; every new command renders for both.

Three foundation questions are product design and are open architecture questions A2-A4
in [the roadmap](roadmap.md#open-architecture-questions), answered by
[0.3a](phases/phase-0.3a-errors-and-output.md) and
[0.3b](phases/phase-0.3b-processes-and-signals.md).

The plan, in brief:

- [roadmap.md](roadmap.md) has six phases. Phases 0 and 1 are the MVP and the demo, run
  from the repo or the compiled binary. Publishing to npm by hand is the final step
  before public release. Phase 5 holds every CI change and everything that runs an agent
  on a schedule (D23, proposed).
- The roadmap's shared-contracts table is the single owner of every cross-phase type,
  symbol, error tag and schema version, and its [trust model](roadmap.md#trust-model)
  is the one place trust rules live. Phase files cite both.
- Each sub-phase is sized for one agent; large ones are split with letter suffixes
  (for example [1.2a](phases/phase-1.2a-new-scaffold-and-templates.md) and
  [1.2b](phases/phase-1.2b-manifest-state-and-detection.md)). The roadmap's phase tables
  and dependency graph list every file.
- Below the MVP cutline on purpose: `new --dry-run` and naming options
  ([3.1c](phases/phase-3.1c-new-dry-run-and-naming.md)), the agent skill
  ([3.4c](phases/phase-3.4c-agent-skill.md)), the rot checks that only matter once
  stacks age ([2.2](phases/phase-2.2-deterministic-rot-checks.md)), and everything in
  phases 2-5.

D0-D4, D10 and D11 are settled. D5-D9 and D12-D27 are proposals in
[requirements.md](requirements.md#proposed-decisions) (D26 and D28 are superseded by the
amended D18); the roadmap's decision table says which sub-phase each one blocks. D5 (the brief budget) is a hypothesis whose evidence is
[1.6b](phases/phase-1.6b-mvp-gate-runs.md)'s gate runs. A1-A4 are open.

## Next steps

| Step | Owner | Notes |
|---|---|---|
| Agree or change the amended D18 (entry format v1) | Maintainers | Round 1 (1.0-1.2b) is being built to it; see [requirements.md](requirements.md#proposed-decisions) and the dated entries in each phase file's "What this plan may get wrong" |
| Reserve `quickstacks` on npm | Maintainers | Part of the final step before public release, with 0.2 and 1.6c; sooner only if someone else takes the name. The name was free on 2026-10-26, see the name check in [0.0](phases/phase-0.0-decisions-and-npm-name.md) |
| Review requirements.md and roadmap.md; decide A1, D12, D22 and D23 first, then D5-D7, D9, D13, D14, D18-D20 | Maintainers | The gating table in [0.0](phases/phase-0.0-decisions-and-npm-name.md) says which can wait |
| Review A2-A4 as answered in 0.3a and 0.3b | Maintainers | Must be in the decisions log before [1.6c](phases/phase-1.6c-first-release.md) publishes |
| Answer the open questions in [risks-and-open-questions.md](risks-and-open-questions.md) | Maintainers | Question 1 (registry audience) decides which stacks ship bundled |
| Apply the batch review's fixes to phase 1 round 1 (1.0, 1.1, 1.2a, 1.2b, 1.5) | Agents, then maintainers | All five executed on `feat/phase-1` and batch-reviewed once; fixes are being applied (`validate` and the docs on one branch, `new` and `errors.ts` on another). 1.0 done (registry, `list`, reviewed once). 1.1 executed (composition and the brief, no command; reviewed once, fixes applied). 1.5 executed (`validate`, the brief budget and `validate --brief`); the realistic brief with an app measures about 6,000 words and passes its 9,000 limit. A non-default `QUICKSTACKS_REGISTRY_DIR` is untrusted. 1.2a executed 2026-10-26 (`new`: writer with rollback, templates, `.quickstacks/`, git init; awaiting review). `bun run dev` now runs the CLI in the caller's directory, including a subdirectory of the repo; Bun hides the caller under `bun run --cwd`, so from outside the repo set `INIT_CWD="$PWD"`. 1.2b executed 2026-10-26 (awaiting batch review): `new` writes `.quickstacks/manifest.json` and the out-of-project state record under `$XDG_STATE_HOME/quickstacks/projects/` (`stateRecord: false` when that isn't writable), rolls both back on failure or interrupt, and a rerun into an earlier scaffold is `TargetNotEmpty` with `scaffold: unfinished` or `green`; agent detection is in `config.ts`. Marker confirmation dates weren't re-checked against agent docs; recheck before 1.3b |
| ~~Choose how `validate` treats a verify step no layer describes (a file-existence or config check)~~ | Maintainers | Decided 2026-10-26: `check` layer added (roadmap, "Verify step `layer`"). `step-layer` stays a warning and `check` isn't a D7 layer; see [1.5](phases/phase-1.5-validate-and-brief-budget.md), "What this plan may get wrong" |
| Decide D19 (project-origin entries untrusted by default) | Maintainers | The only decision [1.0](phases/phase-1.0-entry-format-and-registry.md) blocks on besides D18; 1.0 is being built to the proposal |
| Execute 0.2 (distribution) | Agent, after A1, D12 and D22 | Deferred 2026-10-26 to the final step before public release, with the npm reservation and 1.6c. Changes `bin.ts` |
| Decide open questions 24-28 (behavior kept on purpose in phases 0-1) | Maintainers | Before 1.0, 1.1, 1.3b and 1.6c, as each question says. Question 26 changed: 1.1 now proposes a warning, not an error, for a `--with` fragment that doesn't fit. The rest (D25, D27, questions 29-31) can wait for phases 3-4 |
