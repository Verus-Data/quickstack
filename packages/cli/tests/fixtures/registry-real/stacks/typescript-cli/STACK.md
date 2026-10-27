---
schema_version: 1
id: typescript-cli
kind: stack
name: TypeScript CLI with Effect
description: A Bun-compiled TypeScript CLI with Effect commands and services, strict stdout/JSON contracts, lazy config, structured logs, Vitest, and compiled-binary tests.
tags: [typescript, cli, effect, bun, scripts, node]
deps:
  app: [effect, "@effect/platform-bun"]
  dev: ["@effect/platform-node", typescript, "@biomejs/biome", vitest, "@vitest/coverage-v8", "@types/bun", "@types/node"]
tools: [bun, node, git]
decisions:
  - "Node version: current LTS (default), recorded in .node-version and engines.node; Node runs Vitest and Bun runs the binary."
  - "Binary name: project slug (default), with project-owned environment variables prefixed by its uppercase form."
merge: [.claude/settings.json]
fragments:
  required: [effect-schema]
  default: [git-hooks, effect]
  optional: [openrouter-chat-cli]
verify:
  - { name: install, phase: setup, layer: install, run: bun install }
  - { name: lint, layer: lint, run: bun run lint }
  - { name: typecheck, layer: typecheck, run: bun run typecheck }
  - { name: test, layer: test, run: bun run test }
  - { name: binary, layer: build, run: bun run e2e, timeout: 15m }
  - name: readme-filled
    layer: docs
    run: "test -s README.md && ! grep -n 'stacks:fill' README.md"
commands:
  install: Install dependencies with bun
  dev: Run the CLI from source with checkout-local logs and data
  build: Compile the host binary
  typecheck: Run tsc without emitting
  lint: Run Biome checks
  format: Apply Biome formatting and safe fixes
  test: Run the unit suite
  test:unit: Run Vitest on Node
  test:watch: Watch unit tests
  coverage: Run unit tests with coverage
  e2e: Build and exercise the compiled binary using Bun
  check: Run lint, typecheck, tests, and compiled-binary checks
  clean: Remove generated build, test, and log output
  prepare: Install project hooks outside CI
---

# TypeScript CLI with Effect

One CLI compiled with `bun build --compile`. Effect owns commands, services, errors, configuration, and logging; Effect's CLI module defines the command tree. `doctor` and `--version` are the proving slice. The base has no model provider, TUI, installer, update command, or release workflow.

## Layout

`src/bin.ts` is the Bun entry and `src/main.ts` is platform-free invocation logic. `cli.ts` holds commands; `commands/doctor.ts` is thin; `core/` holds programs; `services/` holds Output and Host; `config.ts`, `errors.ts`, `logging.ts`, `runtime.ts`, and `version.ts` own those boundaries. Schemas live in `src/schemas/`. `tests/helpers/cli.ts` exports `runCli`, `ndjson`, and temporary-directory helpers. Vitest tests live in `tests/`, Bun binary checks in `e2e/`. Shipped development and preparation scripts live in `scripts/`; build.ts is written against the installed Bun API.

## Setup

Create package metadata, TypeScript/Biome/Vitest configuration, and scripts from the requirements below. Record the installed Bun packageManager and current Node LTS, and pin `@types/node` to the `.node-version` major (a bare add picks the newest). Install compatible Effect packages together and check peer ranges. The CLI module ships inside the `effect` package (find its path in the exports map); never add the separate Effect 3 CLI package. Check imports against the installed exports and type declarations and record them in the generated Effect skill. Implement `doctor` through the real command parser, services, output/error boundary, and logging; implement `--version` from package metadata. Doctor reports version, platform, whether compiled, paths, and config errors without failing on a broken optional config file. Test human and JSON output, then compile the binary and exercise it with no user credentials or configuration.

Fill README and AGENTS with the base commands and architecture. Add app and distribution features only when their fragments are selected.

## Runtime, config, and errors

Each service is a namespaced Context.Service class with static layers; dependencies are captured in constructors, and a layer build never reads configuration that can fail. AppLayer combines application services; BunServices and Host enter only through bin.ts, NodeServices through tests. One invocation builds one layer and runs one program. Caches live in that layer, not global state. Dispose scopes on every outcome. Capture runtime context at non-Effect callbacks and observe forked failures; do not construct extra runtimes. Non-streaming calls to a third party use `Effect.retry` with a jittered exponential schedule capped at two retries, plus `Effect.timeoutOrElse`, and retry only errors marked retryable; the HTTP client has no retries of its own, so there is one retry layer.

