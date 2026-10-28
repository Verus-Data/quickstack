---
schema_version: 1
id: go-cli
kind: stack
name: Go CLI
description: A tiny official stack for telemetry acceptance tests.
tags: [scripts]
fragments:
  default: [tools]
  optional: [extra]
verify:
  - { name: install, phase: setup, layer: install, run: 'true' }
  - { name: lint, phase: check, layer: lint, run: 'true' }
  - { name: typecheck, phase: check, layer: typecheck, run: 'true' }
  - { name: test, phase: check, layer: test, run: 'true' }
---

Build the requested CLI.

## Setup

Use the project's existing tools.
