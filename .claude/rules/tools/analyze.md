# analyze

`packages/tools/analyze` is a measurement, not a gate. It writes one SARIF 2.1.0 record per run over a directory and nothing else: no project it touches is modified, and no finding ever changes the exit code. Exit 0 means a record was written, 2 means usage or input was wrong, 1 means a defect in this package. Everything below follows from that.

**Analysis is read-only with respect to the target.** No adapter may write into the directory it analyses — that includes caches. `ruff` gets `--no-cache` for exactly this reason; any tool that needs a cache gets a flag that disables it or a cache path outside the target (under `HOME`, which the spawn controls). A tool that cannot be tamed that way is not shipped as an adapter, and `tools.json` is where that decision is recorded. A run over the same source twice must yield the same digest regardless of what has previously run in that directory.

**A non-zero exit is not a failed run.** Linters exit non-zero *because* they found something: verified, `ruff check --output-format sarif` exits 1 and still emits complete valid SARIF. The success test is therefore "did this tool emit a valid SARIF 2.1.0 document", not "did it exit 0". When stdout parses, record `ran`, keep the findings, and store the observed number as `exitCode`. Reserve `failed` for no parseable SARIF, invalid or foreign-version SARIF, or a parse failure, with the detail in `reason` (`exit-code:N`, `invalid-sarif: ...`). Getting this backwards silently reports every real project as clean.

**Record absence honestly, never as an error.** A tool that is not installed is `absent`; a tool excluded with `--tool` is `skipped` with `reason: "not-selected"`, which is how a record distinguishes "we chose not to run it" from "the machine does not have it". Never install, download or provision a tool from this package.

**Determinism is what makes the digest usable.** Sort every directory read; keep no timestamps inside hashed data; skip symlinks rather than following them, and count them in `target.skippedSymlinks`. `runId` is deliberately *not* derived from the digest — one id per invocation is what a backend storing records needs — so a determinism comparison strips `runId` along with `createdAt` and durations.

**Boundaries.** Zero runtime dependencies and nothing in `dependencies`; dev tooling uses `catalog:`. No `console.*` and no direct stdout/stderr writes outside `src/output.ts`. No shell strings: spawn with an argv array and no `shell: true`, resolving the binary on `PATH`, and kill by process group. No environment variable values reach the output. `src/bin.ts` is the only module touching `process.argv`, `process.exitCode` or signals, and core code stays platform-free so it runs unchanged under Node.

**Decode untrusted SARIF at the boundary** with the tolerant validator in `src/schemas/sarif.ts`: it reports `invalid-sarif` with a reason instead of throwing, and rejects any version other than `2.1.0`.

Never weaken, skip or delete a test to reach green, and start a bug fix with a failing regression — the defects in this package so far were all found by running it, not by reading it. AGENTS.md carries the file map and the commands; `architecture.md` carries package boundaries and how a shared contract is owned.
