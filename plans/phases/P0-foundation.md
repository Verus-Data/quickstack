# P0: foundation

Status: NOT STARTED

**Goal:** the name is secured, the requirements are agreed, the decisions that are hard
to reverse are made, and the repo has working gates, so P1 can start building against a
fixed target.

**Depends on:** nothing.

**Blocks:** P1.

## Tasks

### Name

- [ ] Reserve `quickstacks` on npm with a placeholder package (Riley). Decide on
      `quickstack` too (open question 6).
- [ ] Check the name on GitHub and as a domain, and record what's taken.

### Product decisions

- [ ] Review [00-requirements.md](../00-requirements.md) with Riley; mark it AGREED.
- [ ] Decide D5 (brief budget), D6 (registry audience), D7 (verify layers), D8 (canary
      timing) and D9 (entry point). Move each agreed one to the
      [decisions log](../README.md#decisions-log).
- [ ] Set the target for "agent finishes without help" in the success table.
- [ ] Pick the first stack for P1 (open question 4).
- [ ] Research the competitive landscape beyond templates and bare prompts, and add rows
      with sources to [00-requirements.md](../00-requirements.md#what-were-replacing).

### Repo

- [x] (2026-10-26, D10) Language and runtime: TypeScript CLI on the `typescript-cli`
      base stack, no product features ([01, Stack](../01-architecture.md#stack)).
- [ ] Decide distribution, A1 in [01](../01-architecture.md#a1-distribution-open)
      (Riley). The recommendation is a Node ESM bundle on npm.
- [x] (2026-10-26) Port the `typescript-cli` base boilerplate (required and default
      fragments only) and rename it to quickstacks, with no product code. `bun run check`
      green locally: lint, typecheck, 112 unit tests, 8 binary tests. Details in
      [01, Stack](../01-architecture.md#stack).
- [ ] Push to GitHub and confirm CI's `ci-ok` passes on `main`.
- [ ] If A1 picks the npm bundle, add the Node build and point e2e at the shipped
      artifact.
- [x] (2026-10-26) Commands are in `AGENTS.md`, from the ported base.

## Exit criteria

- `npm view quickstacks` shows our package.
- 00-requirements.md is AGREED, and D5-D9 are each either in the decisions log or
  explicitly deferred with a reason.
- The first stack for P1 is named.
- A1 is decided.
- `bun run check` (lint, typecheck, test, binary e2e) runs green on the skeleton
  locally and in CI, with `doctor` and `--version` as the only commands.
