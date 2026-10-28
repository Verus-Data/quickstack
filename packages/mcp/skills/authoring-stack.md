---
name: authoring-stack
description: How to write a stacks stack entry that composes, validates, and scaffolds cleanly
---

# Authoring a stacks stack

A stack is a directory under `stacks/<id>/` with an `entry.md` frontmatter
file and a `files/` tree. The CLI reads the frontmatter, composes selected
fragments, writes the files, and runs verify.

## Frontmatter

Use `kind: stack`, a unique `id`, a `name`, and a `description` under 2000
words. List optional fragments in `with` and default-excluded ones in
`without`. Tags help `list` filtering.

## files/

Every file is a template rendered with `composeFiles`. Use `{{variable}}`
placeholders for values the CLI supplies (project name, scope, agents).
Mark executable files with a frontmatter `executable: true` line. Never
put `.stacks/` or `.git/` paths in a stack — the CLI owns those.

## Verify steps

The stack's `files/.stacks/manifest.json` template carries the verify
steps: install, lint, typecheck, test, and anything project-specific. Each
step has a `run` command, a `phase` (setup, check, serve, teardown), a
`layer`, and a `timeout`. The CLI runs them in order; a setup failure skips
the rest.

## Rules

- The CLI executes nothing it reads and never calls an LLM.
- A stack writes files and a brief; verify runs the project's own commands.
- Don't pin versions or freeze config formats in the CLI or in `files/`.
- Keep the stack body under 2000 words; fragments under 1000.
- Test with `stacks validate <id>` before shipping.