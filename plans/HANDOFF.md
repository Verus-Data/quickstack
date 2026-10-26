# Handoff for the next quickstacks session

Status: DRAFT 2026-10-26 (full plan written; awaiting the maintainers' review)

Start here, then read repo `AGENTS.md`, the README's
[product summary](README.md#product-to-preserve), and
[PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md). Keep this file short: current state,
next steps, who owns each. When it grows past a couple of screens, move the dated detail
to `archive/` and leave a link.

## Current state (2026-10-26)

Planning, with the CLI base in place. The repo holds the problem statement, this plan
folder, and the `typescript-cli` base as quickstacks: `doctor` and `--version` only, no
product features. The repo is a bun-workspace monorepo (D11): the CLI is `packages/cli`,
with `packages/api` and `packages/mcp` as placeholders for the API and MCP server. The
base and the foundation review's fixes are committed (check `git log` for what landed;
this file doesn't cite hashes), so [0.1](phases/phase-0.1-repo-baseline.md) is executed.
Whether `ci-ok` passed on `main` for the latest pushed commit: unknown; check with
`gh run list` before building on it.

Three foundation questions are product design and are open architecture questions A2-A4
in [the roadmap](roadmap.md#open-architecture-questions), answered by
[0.3a](phases/phase-0.3a-errors-and-output.md) and
[0.3b](phases/phase-0.3b-processes-and-signals.md).

The plan, in brief:

- [roadmap.md](roadmap.md) has six phases. Phases 0 and 1 are the MVP and the
  `npx quickstacks` demo, published to npm by hand. Phase 5 holds every CI change and
  everything that runs an agent on a schedule (D23, proposed).
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

D0-D4, D10 and D11 are settled. D5-D9 and D12-D28 are proposals in
[requirements.md](requirements.md#proposed-decisions); the roadmap's decision table says
which sub-phase each one blocks. D5 (the brief budget) is a hypothesis whose evidence is
[1.6b](phases/phase-1.6b-mvp-gate-runs.md)'s gate runs. A1-A4 are open.

## Next steps

| Step | Owner | Notes |
|---|---|---|
| Reserve `quickstacks` on npm | Maintainers | Free on 2026-10-26; not reserved ([0.0](phases/phase-0.0-decisions-and-npm-name.md)) |
| Review requirements.md and roadmap.md; decide A1, D12, D22 and D23 first, then D5-D7, D9, D13, D14, D18-D20 | Maintainers | The gating table in [0.0](phases/phase-0.0-decisions-and-npm-name.md) says which can wait |
| Review A2-A4 as answered in 0.3a and 0.3b | Maintainers | Must be in the decisions log before [1.6c](phases/phase-1.6c-first-release.md) publishes |
| Answer the open questions in [risks-and-open-questions.md](risks-and-open-questions.md) | Maintainers | Question 1 (registry audience) decides which stacks ship bundled |
| Execute 0.3a (errors and output) | Agent | Needs only 0.1. Its answers to A2 and A4 are recommendations until the maintainers agree them; build them so the review can still change the details |
| Execute 0.3b (processes and signals) | Agent, after 0.3a | Same rule for A3 |
| Execute 0.2 (distribution) | Agent, after A1, D12 and D22 | Changes `bin.ts`; land after 0.3b, or rebase on it |
| Decide open questions 24-28 (behavior kept on purpose in phases 0-1) | Maintainers | Before 1.0, 1.1, 1.3b and 1.6c, as each question says; the rest (D25-D28, questions 29-31) can wait for phases 3-4 |
