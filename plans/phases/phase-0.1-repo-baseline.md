# Phase 0.1: Repo baseline

Status: PARTIALLY EXECUTED 2026-10-26. The base is ported, moved into the workspace and
reviewed, and `bun run check` passes locally. Not done: the review fixes are uncommitted
and CI has never run on GitHub.

| Field | Value |
|---|---|
| Goal | A committed, CI-verified skeleton with `doctor` and `--version` as its only commands, so product work starts on a known-good base |
| Traces to | "The emotional job underneath all of these is trust": a CLI whose own gates nobody has seen pass can't ask users to trust its gate. D10 and D11 |
| Depends on | nothing |
| Blocks | 0.2, 0.3, and through them all of phase 1 |
| Decisions needed | none |
| Settles | Nothing new; records what D10 and D11 produced |

## Scope

In: the port of the `typescript-cli` base (D10), the bun-workspace layout (D11), the
foundation review fixes, committing them, and a green `ci-ok` on `main`.

Out: distribution (0.2) and the runtime changes long and interactive commands need
(0.3). No product code.

## What was done

| Date | Work | Evidence |
|---|---|---|
| 2026-10-26 | Ported the base with its required and default pieces only, renamed to quickstacks (slug, `QUICKSTACKS_` env prefix, CI on `main`); removed the one model-provider error and left exit 5 unassigned | `bun run check` green after the port: lint, typecheck, 112 unit tests, 8 binary tests |
| 2026-10-26 | Moved into a bun workspace: `packages/cli` is the package, the harness stays at the root, shared versions in the root catalog | Root scripts fan out with `bun run --filter '*'`; root `dev` uses `--cwd packages/cli` |
| 2026-10-26 | Foundation review: workspace-move bugs and base gaps fixed (non-retryable defects with class and frames logged, `--json` after `--` left to the command, XDG data and cache paths, a cache path in `doctor`, `HOME` fallback, CI on Linux and macOS behind one `ci-ok`, path resolution in e2e and Grit probes) | `bun run check` green from the root: 77 hook tests, 51 CLI tests, 8 binary tests |
| 2026-10-26 | Three review findings were product design, not bugs; recorded as A2-A4 | [Roadmap, open architecture questions](../02-roadmap.md#open-architecture-questions) |

The facts a later sub-phase relies on are in
[the roadmap's Repository and stack section](../02-roadmap.md#repository-and-stack).
The code-level reference is `AGENTS.md`.

## Remaining tasks

| Task | Owner | Done when |
|---|---|---|
| Commit the review fixes as one or more Conventional Commits through the hooks (no `--no-verify`) | maintainers (an agent commits only when asked) | `git status` clean apart from planning files |
| Push to GitHub | maintainers | `main` exists on the remote |
| Confirm `ci-ok` passes on `main` on Linux and macOS | Agent, after the push | A green run linked here |
| If CI fails where local passed, fix it here, before 0.2 | Agent | The fix starts with a failing test that reproduces the CI difference |

## Design notes for whoever finishes this

There is nothing to design. Two things to watch, both from the review:

- The binary tests spawn the compiled artifact with an environment built from scratch.
  Differences between the macOS and Linux runners (signals, process groups, `/tmp`
  semantics) show up here first. Fix them in the test helper, never by skipping a test
  on one OS.
- The CI matrix uses official action tags, not SHA pins. SHA pinning is deferred (see
  `AGENTS.md`, Deferred); don't add it as part of making CI green.

## Files and areas touched

Only if CI fails: `.github/workflows/ci.yml`, `packages/cli/e2e/`, `tests/hooks/`. Otherwise
none.

## Acceptance tests

The existing suites are the tests: `bun run test:hooks`, the CLI's Vitest suite through
`tests/helpers/cli.ts`, and `bun test ./e2e` against the compiled binary. No new tests
unless a CI-only failure needs a reproduction.

## Exit criteria

- `bun run check` green from the repo root.
- `ci-ok` green on `main` on GitHub, with a link to the run recorded in this file.
- `AGENTS.md` "Pending user actions" still says none, or lists what CI needed.
- This file's status line says EXECUTED with the date.

## What this plan may get wrong

- The test counts above were taken before the review fixes landed in a commit. If the
  numbers differ after the commit, record the new ones; a drop needs an explanation,
  not a shrug.
- GitHub's macOS runners have been slower and flakier with process-heavy tests than
  Linux. If a binary test times out only there, measure before raising a timeout.
