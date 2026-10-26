# Handoff for the next quickstacks session

Start here, then read repo `AGENTS.md`, the README's
[product summary](README.md#product-to-preserve), and
[PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md). Keep this file short: current state,
next steps, who owns each. When it grows past a couple of screens, move the dated detail
to `archive/` and leave a link.

## Current state (2026-10-26)

Planning, with boilerplate in place. The repo holds the problem statement, this plan
folder, and the `typescript-cli` base ported and renamed to quickstacks: `doctor` and
`--version` only, no product features. The repo is a bun-workspace monorepo (D11): the CLI
is `apps/cli`, with the API and MCP server to come as sibling packages. `bun run check`
passed from the root after the restructure (70 hook tests, 48 CLI tests, 8 binary tests).
Nothing is committed yet, and CI hasn't run.

The plan scaffold was written on 2026-10-26 from the problem statement:
[requirements](00-requirements.md) (DRAFT), an
[architecture question list](01-architecture.md),
[risks and open questions](10-risks-and-open-questions.md), and
[P0](phases/P0-foundation.md). D0-D4 and D10 are settled. D5-D9 are proposals.

The stack is decided (D10): a TypeScript CLI on the `typescript-cli` base stack. What
was ported, renamed and left out is in [01, Stack](01-architecture.md#stack).
Distribution (A1: npm bundle or compiled binary) is open.

The problem statement still uses the earlier working name "stacks". It hasn't been
edited; the plan reads it as quickstacks.

## Next steps

| Step | Owner | Notes |
|---|---|---|
| Reserve `quickstacks` on npm | Riley | Free on 2026-10-26; not reserved |
| Review 00-requirements.md and decide D5-D9 | Riley | Each is one table row with its reason and source |
| Answer the open questions in 10 | Riley | Question 1 (registry audience) decides which stacks ship bundled |
| Competitive research | Agent, after the review | Fill the gap noted in 00-requirements |
| Decide distribution (A1) | Riley | Recommendation in 01: Node ESM bundle on npm |
| Commit the scaffold and push; confirm CI `ci-ok` on `main` | Riley (commit on request) | Nothing committed yet |
| If A1 picks the npm bundle, add the Node build and point e2e at it | Agent, after A1 | P0 task |
