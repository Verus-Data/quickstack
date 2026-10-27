---
schema_version: 1
id: todo-app
kind: fragment
category: app
name: Todo app
description: A todo app on the web stack, a default the sandbox drops.
applies_to: [web-stack]
requires: [lint]
env:
  PORT_TODO: "5180"
commands:
  e2e: Run the browser tests
decisions:
  - "Storage (default: SQLite)."
verify:
  - { name: todo-e2e, layer: test, run: bun run e2e }
---

# Todo app

## Screens

APP-BODY: a list and a form.
