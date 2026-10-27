---
schema_version: 1
id: claude-harness
kind: fragment
category: agent-ops
name: Claude development harness
description: Shared Bun TypeScript hooks, commands, review agents, and tests for Claude development.
tags: [bun, agents]
applies_to: [node, bun]
requires: [agent-ops]
tools: [bun]
merge: [.claude/settings.json]
verify:
  - name: harness-hooks
    layer: test
    run: "test ! -f .claude/hooks/guard-commands.ts || node node_modules/vitest/vitest.mjs run tests/hooks"
  - name: harness-doc-filled
    layer: check
    run: "test ! -f docs/harness.md || ! grep -n 'stacks:fill' docs/harness.md"
---

# Claude development harness

This fragment ships only Claude Code files. When Claude isn't a target (`--agents codex`, for example), nothing here is written and the rest of this section doesn't apply; other agents get nothing from it.

When Claude is a target, the adapter supplies the shared hook runtime (`_lib.ts`, `_shell.ts`), generated-file, destructive-command and package-manager guards, incremental type checking, hook tests, `/check`, `/test`, `/feature`, and read-only `architect` and `reviewer` agents. Read `docs/harness.md` before changing the harness. Stacks and apps own their specialized hooks and permissions; each contribution merges `.claude/settings.json` and wires only files it owns.

Include `.claude/hooks/` in TypeScript checking and include `tests/hooks/**/*.test.ts` in the project's Vitest suite (Node environment). The helpers use Node APIs even though Bun executes them. `block-destructive.sh` delegates to `guard-commands.ts` when Bun is available; keep only the shell entry wired for Bash. The `harness-hooks` verify step runs the shipped suite on Node; it skips when no Claude adapter was written. A stack can supply `.claude/hooks/before-typecheck.ts` for generated types; the shared typecheck hook awaits it before tsc. Keep this helper bounded and quiet when tools are absent.

Populate `.claude/README.md` with the actual hooks, rules, commands, skills, and agents, and link the harness doc from AGENTS.md. In `docs/harness.md`, add a row to the layer table for each guard the stack or app ships, and replace its `stacks:fill` markers (commands, skills, lint plugins; `harness-doc-filled` checks). Add project commands to permissions only when safe to run without another prompt; leave paid and live third-party operations interactive. Every hook needs a deny/near-miss or advisory regression test and must appear exactly once in merged settings. Run the shipped tests and manually send a representative payload before completion.
