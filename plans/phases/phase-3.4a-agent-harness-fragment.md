# Phase 3.4a: Agent harness fragment

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | An optional `agent-harness-ts` fragment gives TypeScript projects a stronger Claude Code harness than 1.6d's shell guardrails: hooks run by Bun from TypeScript, a destructive-command guard built on a real shell lexer, a generated-file guard, typecheck-on-write, `/check`, `/test` and `/feature` commands, architect and reviewer agents and a harness doc, with its own hook test suite and a bench comparison against the shell guardrails |
| Traces to | Job 1: "with tests, lint, CI and agent config"; the trust paragraph in Jobs: the agent must not be able to quietly weaken the project; the success row "The result is complete" |
| Depends on | [1.6a](phase-1.6a-bundled-stack-content.md) (the `agent-ops` fragment), [1.6d](phase-1.6d-guardrail-hook-fragments.md) (its guardrail hooks, which this one extends), [2.0b](phase-2.0b-bench.md) (bench runs and `hooksFired`), [2.0c](phase-2.0c-run-ledger.md) (the ledger the comparison reads), [2.2](phase-2.2-deterministic-rot-checks.md) (`ref-hook` and `import-closure` checks on the shipped hook code) |
| Blocks | Nothing. [3.4b](phase-3.4b-native-agent-adapters.md) ports the guardrails, not this harness |
| Decisions needed | None new. D5 (the fragment body is at most 1,000 words; most of the content is files, not prose) and D7 |
| Settles | What the TypeScript harness ships; how it composes with `agent-ops` without double-wiring hooks; how its hooks are tested; whether it beats the shell guardrails in bench runs |

## Scope

In:

- A fragment `agent-harness-ts` (`category: agent-ops`, `applies_to` tags `node`, `bun`, `requires: [agent-ops]`, `requires_tools: [bun]`), optional on every TypeScript stack.
- Shipped under `adapters/claude/`:

