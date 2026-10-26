---
paths:
  - "packages/cli/src/**"
  - "packages/cli/tests/**"
  - "packages/cli/scripts/**"
---

# Effect

Load the project's Effect skill (`.claude/skills/effect/SKILL.md`) before writing Effect code or looking up its APIs. Check the installed package's type declarations when documentation disagrees. Keep the skill current when dependencies change; don't copy examples from a different major.

Paths, logging and output config must stay independently readable. `doctor` and `--version` have to work when `config.json` is broken, so a new setting never makes path or logger resolution depend on decoding the whole file.

Logger records are built only by `logging.ts::entry`: `time`, `level`, `msg`, `detail`, annotations flattened to scalar top-level keys (secret-looking keys redacted, reserved names prefixed), and a `cause` holding only an `AppError`'s allowlisted fields. Don't construct a record anywhere else or pass an arbitrary object through as a field. A new field is a contract change for anything that reads the JSONL file, including the planned run records. A log sink failing (unwritable file, closed stderr) can't fail the command or change its exit.

Capture context when you build a callback that runs later, rather than reading services inside it. Observe every forked fiber: join it, scope it, or handle its failure, so nothing fails silently in the background.
