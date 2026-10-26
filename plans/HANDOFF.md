# Handoff for the next quickstacks session

Status: CURRENT 2026-10-26 (full plan written; awaiting the maintainers' review)

Start here, then read repo `AGENTS.md`, the README's
[product summary](README.md#product-to-preserve), and
[PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md). Keep this file short: current state,
next steps, who owns each. When it grows past a couple of screens, move the dated detail
to `archive/` and leave a link.

## Current state (2026-10-26)

Planning, with boilerplate in place. The repo holds the problem statement, this plan
folder, and the `typescript-cli` base ported and renamed to quickstacks: `doctor` and
`--version` only, no product features. The repo is a bun-workspace monorepo (D11): the CLI
is `packages/cli`, with `packages/api` and `packages/mcp` as placeholders for the API and MCP server. The boilerplate is
committed (`d36b795`); CI hasn't run.

A code review of the foundation on 2026-10-26 found bugs from the workspace move and gaps
in the base. The fixes are applied and uncommitted; what changed is in
[phase 0.1](phases/phase-0.1.md). `bun run check` passes from the root (77 hook tests, 51
CLI tests, 8 binary tests). Three findings are product design and are open architecture
questions A2-A4 in [the roadmap](02-roadmap.md#open-architecture-questions), answered by
[phase 0.3](phases/phase-0.3.md).

The full plan was written on 2026-10-26: [02-roadmap.md](02-roadmap.md) outlines five
phases and their sub-phases, with the MVP cutline after phase 1, and each sub-phase has
its own file in [phases/](phases/). Competitive research is done and recorded in
[00-requirements.md](00-requirements.md#what-were-replacing). The old single
foundation phase file was folded into phases 0.0-0.2 and deleted.

D0-D4, D10 and D11 are settled. D5-D9 and D12-D17 are proposals in
[00-requirements.md](00-requirements.md#proposed-decisions); the roadmap's decision table
says which sub-phase each one blocks. A1-A4 are open, each assigned to a phase 0
sub-phase. The repo and stack facts the plan relies on are in
[the roadmap](02-roadmap.md#repository-and-stack); `AGENTS.md` is the code-level
reference.

The problem statement still uses the earlier working name "stacks". It hasn't been
edited; the plan reads it as quickstacks.

## Next steps

| Step | Owner | Notes |
|---|---|---|
| Reserve `quickstacks` on npm | Maintainers | Free on 2026-10-26; not reserved ([0.0](phases/phase-0.0.md)) |
| Review 00-requirements.md and 02-roadmap.md; decide A1 and D12 first, then D5-D7, D9, D13, D14 | Maintainers | The gating table in [0.0](phases/phase-0.0.md) says which can wait |
| Answer the open questions in 10 | Maintainers | Question 1 (registry audience) decides which stacks ship bundled |
| Commit the review fixes and push; confirm CI `ci-ok` on `main` | Maintainers (agents commit on request), then Agent | [0.1](phases/phase-0.1.md) |
| Add the hook permissions listed in `AGENTS.md` under "Pending user actions", if any | Maintainers | The agent can't edit `.claude/settings.json` |
| Execute 0.3 (command runtime) | Agent | Needs only 0.1; can start before the decisions land |
| Execute 0.2 (distribution) | Agent, after A1 and D12 | Changes `bin.ts`; land after 0.3 or agree the split first |
