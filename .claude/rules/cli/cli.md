---
paths:
  - "apps/cli/src/**"
---

# CLI contract

Commands are thin Effect programs. Bin supplies platform services, Host, and stdout/stderr writers; main parses, runs one scoped invocation, and maps its outcome. Core code runs unchanged on Node. Platform-only imports belong to bin.ts or adapters under src/platform/.

Output owns results on stdout; notes, errors, and logger output go to stderr. Capture framework Console output so usage failures cannot contaminate stdout. Help/version success may flush framework output. JSON results/errors have documented schemas. Disable duplicate runtime error reporting; log defects once and return a safe generic message.

Keep exit mappings stable and exhaustive: usage/bad-input/not-found 2, configuration 3, upstream 4, permission 6, interrupt 130, unexpected defect 1. Test actual invocation outcomes with runCli. Read config lazily so help/version/doctor survive invalid optional config. Decode inputs at the boundary. Every new command belongs in documentation and behavioral tests.
