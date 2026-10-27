---
schema_version: 1
id: fixture-stack
kind: stack
name: fixture-stack
description: Fixture for add acceptance tests.
tags: [fixture]
fragments:
  required: [fixture-required]
  default: [default-only]
verify:
  - { name: stack-check, run: "true", layer: test }
env: { SHARED: project, OLD: kept }
commands: { test: project-test }
---

STACK BODY MUST NOT REAPPEAR
