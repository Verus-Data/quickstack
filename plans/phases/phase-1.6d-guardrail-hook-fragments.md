# Phase 1.6d: Guardrail hook fragments

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | The Claude Code guardrails that ship in the `agent-ops` fragment: five bash-3.2 hook scripts and their shared library, the `.claude/settings.json` merge with its deny rules, and the `.claude/README.md` skeleton, each with behavior tests that run inside `bun run test`, so a generated project is safe to hand to an agent |
| Traces to | Job 1 ("agent config"); the brief "refuses to let the agent weaken a step" (D14); success row "The result is complete" |
| Depends on | [1.6a](phase-1.6a-bundled-stack-content.md) (the `agent-ops` fragment and the bundled stacks whose generated projects the tests run on), 1.5 (`validate`) |
| Blocks | [1.6b](phase-1.6b-mvp-gate-runs.md) (the gate runs ship these hooks) |
| Decisions needed | D18 (entry format; adapters live under `adapters/claude/`). D14 (changed steps fail verify) shapes the manifest deny rule |
| Settles | The hook set, the destructive-command and secret-shape lists, and the deny rules the bundled `agent-ops` ships for Claude Code |

## Where this fits

1.6a writes the stacks and the `agent-ops` fragment's body, `AGENTS.md` skeleton and
verify steps. This sub-phase adds the files that make a generated project safe to hand to
an agent, and the demo shows them, so their contents are fixed here rather than left to
whoever writes them. Every file ships under `agent-ops`'s `adapters/claude/` (Claude
Code's format; other agents' native adapters are
[3.4b](phase-3.4b-native-agent-adapters.md)). Paths are output paths, and dotfiles are stored
literally (D18 as amended), so `adapters/claude/.claude/settings.json` is written as
`.claude/settings.json`. `agent-ops` lists `.claude/settings.json` in its `merge`, so
other fragments' hook entries deep-merge into it (1.1). [3.4a](phase-3.4a-agent-harness-fragment.md) later
offers a TypeScript harness that replaces the regex guard with a lexer.

## Scope

In:

- The hook scripts and their library, `.claude/settings.json` and `.claude/README.md` below.
- One paragraph in `agent-ops`'s body saying what the hooks are for and the one rule (a
  block means ask the user).
- Behavior tests for every hook, run inside `bun run test`.

Out:

- The `agent-ops` body beyond that paragraph, the `AGENTS.md` skeleton and the verify
  steps (1.6a).
- Hooks for agents other than Claude Code (3.4b) and the TypeScript harness (3.4a).
- A dedicated CI job across more shells and a runner image without `jq`
  ([5.0](phase-5.0-ci-release-and-checks.md)).

## Design

### Files

