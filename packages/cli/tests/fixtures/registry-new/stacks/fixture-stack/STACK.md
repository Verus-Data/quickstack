---
schema_version: 1
id: fixture-stack
kind: stack
name: Fixture stack
description: A stack whose files cover every way new writes one.
tags: [fixture]
tools: [qs-stack-tool]
decisions:
  - "Package manager: the fixture's (default)."
merge: [.claude/settings.json]
fragments:
  required: [base-req]
  default: [hooked, tooled, ran-check, own-repo]
  optional: [extra]
verify:
  - { name: stack-ran, phase: setup, run: touch ran-stack }
---

# Fixture stack

Build the fixture.
