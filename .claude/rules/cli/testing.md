---
paths:
  - "packages/cli/src/**"
  - "packages/cli/tests/**"
  - "packages/cli/e2e/**"
---

# Testing

Load the `ce:writing-tests` skill before writing or changing tests. It sets the philosophy: test observable behavior with real dependencies, prefer integration tests, mock only what you don't own, and write tests that survive refactoring. This rule says what that means for an Effect CLI whose main reader is a coding agent. Where the two differ, this rule wins.

## What "observable behavior" means here

A CLI's behavior is what a caller sees: the exit code, stdout, stderr, and files on disk. Assert on those. The `--json` output, the error envelope and the exit codes are a contract that agents branch on, so a test that pins one of them is pinning public API.

- Assert the exit status and both streams in every command test. On failure, stdout must be empty and stderr must carry exactly one error (one JSON envelope in `--json` mode).
- Parse `--json` output and assert on the decoded value, not on substrings. Decode it with the command's own `Schema` where one exists, so a test fails when output drifts from the schema.
- Assert files a command writes by reading them back from the temporary directory.
- Don't assert on service internals, layer composition, or which functions were called.

## The test types, mapped to this repo

Integration is the default. Use `runCli` from `tests/helpers/cli.ts`: it runs the real command tree through `main` with real `NodeServices` (real filesystem, real path), real `AppConfig` and `Logging` layers, and in-memory `Output` and `Host`. Most tests should be `runCli([...args], { env, home })` followed by assertions on `{ status, stdout, stderr }`.

Run a core program directly with `Effect.runPromise(program.pipe(Effect.provide(...)))` only when going through the parser adds nothing, such as config caching or a log sink's failure handling. Still provide real layers.

Unit tests are for pure functions with no services: schema decoding, error-to-exit-code tables, formatting. Property tests use `@effect/vitest`.

E2E is `bun test ./e2e` against the compiled binary. It covers what only the real artifact can show: startup, signals, the environment, and that Bun's runtime config autoload is disabled. Build first, spawn the binary with an environment assembled from scratch, and keep these tests few.

## Fakes: what you may replace

Replace a service with a test layer only at a real boundary: the process and terminal (`Output.memory`, `Host.memory`), the clock, randomness, and anything off the machine (network, registries, a spawned agent). Pass the fake as a layer, the same way production code gets the real one. Never use `vi.mock` or module mocks, and never stub your own services to make a test pass.

- Time: use `TestClock` from Effect, never `sleep` or real timers. For real child processes, poll for the condition with `vi.waitFor`.
- Files and config: use a real temporary directory (`tempDir()`) and pass `HOME`, `XDG_*` and `QUICKSTACKS_*` through the `env` option. Config only reads env given to its layer, so a test never touches the developer's real home.
- Commands that run steps or spawn processes: run real, tiny, deterministic programs (a script in the temp dir that writes a file or exits with a code) rather than faking the process service, unless the test is about a failure the OS won't produce on demand.
- A fake must behave like the real thing on the paths the test uses, including its failures (EPIPE, permission denied, missing file).

## Effect-specific rules

- Test failures as values. Expected failures are tagged errors, and the test asserts which error came out and what exit code and envelope it maps to. Every error tag in `errors.ts` stays covered by the exhaustive table test.
- Defects (`Effect.die`, thrown exceptions) must produce exit 1 with the fixed message, must not leak the defect's contents to stdout, stderr or logs, and must be logged once.
- Interruption is behavior. Cover cancellation through an `AbortSignal` and check that scopes and finalizers still run (temp files removed, children killed).
- Build fresh layers for each test. Nothing is cached across invocations, so a test that needs a "second run" builds a second layer.
- Don't widen a service's interface or add test-only exports to make something testable. Put helpers in `tests/helpers/`.

## Process and gate

- A bug fix starts with a failing test that reproduces it through the narrowest real interface (`runCli` if possible).
- Never weaken, skip or delete an existing assertion to get green. If a contract changes on purpose, change its test in the same commit and say why.
- Name tests after behavior ("--json after -- belongs to the command"), not after functions.
- Scope runners as the guards require: Vitest on Node for `tests/`, `bun test ./e2e` only for the binary, never bare `bun test` and never `--bun` with Vitest.
- `doctor` and `--version` must keep passing with no credentials, no config file and no network.
- Hook tests under the root `tests/hooks/` run the real wired hook commands, with a deny case and a near miss for each guard.
