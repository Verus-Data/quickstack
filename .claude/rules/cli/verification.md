---
paths:
  - "packages/cli/src/**"
  - "packages/cli/tests/**"
  - "packages/cli/scripts/**"
---

# Verification

Run the project's check command and inspect its complete output. It includes lint, typecheck, unit tests, and compiled-binary checks; optional fragments may extend it. Exercise the actual changed command in human and JSON modes. Read logs/cli.jsonl and logs/cli.log before guessing at failures. Run only checkout-owned development processes and stop only ones you started. Never weaken tests to obtain a green gate.
