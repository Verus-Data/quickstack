---
description: Execute a plan as the orchestrator, delegating the coding to Codex (gpt-6.1-sol, high effort)
argument-hint: <plan file, e.g. plans/phases/phase-2.0a-composed-files-and-fingerprint.md>
---

# Execute a plan with Codex

Load `ce:executing-plans`, then the `delegate` skill, then `ce:architecting-systems` (rules/architecture.md asks for it before executing any file in `plans/phases/`). Execute $ARGUMENTS as `ce:executing-plans` describes, with these changes: you are the orchestrator and never the implementer, its sub-agents are Codex delegates run through `scripts/delegate.sh` (model and effort default to `gpt-6.1-sol` and `high`), and where it differs from this repo, the repo wins. A plan's `##` sections and its acceptance tests are the units to group.

## Before any code

Read the plan, `plans/HANDOFF.md` and the shared contracts the plan cites in the roadmap. Check the plan's claims against the code; ask about real ambiguity before starting. Enter a worktree for the integration branch (`EnterWorktree`), and track each unit as a task.

Look up the installed `ce` skills once, since a tracked file can't name their location:

```bash
ce=$(ls -d "$HOME"/.claude/plugins/cache/*/ce/*/ | sort -V | tail -1)
echo "${ce}skills/writing-tests/SKILL.md" "${ce}skills/architecting-systems/SKILL.md"
```

## Units and contracts

Split the plan into units per `ce:executing-plans` (one subsystem each, 3-4 tasks at most). For a sub-phase with numbered acceptance tests, rules/cli/testing.md "Process and gate" applies: the first unit is a test-author delegate that writes the plan's acceptance tests and realistic edge cases as tagged, failing tests, and the implementer delegates that follow make them pass without editing those assertions.

Each unit gets its own worktree off the integration branch (`git worktree add .claude/worktrees/<unit> -b delegate/<unit>`, then `bun install --frozen-lockfile` there) and a contract filled from `.claude/skills/delegate/contract.md` in the scratchpad. Every contract:

- names the plan file and the sections the unit implements, and the directory or package in scope; Codex chooses internal structure;
- gives the absolute path of `ce:writing-tests`' SKILL.md (any unit that writes tests) and `ce:architecting-systems`' SKILL.md with its Structure, Coupling and Boundaries references (any unit that adds or changes a module, service, schema or contract), and tells Codex to read and apply them;
- names the repo rules that apply (rules/cli/*.md, rules/typescript.md, rules/architecture.md, `.claude/skills/effect/SKILL.md`), since Codex reads only AGENTS.md on its own;
- ends with the template's hand-off report, unchanged.

Run independent units as 2-4 delegates at once, each `scripts/delegate.sh <contract> --write --worktree <path>` with `run_in_background: true`. A unit that depends on another starts from a worktree branched after the first one is integrated.

## When a delegate hands back

1. Read its whole hand-off report (`last-message.md` in the run's log directory; the digest prints the path), then the diff and the new files in full. Check each claim and every "look closer" item against the code; rerun the checks it reports.
2. Dispatch `ce:code-reviewer` once on the unit's diff (`git -C <worktree> diff <integration branch>` plus untracked files), loading `ce:writing-tests`, `ce:architecting-systems` and, where errors changed, `ce:handling-errors` into its prompt, along with the plan section and the hand-off report.
3. Send every finding back to Codex as a follow-up contract in the same worktree, quoting the findings and the earlier report. Fix a finding yourself only when it is smaller than its contract. The unit isn't finished until its findings are addressed. This is the one review pass rules/agent-ops.md allows: don't re-review after the fixes.
4. Refactor pass, per the `delegate` skill: bring the code to this repo's standard with Edit, keep the diff surgical, and run `bun run check` in the worktree.
5. Commit on the unit's branch and merge it into the integration branch. Remove the unit's worktree and branch.

Same failure twice from a delegate: stop and ask, as `ce:executing-plans` says. A delegate that went the wrong way gets a narrower contract, not a rewrite by you.

## Finishing the plan

On the integration branch, run `bun run check` and read its counts as rules/cli/verification.md asks, revert-verify each new regression test, and run the changed commands in all three audiences as rules/cli/cli.md "Verifying UX" describes, judging the output as the agent that will use it. Record what the plan got wrong in its "What this plan may get wrong" section, update its `Status:` line and `plans/HANDOFF.md`, then commit, merge to main and push. Remove the integration worktree.

Report to the user: what landed, per unit what Codex did and what you changed in review and refactor, the review findings and how each was resolved, and anything left open.
