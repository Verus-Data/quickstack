---
paths:
  - "apps/cli/src/**"
  - "apps/cli/tests/**"
  - "apps/cli/e2e/**"
---

# Testing

Vitest on Node owns unit/program tests; Bun owns compiled-binary checks in e2e. Scope runners explicitly. Test through runCli and real service layers with isolated HOME/XDG/config/data. Fake only external boundaries. Assert exit status and both output streams, including empty stdout on failure. Doctor/version checks must pass without credentials or optional features.

Drive timed programs with a virtual clock, not sleeps. Test layer isolation and cleanup, config failures, error mapping, log formatting, and sink resilience. Binary checks build first and use an environment assembled from scratch. Run the shipped hook suite against merged settings, including deny and near-miss cases. Optional applications add their own acceptance tests without removing the base checks.
