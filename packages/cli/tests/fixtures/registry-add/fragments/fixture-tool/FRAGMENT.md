---
schema_version: 1
id: fixture-tool
kind: fragment
name: fixture-tool
description: Fixture for add acceptance tests.
category: tooling
requires_tools: [fixture-tool]
verify:
  - { name: must-not-run, run: "printf executed > ADD_MUST_NOT_RUN", layer: test }
---

# fixture-tool guidance
