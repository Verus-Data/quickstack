---
paths:
  - "packages/analyze/src/**"
  - "packages/analyze/tests/**"
  - "packages/analyze/e2e/**"
---

# analyze

`@quickstacks/analyze` is a standalone SARIF record producer with zero runtime
dependencies. It runs from source under Bun (e2e) and under Node (Vitest).

- No runtime dependencies. Nothing goes in `dependencies`. Dev tooling references
  the workspace catalog with `catalog:`.
- No `console.*` and no direct `process.stdout`/`process.stderr` writes outside
  `src/output.ts`.
- No shell strings. Every tool is spawned with `node:child_process` `spawn`, an
  argv array, and no `shell: true`; the binary is resolved on `PATH`. Kill by
  process group.
- No environment variable values in the output. `invocations.environmentVariables`
  is never populated and spawned tools receive a minimal env. The serialised log
  must never contain a planted env value.
- Findings never change the exit code. The exit contract is: 0 record written, 2
  usage or input error, 1 defect.
- A tool's non-zero exit is not a failed run. The success test is "did the tool
  emit a valid SARIF 2.1.0 document", not "did it exit 0". If stdout parses as
  valid SARIF 2.1.0, record status `ran`, keep the findings, and store the
  observed exit code as `exitCode` on the ledger entry. Reserve `failed` for no
  parseable SARIF, invalid or foreign-version SARIF, or a parse failure; `reason`
  carries the detail (`exit-code:N`, `invalid-sarif: ...`).
- `src/bin.ts` is the only module that touches `process.argv`, `process.exitCode`
  and process signals. Core code stays platform-free and unchanged under Node.
- Decode untrusted SARIF at the boundary with the tolerant validator in
  `src/schemas/sarif.ts`; it reports `invalid-sarif` with a reason instead of
  throwing and rejects any version other than `2.1.0`.
- Determinism: sort every directory read; no timestamps inside hashed data.
  `runId` is unique per invocation (`run-<compact UTC timestamp>-<8 hex>`), not
  derived from the digest, so comparing two runs for determinism must strip
  `runId` alongside `createdAt` and durations.
- Symlinks inside the target are never followed by the digest: they are skipped
  and counted as `target.skippedSymlinks` (and `DigestResult.skippedSymlinks`).
- `--tool` selection emits a `skipped` ledger entry (`reason: "not-selected"`)
  for every non-selected adapter so a record can distinguish "not selected" from
  "not installed".
- Never weaken, skip or delete a test to reach green. A bug fix starts with
  a failing regression.
- Analysis is read-only with respect to the target: no adapter ever writes into
  the directory it analyses. A tool needing a cache gets a disabling flag or a
  cache path outside the target (under `HOME`, which the spawn controls); a tool
  that cannot be tamed that way is not shipped as an adapter. A run over the
  same source twice yields the same digest regardless of what has previously
  run in that directory.