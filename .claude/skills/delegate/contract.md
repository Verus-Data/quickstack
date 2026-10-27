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

## Skills to apply

Read each and apply it to this task; your hand-off says where it changed what you did.

- `{absolute path to ce:writing-tests SKILL.md}`: for every test you write. Where it and
  `.claude/rules/cli/testing.md` differ, the rule wins.
- `{absolute path to ce:architecting-systems SKILL.md}`, with its `references/structure.md`,
  `coupling.md` and `boundaries.md`: before adding or changing a module, service, schema or
  contract. `.claude/rules/architecture.md` adds this repo's constraints on top.

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

## Hand-off

You're done when the acceptance checks pass or you're blocked. Leave everything uncommitted and
end with this report as your final message; the orchestrator reviews from it, so be specific
and name files and symbols.

1. Summary: what you built, in two or three sentences.
2. Files: each file created or changed, with one line on why.
3. Decisions: choices the contract left open and why you made them; any deviation from the
   plan or contract and the reason; where the skills changed your approach.
4. Checks: each command you ran and its result (test counts, not just "passed").
5. Look closer at: the places most likely to be wrong, such as assumptions you couldn't verify,
   edge cases you didn't cover, code you're least sure of, tests that are weaker than you'd
   like, and anything in the plan that looked wrong.
6. Open: what's left undone or blocked, and the questions you'd ask.
