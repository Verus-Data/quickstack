---
description: Execute a plan as the orchestrator, delegating the coding to Codex (gpt-6.1-sol, high effort)
argument-hint: <plan file, e.g. plans/phases/phase-2.0a-composed-files-and-fingerprint.md>
---

# Execute a plan with Codex

Load `ce:executing-plans`, then the `delegate` skill, then `ce:architecting-systems` (rules/architecture.md asks for it before executing any file in `plans/phases/`). Execute $ARGUMENTS as `ce:executing-plans` describes, with these changes: you are the orchestrator and never the implementer, its sub-agents are Codex delegates run through `scripts/delegate.sh` (model and effort default to `gpt-6.1-sol` and `high`), and where it differs from this repo, the repo wins. A plan's `##` sections and its acceptance tests are the units to group.

## Before any code

Read the plan, `plans/HANDOFF.md` and the shared contracts the plan cites in the roadmap. Check the plan's claims against the code; ask about real ambiguity before starting. Enter a worktree for the integration branch (`EnterWorktree`), and track each unit as a task.

## Units and contracts

Split the plan into units per `ce:executing-plans` (one subsystem each, 3-4 tasks at most). For a sub-phase with numbered acceptance tests, rules/cli/testing.md "Process and gate" applies: the first unit is a test-author delegate that writes the plan's acceptance tests and realistic edge cases as tagged, failing tests, and the implementer delegates that follow make them pass without editing those assertions.

Each unit gets its own worktree off the integration branch (`git worktree add .claude/worktrees/<unit> -b delegate/<unit>`, then `bun install --frozen-lockfile` there) and a contract filled from `.claude/skills/delegate/contract.md` in the scratchpad. Every contract:

- names the plan file and the sections the unit implements, and the directory or package in scope; Codex chooses internal structure;
- names the repo rules that apply (rules/cli/*.md, rules/typescript.md, rules/architecture.md, `.claude/skills/effect/SKILL.md`), since Codex reads only AGENTS.md on its own;
- keeps the template's "Skills to apply" (Codex finds `ce:writing-tests` and `ce:architecting-systems` in the plugin cache itself), "Review before hand-off" with the integration branch as the base and the contract's own path filled in, and "Hand-off", unchanged.

Codex finishes a unit only after it has run one `ce:code-reviewer` pass on its own diff, in a fresh Codex process, and resolved every finding. You don't dispatch a reviewer for delegated work; that pass is the one rules/agent-ops.md allows.

Run independent units as 2-4 delegates at once, each `scripts/delegate.sh <contract> --write --worktree <path>` with `run_in_background: true`. A unit that depends on another starts from a worktree branched after the first one is integrated.

## When a delegate hands back

1. Read its hand-off report (`last-message.md` in the run's log directory; the digest prints the path) first and let it direct your attention. If it has no review section, or a finding is left unresolved without a good reason, send it back with a follow-up contract before reading further.
2. Read the diff and new files, spending your attention on the "look closer at" items, the decisions it made and the review findings it disputed. Check those against the code; don't re-derive what the report and the review already establish.
3. Refactor pass, per the `delegate` skill: bring the code to this repo's standard with Edit, keep the diff surgical, and run `bun run check` in the worktree. A problem bigger than a refactor goes back to Codex as a follow-up contract in the same worktree, quoting the report.
4. Commit on the unit's branch and merge it into the integration branch. Remove the unit's worktree and branch.

Same failure twice from a delegate: stop and ask, as `ce:executing-plans` says. A delegate that went the wrong way gets a narrower contract, not a rewrite by you.

## Finishing the plan

On the integration branch, run `bun run check` and read its counts as rules/cli/verification.md asks, revert-verify each new regression test, and run the changed commands in all three audiences as rules/cli/cli.md "Verifying UX" describes, judging the output as the agent that will use it. Record what the plan got wrong in its "What this plan may get wrong" section, update its `Status:` line and `plans/HANDOFF.md`, then commit, merge to main and push. Remove the integration worktree.

Report to the user: what landed, per unit what Codex did, what its review found and how it resolved it, what you changed in refactor, and anything left open.
