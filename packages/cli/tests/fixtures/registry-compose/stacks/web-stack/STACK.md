---
schema_version: 1
id: web-stack
kind: stack
name: Web stack
description: A Bun web app the composition tests build on.
tags: [bun, web, scripts]
tools: [bun]
deps:
  test: [vitest]
env:
  PORT_WEB: "5173"
decisions:
  - "Package manager (default: bun)."
merge: [.claude/settings.json]
commands:
  install: Install dependencies
  test: Run the unit tests
  dev: Run the dev server
fragments:
  required: [lint]
  default: [ci, docker-deploy, todo-app]
  optional: [hooks-a, notes-app, old-ci, rival]
verify:
  - { name: install, phase: setup, layer: install, run: bun install }
  - { name: test, layer: test, run: bun run test }
  - name: web
    phase: serve
    layer: serve
    run: bun run dev
    expect: { http: "http://localhost:${PORT_WEB}/" }
  - { name: deploy-dry-run, layer: build, run: bun run deploy:check, tags: [prod], timeout: 15m }
---

# Web stack

Guidance for the building agent.

## Layout

The app lives in `src/`.

### Tests

```sh
# install first
bun install
```

<!-- quickstack:when stack=web-stack -->
STACK-BLOCK-KEPT
<!-- quickstack:end -->
<!-- quickstack:when stack=other-stack -->
STACK-BLOCK-DROPPED
<!-- quickstack:end -->
<!-- quickstack:when tag!=go -->
NOT-GO-KEPT
<!-- quickstack:end -->
<!-- quickstack:when tag!=web,go -->
NOT-WEB-DROPPED
<!-- quickstack:end -->
<!-- quickstack:when with=hooks-a -->
WITH-HOOKS-A
<!-- quickstack:end -->
<!-- quickstack:when preset=sandbox -->
SANDBOX-ONLY
<!-- quickstack:end -->
<!-- quickstack:when preset=default mode=new -->
DEFAULT-PRESET-NEW
<!-- quickstack:end -->