| Piece | Behavior |
|---|---|
| Hook runtime | One `bun` entry that dispatches hook events to TypeScript handlers; a handler that throws fails open with a logged reason, except the guards, which fail closed |
| Destructive-command guard | Tokenizes the command with a shell lexer (quotes, escapes, `&&`, `;`, pipes, subshells, `env` and `sudo` prefixes) and blocks recursive deletes outside the project, force pushes to the default branch, `git reset --hard` on a dirty tree, history rewrites and disk-level commands; replaces `agent-ops`'s pattern-list guard when both are present |
| Generated-file guard | Refuses writes to files the project marks generated (a header marker or a listed path), with the regenerate command in the message |
| Typecheck-on-write | Runs the project's typecheck command on the changed file's project after a write and returns diagnostics to the agent as context |
| Commands | `/check` (the project's gate), `/test` (one file or all), `/feature` (plan, failing test, implement, gate) |
| Agents | `architect` (read-only design review) and `reviewer` (read-only diff review) definitions |
| Harness doc | `.claude/README.md` section describing each hook and how to disable one |

- A hook test suite shipped with the fragment and run by its own verify step (`layer: test`).
- A bench comparison against `agent-ops` alone.

Out:

- Native versions for other agents ([3.4b](phase-3.4b-native-agent-adapters.md) ports `agent-ops`, which is the default; this fragment stays Claude Code only until a second agent's hook format can express the same guards).
- Non-TypeScript stacks. The shell guardrails cover them.
- Any change to the CLI. This is content.

## Design

### Where this fits

The `agent-ops` fragment (1.6a, with its hooks from 1.6d) ships the shell guardrails every stack gets: a session-start hook, a destructive-command block from a pattern list, secret-shaped write detection, lint-on-write and format-on-stop. Pattern lists miss quoted and chained commands, and shell hooks can't typecheck. A TypeScript project already has Bun or Node on hand, so it can afford a real lexer and a typecheck hook. This fragment is optional because it adds a toolchain dependency to the harness itself.

### Composing with `agent-ops`

Both fragments write `.claude/settings.json`, which is in both `merge` lists (1.1's deep merge), and a deep merge of two guard entries would wire two guards. Conditional markers apply to prose, not JSON, and shipping the same hook path from both fragments is a file-ownership conflict under 1.1's single-ownership rule. So the split is:

- `agent-ops` keeps ownership of `.claude/hooks/guard-destructive.sh` and its settings entry.
- This fragment's guard is `.claude/hooks/ts/guard.ts`, and `guard-destructive.sh` checks for `.claude/hooks/ts/guard.ts` at run time and delegates to it through Bun when present.

That keeps one settings entry, one owner per file, and a project where removing the harness directory falls back to the shell guard. The hook test suite asserts the wiring appears exactly once after the merge.

### Hook tests

The suite (`.claude/hooks/ts/*.test.ts`, run with `bun test` from the fragment's verify step) covers:

- The lexer: quoted arguments, escaped spaces, `&&`/`;`/`|` chains, `$(...)` and backticks, `env X=1` and `sudo` prefixes, heredocs. Each blocked command class has a positive and a quoted-false-positive case (`echo "rm -rf /"` is allowed).
- Fail-closed guards: a guard handler that throws blocks the call.
- The generated-file guard with a header marker and with a listed path.
- Typecheck-on-write returning diagnostics as context and not blocking.
- The settings merge with `agent-ops`: the guard entry appears once.

`validate` (2.2's `import-closure` and `ref-hook`) checks that every hook command in the merged settings names a composed file and every import resolves inside the fragment or `agent-ops`.

### Bench comparison

Two bench runs of the same stack (`astro-blog` is the TypeScript-capable small stack) with `--with agent-harness-ts` and without, same agent, same commit apart from the fragment. The run notes compare time to green, verify count, `## Asked` count, `hooksFired` (2.0b), and any blocked command the agent hit. The fragment lands if its run is `pass`; the comparison is evidence for whether it should become a default, not a gate.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/registry/fragments/agent-harness-ts/` | `FRAGMENT.md`, `adapters/claude/` (hooks, commands, agents, settings), `files/` for the harness doc section |
| `packages/cli/registry/fragments/agent-ops/adapters/claude/` | `guard-destructive.sh` delegates to the TypeScript guard when present |
| `packages/cli/tests/registry.test.ts` | Composition with and without the harness |
| `packages/cli/registry/runs.json`, `plans/runs/` | Two bench records and notes |

## Acceptance tests

- `new astro-blog --with agent-harness-ts --no-launch --json`: composes, the merged `.claude/settings.json` has the guard entry exactly once, no file has two owners, and `validate` reports zero warnings.
- The shipped hook suite passes when run from a scaffolded project (the composition test runs `bun test` inside a temp project only in the e2e layer, since it executes shipped code).
- `guard-destructive.sh` from `agent-ops` alone blocks its patterns; with the harness present it delegates and blocks the lexer's cases, including one chained command the pattern list misses.
- `--with` the fragment on `<go-stack>`, a stack its `applies_to` excludes, composes it with a `with_not_applicable` warning (1.1 as built: an explicit `--with` is kept), and `validate`'s per-fragment composition doesn't pair it with that stack.
- Both bench runs are in the ledger, the harness run is `pass`, and its `hooksFired` names the guard and typecheck hooks.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- The bench comparison note is written, with a one-line recommendation on making the fragment a default for TypeScript stacks.

## What this plan may get wrong

- Delegating from the shell guard couples the two fragments at run time. If that proves brittle, the alternative is a format feature (a fragment replacing another's file), which is a D18 change.
- A lexer-based guard is still a guard against accidents, not an adversary; an agent with full permissions can write its own script and run that. The harness doc says so.
- Typecheck-on-write can be slow on large projects and annoy more than help. The hook has a time limit and skips when exceeded, logging that it did.
- 2026-10-26: the fragment's frontmatter was written camelCase and a `--with` that doesn't fit was expected to fail `ComposeConflict`. The amended D18 uses snake_case keys (`applies_to`, `requires_tools`), and 1.1 keeps an explicit `--with` that doesn't fit, with a warning; the test now checks the warning.
