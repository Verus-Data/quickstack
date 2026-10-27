---
schema_version: 1
id: stage-stack
kind: stack
name: Stage stack
description: A base whose readiness is controlled by a file in the project.
tags: [fixture]
fragments:
  optional: [stage-app]
verify:
  - { name: base-setup, phase: setup, run: "echo base-setup >> order.log" }
  - { name: base-test, layer: test, run: "test -f base-ready" }
  - { name: base-lint, layer: lint, run: "echo base-lint >> order.log" }
  - { name: base-clean, phase: teardown, run: "echo base-clean >> order.log" }
---

# Stage stack

Create `base-ready` when the base is ready to verify.
