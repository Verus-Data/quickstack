---
schema_version: 1
id: my-api
kind: stack
name: My API
description: "quickstack:fill: describe the stack"
tags: [make]
deps: {}
commands:
  install: Install dependencies
  lint: Run lint
  typecheck: Check types
  test: Run tests
tools: []
decisions: ["Project layout (default: a single package)."]
env: {}
verify:
  - { name: install, phase: setup, layer: install, run: make install }
  - { name: lint, phase: check, layer: lint, run: make lint }
  - { name: typecheck, phase: check, layer: typecheck, run: make typecheck }
  - { name: test, phase: check, layer: test, run: make test }
  - name: readme
    phase: check
    layer: docs
    run: "test -s README.md && ! grep -n 'quickstack:fill' README.md"
merge: []
fragments: { required: [], default: [], optional: [] }
---
## Layout

Describe the project's directories.

## Setup

Describe setup steps.

## Conventions

Describe the coding conventions.

## Tool configuration

Describe what the tools must enforce.

## Testing

Describe the test strategy.

## Commands

Describe the project commands.

## Gotchas

Describe common mistakes.
