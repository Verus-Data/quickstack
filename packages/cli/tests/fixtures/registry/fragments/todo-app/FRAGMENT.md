---
schema_version: 1
id: todo-app
kind: fragment
category: app
name: Todo app
description: A small todo app built on the web stack.
applies_to: [bun-web]
verify:
  - name: todo-serve
    phase: serve
    run: bun run dev
    expect: { http: "http://localhost:${PORT_WEB}/" }
---

# Todo app