Read env only in config.ts (and the entry's required environment normalization), with Effect Config and empty strings treated as absent. AppConfig is lazy, cached, and layers env over a closed schema for `$XDG_CONFIG_HOME/<slug>/config.json`. Parse it only inside commands that need it, so help/version/doctor survive invalid configuration. Read paths, output, and logging settings independently; an invalid log level falls back safely. New settings go in config, stack-owned `.env.example`, and README. Use prefixed LOG_FORMAT, LOG_FILE, and DATA_DIR variables; keep development data under `.dev/data`.

Tagged errors carry fixed safe messages and explicit retryability. Map every tag exhaustively to an exit code: usage/bad input/not found 2, not configured/invalid config 3, upstream unavailable 4, invalid model output 5, permission denied 6, interrupted 130, defect 1. Keep mappings stable and test them. Defects log their cause once at main and produce a generic safe error; never catch them just to report success.

## Output and invocation contract

Output is the only application writer. Stdout carries results only, stderr carries notes/errors/logs. Human commands print readable results; `--json` emits one machine-readable result or a documented NDJSON stream for streaming commands added later. On failure stdout remains empty; stderr has a safe human diagnostic or one JSON `{ error: { tag, message, retryable } }` body. Under `--json`, stderr logs are JSON lines too and the error body is the last stderr line. Parse errors, help, and version obey the same contract; detect --json before parsing can fail. No ANSI on nonterminal stdout. A closed pipe (EPIPE) ends quietly as a BrokenPipe interruption, not a defect.

The command framework's Console may print usage errors to stdout. Capture its output and flush to stdout only for successful help/version outcomes; render failures through main on stderr. `Command.runWith(root, { version, renderErrors: false })(argv)` is the per-argv entry point, so tests inject argv. A bare root command with subcommands needs a handler failing with `CliError.ShowHelp` with empty `errors`: help, exit 0. Disable duplicate runtime error reporting and replace loggers at the outer boundary. Bin supplies stdout/stderr writers, Host (platform, executable path, compiled flag), and the process exit. Core code uses Effect FileSystem/Path/Stdio/HttpClient, never Bun globals; all ordinary programs run unchanged under Node tests. Optional platform adapters declare their boundary explicitly.

## Logging and dev script

A custom logger converts input to a testable LogEntry, then emits UTC `time`, lowercase `level`, `msg`, annotations, `detail`, and an allowlisted cause (name/message/status/stack). Avoid collisions with reserved fields. Never log prompt or reply text, argument or flag values, or secrets such as API keys, and never whole third-party error objects. All logs go to stderr; optionally append JSONL to the configured file. A failed sink warns once and cannot fail the command. Log one `command` record with duration and outcome; annotate child logs with an invocation id. Respect NO_COLOR and keep JSON free of ANSI.

The shipped dev script runs bin.ts, defaults LOG_LEVEL to info, appends logs/cli.jsonl, copies noninteractive stderr to logs/cli.log, rotates oversized logs, and uses checkout-local data. Preserve terminal behavior whenever stdin/stdout are terminals; interactive adapters may own stderr. Forward arguments, signals, and exit status. The session hook reports Bun version mismatch and only newly appended warning/error logs.

## Tool configuration and tests

Biome starts from current generated config with recommended checks, import/export type discipline, organized imports, two spaces, double quotes, width 100, VCS ignores, and the base boundaries Grit plugin. Strict TypeScript includes unchecked index access, verbatim modules, no emit, and explicit Bun/Node-compatible types. Include src, tests, e2e, scripts, and adapter hooks. Check Grit against the installed Biome syntax and preserve each rule when adapting it.

Vitest runs on Node and excludes e2e. Its setup clears credentials and uses temporary HOME/XDG/config/data directories; it does not read user .env. `runCli` invokes the real command tree with injected Output/Host/platform layers and captures status/stdout/stderr; no module mocks. Test help/version, unknown flags, missing arguments, human/JSON doctor, invalid config, error mappings, log shape, sink failure, runtime isolation, and stdout remaining empty on failure. Include shipped hook tests when the Claude adapter exists.

`test` calls test:unit; `test:unit` is Vitest run, watch and coverage use that runner explicitly. Bun is reserved for `bun test ./e2e` after a host build. Keep its configuration/preload isolated so it cannot accidentally collect Vitest tests or load real credentials. Binary tests spawn the artifact with an environment built from scratch and verify version, compiled doctor, JSON shape, usage errors, and exit codes. These checks must pass without optional app or release fragments.

Build with Bun compile, minification, linked sourcemap removed from final output, and dotenv/bunfig autoload disabled; write dist/<slug>. Version comes from package metadata bundled into the artifact. `prepare` runs the shipped helper; `check` runs lint, typecheck, test, and e2e. Clean only generated project output.

<!-- stacks:when with=git-hooks -->
The shipped `scripts/prepare.ts`, run by the `prepare` script after every `bun install`, already runs `lefthook install` (skipped when `CI` is set, lefthook is missing, or `lefthook.yml` doesn't exist yet, and non-fatal when it fails, for example outside a git checkout), so don't add another install step. pre-push runs `bun run typecheck` alongside `bun run test`, in parallel.
<!-- stacks:end -->

## Gotchas

Never force Vitest onto Bun or run unscoped `bun test`; the runner choice is part of the architecture. Bun may load .env in source commands, so isolate test environment before loading application code. A compiled binary must not autoload local config files. Check installed Effect APIs, TypeScript options, and Bun compile options rather than relying on old examples. Record every necessary workaround and its removal condition: if `Runtime.Teardown` is still declared over `Exit<E, A>` while `Exit` is `Exit<A, E>`, the cast in bin.ts goes under Build workarounds. The Effect service model remains mandatory even when its optional testing fragment is excluded.
