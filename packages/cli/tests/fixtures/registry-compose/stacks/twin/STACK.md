---
schema_version: 1
id: twin
kind: stack
name: Twin stack
description: Shares its id with an app fragment, so owners must say which one they mean.
tags: [bun, scripts]
tools: [bun]
fragments:
  optional: [twin]
verify:
  - { name: twin-build, layer: build, run: bun run build }
---

# Twin stack

STACK-TWIN-BODY
