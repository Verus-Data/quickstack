# Contract: {TITLE}

<!-- Template. Copy into the scratchpad, fill every {PLACEHOLDER}, delete this comment and the
sections that don't apply, then run scripts/delegate.sh <filled-contract.md> --write --worktree <worktree> -->

## Goal

{One paragraph: the behaviour to add or change and why. Name the plan file and section it
implements, if any.}

## Read first

- `AGENTS.md` (already loaded): "Conventions", "Testing", "Error handling".
- `.claude/rules/typescript.md` and `.claude/rules/architecture.md`.
- For `packages/cli`: `.claude/rules/cli/cli.md`, `.claude/rules/cli/effect.md`,
  `.claude/rules/cli/testing.md` and `.claude/skills/effect/SKILL.md`.
- {The plan section, and the existing files whose patterns to follow.}

## Interface

{Signatures, types, schema names, error tags, file paths. Cite contracts by the name in the
roadmap's "Contracts every sub-phase shares" table; never rename or redefine one.}

## Scope

- May change: {files or directories}.
- Must not change: {files, public contracts, anything else}. Edit no file outside the scope; if
  the task can't be done inside it, stop and say why.

## Acceptance

{The tests that must exist and pass, as behaviours. A bug fix starts with a failing regression
test.}

Run, from the worktree root, and iterate until they pass:

```bash
{e.g. bun run --cwd packages/cli test:unit tests/<file>.test.ts}
bun run lint
bun run typecheck
bun run check   # the full gate, before finishing a feature
```

## Do not

- commit or push (leave the changes for review)
- disable a lint rule, weaken a test or add a cast to get green
- add features, options or abstractions the goal doesn't need

## Finish with

1. The files you created or changed.
2. Each check you ran and its result.
3. Open questions and anything you were unsure of or left undone.
