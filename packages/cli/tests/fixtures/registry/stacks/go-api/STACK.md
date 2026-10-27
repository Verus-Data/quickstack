---
schema_version: 1
id: go-api
kind: stack
name: Go API
description: A Go HTTP API with make targets.
tags: [go, api, make]
tools: [go, make]
fragments:
  required: [editor-config]
verify:
  - { name: test, layer: test, run: make test }
---

# Go API
