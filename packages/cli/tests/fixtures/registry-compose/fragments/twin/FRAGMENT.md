---
schema_version: 1
id: twin
kind: fragment
category: app
name: Twin app
description: An app fragment with the same id as the twin stack.
applies_to: [twin]
requires_tools: [twinctl]
decisions:
  - "Twin storage (default: files)."
verify:
  - { name: twin-e2e, layer: test, run: bun run e2e }
---

# Twin app

APP-TWIN-BODY
