---
paths:
  - "packages/format/**"
---

# Format package

This package owns the shared entry, manifest, run-record and canonical bundle contracts.
Keep runtime source portable: no `node:*`, `bun`, `bun:*` or `@effect/platform-*` imports.
Use standard Web APIs and Effect core; platform I/O belongs to consumers.

After phase 4.0a, extend the public contracts additively. Existing exports and their behavior
are stable; update the roadmap's shared contract table with each addition.
