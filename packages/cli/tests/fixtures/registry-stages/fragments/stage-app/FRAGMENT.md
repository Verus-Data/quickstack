---
schema_version: 1
id: stage-app
kind: fragment
category: app
name: Stage app
description: An application whose readiness is controlled independently of the base.
applies_to: [stage-stack]
verify:
  - { name: app-setup, phase: setup, run: "echo app-setup >> order.log" }
  - { name: app-test, layer: test, run: "test -f app-ready" }
  - { name: app-lint, layer: lint, run: "echo app-lint >> order.log" }
  - { name: app-clean, phase: teardown, run: "echo app-clean >> order.log" }
---

# Stage app

Create `app-ready` when the application is ready to verify.
