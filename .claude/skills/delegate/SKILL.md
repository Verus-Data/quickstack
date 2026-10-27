---
name: delegate
description: Hand a coding task to a Codex delegate (gpt-6.1-sol, high effort) in its own worktree, then review its diff, refactor it to this repo's standard, run the gate and commit it yourself. The default for implementation, tests and refactors whose contract you can write down. Not for design, plans or harness changes.
---

# Delegating to Codex

Claude is the orchestrator. Codex writes the first draft of the code in an isolated worktree;
Claude writes the contract, reviews the diff, does a refactor pass, runs the gate and commits.
Codex is trusted like Claude Code: with `--write` it runs unsandboxed, with your environment
and your own Codex config, so it has the network, `bun add`, git and the whole gate, including
the compiled-binary e2e and the process-group tests. It leaves its changes uncommitted only
because the review and refactor come before the commit. Claude
subagents still go through the Agent tool, never this script.

## When it fits

Delegate coding work you can specify before any code exists: the goal, the interface, the area
of the tree in scope, the acceptance tests and the command that runs them. That covers feature
work against a sub-phase plan (the plan is most of the contract: point at it and add the scope
and the gate), test authoring for existing behaviour, and mechanical refactors. Give a feature
the room a plan needs: scope a directory or package rather than a file list, let Codex choose
internal structure, and judge the result in review.

Keep it yourself when the task is design (an RFC, a plan, a contract in the roadmap table), when
it changes the harness (`.claude/`, lefthook, CI), when it is a few lines you would finish
faster than you could write the contract, or when you can't yet say what done looks like.

## Workflow

1. Worktree. One per delegate, under the main checkout's `.claude/worktrees/`, with
   dependencies installed (the script refuses a worktree without `node_modules`):

   ```bash
   git worktree add .claude/worktrees/<name> -b delegate/<name>
   (cd .claude/worktrees/<name> && bun install --frozen-lockfile)
   ```

2. Contract. Copy `contract.md` beside this file into the scratchpad and fill it in. Codex
   reads `AGENTS.md` on its own but never sees `.claude/rules/` or this conversation, so the
   contract names the rule and skill files that apply and carries every constraint itself.

3. Run it in the background (`run_in_background: true`); you are notified when it exits:

   ```bash
   scripts/delegate.sh <contract.md> --write --worktree .claude/worktrees/<name>
   ```

   Read-only is the default; `--write` lets Codex edit the worktree. Read-only suits review and
   investigation only: Vitest writes `node_modules/.vite-temp`, so no test runs without `--write`. Independent units run as
   2-4 delegates at once, one worktree each. The digest (result, commands run, files written,
   last message) is the command's output; full logs stay under `$TMPDIR/quickstacks-delegate/`.

4. Review. `success` only means the turn finished. Read the whole hand-off report
   (`last-message.md` in the run's log directory), then `git -C <worktree> diff` and the new
   files in full. Check every changed path is in scope, each claim against the code and a rerun
   of the checks it names, and each "look closer at" item yourself. Then dispatch
   `ce:code-reviewer` once on the worktree's diff, with the contract, the hand-off report and the
   skills that apply in its prompt, and send its findings back to Codex as a follow-up contract
   in the same worktree. That is the one review pass in `rules/agent-ops.md`; don't re-review
   after the fixes. A diff that took the wrong shape also goes back as a narrower follow-up
   contract rather than a rewrite.

5. Refactor pass. Bring the code to the standard you would have written it to, with the Edit
   tool so the lint, typecheck and boundary hooks see every change (none of them ran for
   Codex). Match the surrounding code's naming, comment density and idiom; cut abstractions,
   options and defensive branches the task didn't ask for; replace custom code with the
   project's existing helpers and Effect idioms (`.claude/skills/effect/SKILL.md`); make tests
   assert behaviour through the real interfaces `AGENTS.md` "Testing" describes, with no mocks;
   check errors follow `AGENTS.md` "Error handling". Keep the diff surgical: anything Codex
   touched outside the task gets reverted.

6. Gate and commit. Run `bun run check` in the worktree, commit there with a Conventional
   Commits message, and land it the way the task calls for. Remove the worktree and branch once
   landed. `/execute:codex <plan>` runs this loop over a whole plan.

A session that is itself isolated in a worktree may not be able to run git in another one: copy
the reviewed files (the digest lists them) into your own worktree and commit there.
