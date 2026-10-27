---
schema_version: 1
id: bun-web
kind: stack
name: Bun web app
description: A Bun web app with a typed API and browser tests.
tags: [bun, web, scripts]
tools: [bun]
env:
  PORT_WEB: "5173"
fragments:
  default: [ci-github]
  optional: [docker-deploy, todo-app]
verify:
  - { name: install, phase: setup, layer: install, run: bun install }
  - { name: test, layer: test, run: bun run test }
---

# Bun web app

Guidance for the building agent.
