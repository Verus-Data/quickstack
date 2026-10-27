---
schema_version: 1
id: ran-check
kind: fragment
category: tooling
name: Ran check
description: Its verify step leaves a file behind if anything ever runs it.
verify:
  - { name: ran, run: touch ran }
---

# Ran check
