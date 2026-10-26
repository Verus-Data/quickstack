---
paths:
  - "packages/cli/src/**"
---

# Services, configuration, and logging

Use namespaced service classes (`quickstacks/<Name>`) with static layers. Capture dependencies in constructors. Build one AppLayer per invocation, with platform services supplied by bin or tests. Fresh memory layers isolate tests. No global state or extra runtimes.

Read environment in config.ts through Effect Config, treat empty as absent, and parse optional file config lazily with a closed schema. Paths, logging, and output config must remain independently readable. Define tagged errors and exhaustive retryability/exit mappings; never swallow defects. Capture context at callbacks and observe forked failures. Use the installed Effect skill for API details.

Logger records use time, level, msg, annotations, detail, and an allowlisted cause. Main logs one command outcome; secrets and arbitrary third-party objects never reach logs. Diagnostics stay on stderr, optional JSONL goes to the configured file, and sink failure cannot fail a command. Test the record shape, failure behavior, runtime isolation, and output contract.
