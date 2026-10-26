---
paths:
  - "packages/cli/src/**/*.ts"
  - "packages/cli/tests/**/*.ts"
  - "packages/cli/scripts/**/*.ts"
  - "tests/**/*.ts"
  - "scripts/**/*.ts"
  - ".claude/hooks/**/*.ts"
---

# TypeScript

Don't cast untrusted JSON to the type you want; decode it through a schema. That includes hooks: `_lib.ts` parses Claude Code's tool payloads, which are untrusted input like any other.

Every deliberate background promise needs an owner that handles its rejection and its lifecycle (when it stops, what waits for it). Otherwise await or return it.

Read the installed compiler options (`tsconfig.base.json` and the package's `tsconfig.json`, and the TypeScript version that resolves) before generating or editing a tsconfig. Change `target` or `lib` only after checking every runtime that loads the file.