| Output path | What it does |
|---|---|
| `.claude/hooks/lib.sh` | Shared shell library every hook sources: read one field from the hook's JSON input (with `jq` when it is on PATH, otherwise a small `sed`-based reader that handles the few flat string fields the hooks need), print a bounded message (at most 40 lines), emit the agent's block response, find the project root. Written for bash 3.2 (macOS's `/bin/bash`): no associative arrays, `mapfile`, `${var,,}`, `\|&` or `;&` |
| `.claude/hooks/session-start.sh` | SessionStart: prints a short orientation (whether `AGENTS.md` is filled, which of the stack's tools are missing from PATH, whether `.quickstacks/BRIEF.md` exists and the project hasn't reached green yet), at most 15 lines |
| `.claude/hooks/guard-destructive.sh` | PreToolUse on the shell tool: blocks a command matching the pattern list below and tells the agent to ask the user instead of working around the block |
| `.claude/hooks/guard-secrets.sh` | PreToolUse on file writes and edits: blocks content with a secret shape (below), and any write to `.env` or `.env.*` other than `.env.example` |
| `.claude/hooks/lint-on-write.sh` | PostToolUse on file writes and edits: runs the project's lint for the written file through the project's task runner, found at run time (a `lint` target in the `Makefile`, else a `lint` script in `package.json`; templates have no conditionals, D1), and returns its diagnostics as context, bounded, never blocking. A missing lint command is silent: the agent may not have created it yet |
| `.claude/hooks/format-on-stop.sh` | Stop: runs the project's `format` command (found the same way) over the files git reports changed, then exits 0 whatever happens |
| `.claude/settings.json` | A `merge` path: wires each hook once, and holds `permissions.deny` rules for reading `.env` and `.env.*` (not `.env.example`), for `git push --force`, `git commit --no-verify` and `git push --no-verify`, and for editing `.quickstacks/manifest.json` (D14: the agent can't weaken the steps by accident even before verify catches it) |
| `.claude/README.md` | Skeleton with `quickstacks:fill` markers: what each hook does, what a block means ("ask the user; never work around a deny"), how to turn one off for a session, and where the patterns live |

Destructive-command patterns, one list in `guard-destructive.sh`, matched against the
command after collapsing whitespace (a regex list, not a shell parser;
3.4a's harness replaces it with a lexer):

- `rm -r` with `-f` in any flag order, whose target is `/`, `~`, `$HOME`, `.`, `..`, `*`
  or `/*`
- `git reset --hard`, `git clean` with `-f` and `-d` or `-x`, `git checkout -- .`,
  `git restore .`, `git branch -D`, `git stash clear`
- `git push` with `--force`, `-f` or `--force-with-lease`; `git commit` or `git push`
  with `--no-verify`
- `chmod -R 777`, `chown -R` on `/` or `~`
- `dd` with `of=/dev/`, `mkfs`, a fork bomb
- `curl` or `wget` piped into `sh`, `bash` or `zsh`
- `sudo`

Secret shapes, one list in `guard-secrets.sh`: private key headers (`-----BEGIN ... PRIVATE KEY-----`), cloud access
key ids of the `AKIA` plus 16 characters form, GitHub token prefixes (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), Slack token
prefixes (`xoxb-`, `xoxp-`, `xoxa-`), payment live keys (`sk_live_`, `rk_live_`), and long `sk-`-prefixed API keys.
A match blocks with the pattern's name, never the matched text.

`.claude/README.md` gets no verify step: verify steps can't depend on the target agents,
and a project without Claude Code as a target doesn't have the file.

### Budget

The hooks paragraph in `agent-ops`'s body counts toward 1.6a's 300-word budget for the
fragment. Details live in `.claude/README.md`, which is shipped Markdown: 1.5 reports it
as a `shipped` row with no limit, and the agent reads it only when a hook fires. The
scripts aren't prose and don't count.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/registry/fragments/agent-ops/adapters/claude/` | `.claude/hooks/*.sh`, `.claude/settings.json`, `.claude/README.md` (literal names, 1.0) |
| `packages/cli/registry/fragments/agent-ops/FRAGMENT.md` | The hooks paragraph |
| `packages/cli/tests/registry-hooks.test.ts`, `tests/fixtures/hook-input/` | Behavior tests for the shipped hooks, with recorded hook-input JSON per tool |

## Acceptance tests

`tests/registry-hooks.test.ts`, on the files `new astro-blog --no-launch` writes into a
temp dir:

- Each guard blocks every pattern in its list and allows a near miss for each (removing
  `./dist`, a plain `git push`, `git reset --soft`, `.env.example`, a 10-character `sk-`
  string), with the block response in the agent's documented shape and the pattern's
  name, never the matched text, in the message.
- Every hook runs under `/bin/bash` when it is bash 3.x (macOS), and under the `bash` on
  PATH otherwise; the test prints which. A static check fails on any bash 4 construct
  (`declare -A`, `mapfile`, `readarray`, `${x,,}`, `${x^^}`, `|&`, `;&`) in a shipped
  script.
- Every hook gives the same decision with `jq` on PATH and with a PATH built without it.
- Composing each bundled stack, `.claude/settings.json` wires each hook command
  exactly once, even though several fragments merge into it, and each deny rule appears
  once.
- Every shipped script is executable.
- `lint-on-write.sh` with no lint command defined exits 0 silently; `format-on-stop.sh`
  with a failing `format` command exits 0.
- `validate` over the bundled registry still has zero errors and zero warnings.

These run inside `bun run test`, so the existing CI job runs them on Ubuntu and macOS with
no workflow change.

## Exit criteria

- `bun run check` green from the repo root.
- `validate` over the bundled registry: zero errors, zero warnings, and `agent-ops`'s
  body within 1.6a's budget.

## What this plan may get wrong

- The guard pattern lists are regexes over a command string. Quoting, `eval`, aliases and
  scripts that call the command indirectly defeat them; they stop accidents, not an agent
  set on getting past them, and the README says so. 3.4a's lexer-based guard is the
  stronger version.
- Hook input and block-response shapes are the agent's, and they change. The fixtures in
  `tests/fixtures/hook-input/` are dated; a mismatch shows up in 1.6b's gate runs as hooks
  that never fire (2.0b records whether they fired).
- A `sed`-based JSON reader handles only flat string fields. A hook that needs nested
  input needs `jq` or the 3.4a harness.
- 2026-10-26: the shipped files were planned under a `_dot_` escape (`_dot_claude/`) and
  tested against three stacks. The amended D18 stores dotfiles literally, and 1.6a now
  brings the whole catalog into v1, so the settings merge test runs over every bundled
  stack. 1.1's merge concatenates arrays, so "each hook command exactly once" depends on
  no two fragments shipping the same hook entry; if one does, the test fails and the
  duplicate moves to one owner.
