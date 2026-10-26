---
paths:
  - "apps/cli/src/**/*.ts"
  - "apps/cli/tests/**/*.ts"
  - "apps/cli/scripts/**/*.ts"
  - "tests/**/*.ts"
  - "scripts/**/*.ts"
  - ".claude/hooks/**/*.ts"
---

# TypeScript

Use strict checking, explicit runtime types, and no unchecked-index assumptions. Read installed compiler options before generating config. Do not cast untrusted JSON to its desired type: decode it through a schema. Imports and exports use type-only forms where appropriate. Await or return promises; every deliberate background operation needs rejection handling and lifecycle ownership. Keep runtime-specific APIs at explicit platform boundaries. Change target/lib deliberately after checking every supported runtime.
