---
schema_version: 1
id: lint
kind: fragment
category: tooling
name: Lint
description: A linter, required by the web stack.
requires: [format]
deps:
  test: [vitest, playwright]
commands:
  lint: Lint the project
verify:
  - { name: lint, layer: lint, run: bun run lint }
---

# Lint

## Setup

Configure the linter.
