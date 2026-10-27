---
schema_version: 1
id: local-add
kind: fragment
category: tooling
name: Local add
description: A project-origin fragment requiring confirmation.
verify:
  - { name: local-check, run: "printf ran > local-ran", layer: test }
---

# Local add guidance
