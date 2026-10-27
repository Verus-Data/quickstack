# Handoff for the next quickstacks session

Status: DRAFT 2026-10-26 (phase 0 merged; phase 1 round 1 in progress; plan awaiting the
maintainers' review)

Start here, then read repo `AGENTS.md`, the README's
[product summary](README.md#product-to-preserve), and
[PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md). Keep this file short: current state,
next steps, who owns each. When it grows past a couple of screens, move the dated detail
to `archive/` and leave a link.

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

Phase 1 round 1 ([1.0](phases/phase-1.0-entry-format-and-registry.md) to
[1.2b](phases/phase-1.2b-manifest-state-and-detection.md)) is in progress on branch
`feat/phase-1`. Before it started, D18 (entry format v1) was amended on 2026-10-26:
snake_case frontmatter, literal dotfiles, `package_scope` in v1, apps as
`category: app` fragments, and `expect` on serve steps. That is an agent's proposal and
still needs the maintainers' agreement; it supersedes D26 and D28, withdraws 3.5a and
re-scopes 1.6a to port and validate the whole bundled catalog. The CLI still has only
`doctor` and `--version` on `main`, run from the repo (`bun run dev`) or the compiled
binary. The repo is a bun-workspace monorepo (D11): the CLI is `packages/cli`, with
`packages/api` and `packages/mcp` as placeholders.

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
| Execute phase 1 round 1 (1.0, 1.1, 1.2a, 1.2b) | Agent | In progress on `feat/phase-1`: 1.0 done (registry, `list`, reviewed once). A non-default `QUICKSTACKS_REGISTRY_DIR` is untrusted. Under `bun run dev` the project origin is looked up from `packages/cli`, not the caller's directory |
| Decide D19 (project-origin entries untrusted by default) | Maintainers | The only decision [1.0](phases/phase-1.0-entry-format-and-registry.md) blocks on besides D18; 1.0 is being built to the proposal |
| Execute 0.2 (distribution) | Agent, after A1, D12 and D22 | Deferred 2026-10-26 to the final step before public release, with the npm reservation and 1.6c. Changes `bin.ts` |
| Decide open questions 24-28 (behavior kept on purpose in phases 0-1) | Maintainers | Before 1.0, 1.1, 1.3b and 1.6c, as each question says. Question 26 changed: 1.1 now proposes a warning, not an error, for a `--with` fragment that doesn't fit. The rest (D25, D27, questions 29-31) can wait for phases 3-4 |
