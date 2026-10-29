---
schema_version: 1
id: ce-plugin
kind: fragment
category: agent-ops
name: Claude Essentials plugin
description: Enables the claude-essentials (ce) Claude Code plugin for the project and adds path-scoped rules that point Claude at its skills for testing, error handling, debugging, and writing.
tags: [agents, claude]
applies_to: []
requires: [agent-ops]
merge: [.claude/settings.json]
---

# Claude Essentials plugin

Enable the `ce` Claude Code plugin and connect its skills through project rules.

## What to add

**Settings.** The merge into `.claude/settings.json` registers the marketplace and enables the plugin. It may appear only after the user trusts the project folder and starts another session.

**Rules.** The shipped `.claude/rules/` files route Claude to skills and defer project facts to AGENTS.md:

| Rule | Loads for | Points at |
| --- | --- | --- |
| `testing.md` | test files and test directories | `ce:writing-tests`, `ce:fixing-flaky-tests` |
| `error-handling.md` | source files (TS/JS, Python, Go, Rust) | `ce:handling-errors` |
| `debugging.md` | always | `ce:systematic-debugging`, `ce:optimizing-performance`, the debugging budget in `AGENTS.md` |
| `writing.md` | Markdown and `docs/` | `ce:writer`, `ce:visualizing-with-mermaid` |

Check the `paths:` globs against the real layout; narrow overly broad matches. Put stack-specific testing rules in `testing.md` under `## Project specifics`, without repeating AGENTS.md. Add other skill rules only where matching project files exist.

Don't copy skill content into rules or AGENTS.md. Note the plugin and rule routing in CLAUDE.md.

## Gotchas

- Check the plugin's current skill list before adding a rule; an unknown skill name silently does nothing.
