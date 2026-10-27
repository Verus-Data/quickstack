---
schema_version: 1
id: ci-github
kind: fragment
name: ci-github
description: Fixture for add acceptance tests.
category: tooling
applies_to: [fixture-stack]
requires: [fixture-required]
env: { SHARED: fragment, NEW: added }
commands: { test: fragment-test, ci: run-ci }
verify:
  - { name: ci-check, run: "true", layer: test }
---

# CI guidance

<!-- quickstacks:when mode=add with=fixture-required -->
ADD WITH EXISTING REQUIREMENT
<!-- quickstacks:end -->
<!-- quickstacks:when mode=new -->
NEW ONLY BODY
<!-- quickstacks:end -->
