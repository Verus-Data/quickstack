# quickstacks

## Overview

A bun workspace; every package is in `packages/<name>/`. `packages/cli` is `quickstacks`, the CLI: Effect 4 commands/services, doctor/version, lazy configuration, safe output and logs. Bun compiles the executable; Node 24 runs Vitest. There is no product code, vendor, release tooling or network requirement. `packages/api` (`@quickstacks/api`) and `packages/mcp` (`@quickstacks/mcp`) are placeholders with no code or scripts. Code two packages share goes in its own package, never imported across another package's `src/`. How the monorepo works and how to add a package: README.md, "Monorepo".

The root owns the harness: `.claude/`, lefthook, CI, the root `biome.json`, `tsconfig.base.json`, and the hook tests in `tests/hooks/`. Each package owns its source, tests, `tsconfig.json` (extending `../../tsconfig.base.json`) and any Biome plugins in a nested `biome.json` (`"root": false, "extends": "//"`). See docs/harness.md.

## Planning

Product planning lives in `plans/`; start with [plans/HANDOFF.md](plans/HANDOFF.md), then [product/PROBLEM_STATEMENT.md](product/PROBLEM_STATEMENT.md) and [plans/README.md](plans/README.md). Settled decisions live only in the plans README decisions log; proposals stay in `plans/00-requirements.md` until the maintainers agree them. Keep each plan file's `Status:` line current and update HANDOFF.md at the end of a session.

## Commands

Root commands run from the repo root and fan out to every workspace package (`bun run --filter '*' <script>`); preserve the runner split.

| Command (repo root) | Purpose |
| --- | --- |
| `bun install` | Install every package's dependencies and the lefthook hooks |
| `bun run install:ci` | Frozen dependency install |
| `bun run dev doctor` | The CLI's source doctor with local logs/data (unprefixed output, so `--json` stays parseable) |
| `bun run dev doctor --json` | Machine-readable source doctor |
| `bun run build` | Build every package (the CLI compiles `packages/cli/dist/quickstacks`) |
| `bun run typecheck` | Root harness tsc, then each package's |
| `bun run lint` | Biome over the whole repo, with each package's nested plugins |
| `bun run format` | Safe fixes and formatting |
| `bun run test` | Hook tests, then each package's tests |
| `bun run test:hooks` | Hook tests only (`tests/hooks/`, Vitest on Node) |
| `bun run coverage` | Each package's coverage |
| `bun run e2e` | Each package's end-to-end checks |
| `bun run check` | Lint, typecheck, test, e2e: the gate |
| `bun run clean` | Each package's generated output |
| `bun run prepare` | Install hooks outside CI |

In `packages/cli/` (run there):

| Command | Purpose |
| --- | --- |
| `bun run test:unit tests/cli.test.ts` | Single test file |
| `bun run test:watch` | Watch Vitest tests |
| `bun run e2e` | Compile, then bun test ./e2e |
| `./dist/quickstacks --version` | Bundled version |
| `./dist/quickstacks doctor --json` | Compiled local diagnostics |
| `bun run check` | This package's gate only |

## Architecture map (packages/cli)

Paths below are relative to `packages/cli/`.

- `src/bin.ts`: Bun/platform/Host/writer boundary, process signals and exit status.
- `src/main.ts`: one invocation, framework Console capture, safe outcome and logging.
- `src/cli.ts`, `commands/doctor.ts`: real Effect command tree and thin handler.
- `src/core/doctor.ts`: platform-free diagnostic program.
- `src/services/`: Output buffers success output; Host supplies process facts.
- `src/config.ts`: lazy per-invocation AppConfig; independent paths/log settings.
- `src/errors.ts`, `logging.ts`, `runtime.ts`, `version.ts`: stable boundaries.
- `src/schemas/`: config/report schemas and their types.
- `tests/`, `e2e/`: Node programs/hook tests and Bun standalone binary tests.
- `scripts/`, `biome-plugins/`: lifecycle/build and enforced boundaries.
- Repo root: `.claude/`, `.github/`, `docs/`, `tests/hooks/`: adapter, CI, harness guide and hook tests.

bin supplies platform, Output and Host; AppLayer captures local services without opening config. main runs one scoped command. Doctor reads cached config and reports optional-file errors. Framework help is captured and flushed only on success; failures clear the output buffer.

## Conventions

Use namespaced Context.Service classes, static layer factories and fresh per-invocation state. No globals/caches across runs. Core uses Effect FileSystem/Path and remains unchanged under Node. Only bin/explicit adapters may use Bun; only config reads env. No direct console or stdout writes in application logic. Grit and adapter guards enforce platform/schema/env/output boundaries.

Strict TypeScript 7: unchecked indices, verbatim modules, erasable syntax, explicit Bun/Node types and no emit. Biome: two spaces, double quotes, width 100, recommended rules and explicit type imports/exports. Prefer current patterns and dependencies; keep changes scoped.

## Schemas

`src/schemas/` contains Settings and DoctorReport, each sharing its schema/type name. Decode unknown input at boundaries; encode reports for output. Config rejects excess properties. Use branded ids when adding domain ids, Schema.TaggedError for errors, and Schema.toJsonSchemaDocument with onExcessProperty:error for closed external JSON schemas. Keep framework validators; do not add @effect/schema or competing validators.

## Testing

`tests/helpers/cli.ts` invokes the real command tree with real NodeServices and injected Output/Host; no module mocks. Setup isolates HOME/XDG and clears credentials before app imports. Tests cover streams, parser failures, config laziness/caching, all error mappings, scope disposal, cancellation, EPIPE, logging and sink failures. Property tests use @effect/vitest; timers use TestClock. Hook tests execute actual helpers; all Grit rules are probed on real files.

Bun tests only `./e2e` after compiling. Binary tests spawn the artifact with an environment built from scratch, including hostile local dotenv/bunfig files to prove autoload is disabled. Never use unscoped bun test, --bun with Vitest, or weaken tests. A bug fix starts with a failing regression.

## Error handling

Fixed safe tagged messages; exhaustive exit/retryability tables in errors.ts. Expected usage/input/not-found exit 2, config 3, upstream 4, permissions 6, interruption 130, defects 1; BrokenPipe is quiet 0. main observes failures/defects once and clears stdout on error. The outer runtime maps a pending interrupt after cleanup to 130. Logs never serialize arbitrary cause objects or secrets; a defect is logged as its class and stack frames, without its message. Defects are not retryable.

JSON commands produce one result; JSON failures produce one stderr error envelope. To preserve that contract, JSON-mode ancillary logs use only the configured JSONL file. Human diagnostics/logs use stderr. No colors are currently emitted, respecting NO_COLOR and pipes.

## Debugging

Read packages/cli/logs/cli.log and packages/cli/logs/cli.jsonl. Development data stays under packages/cli/.dev/data. Use LOG_LEVEL=debug for detail. The session hook reports Bun mismatch and only newly added warning/error lines. Shared session-start can advise about absent .env; this base intentionally works without it.

After two unsuccessful fixes with no new diagnostic, stop and investigate other hypotheses. Read errors before guessing; do not swallow defects or report success after failure.

## Git hooks

Install lefthook on PATH (e.g. brew install lefthook), then bun install. Pre-commit formats/checks staged code/config and restages safe fixes. Commit-msg requires Conventional Commits, allowing merge/revert/fixup/squash forms. Pre-push runs lint, typecheck and tests in parallel. Never bypass hooks with --no-verify.

## CI

.github/workflows/ci.yml runs a sequential `check` job on ubuntu-latest and macos-latest for main pushes, PRs and manual runs, then `ci-ok`, which passes only when both did; contents:read only. Bun comes from packageManager, Node from .node-version. Frozen install, lint, typecheck, coverage, binary e2e; upload each package's logs/coverage on failure. Required check: ci-ok. Upgrade official action tags after checking upstream; SHA pins are deferred.

## Build workarounds

No patches, pinned prereleases or disabled rules. Every shared dependency version lives once, in the root `workspaces.catalog`; packages depend on `catalog:`. Effect packages resolve together at stable 4.0.6 with compatible 4.x ranges, Vitest/coverage 5.x. The generated type config targets current TypeScript 7. Bun compile disables all runtime config autoload and removes its linked sourcemap output intentionally.

The shipped dev wrapper was adapted to forward directly delivered SIGINT/SIGTERM/SIGHUP, with a reproducing subprocess test. Reassess/remove local adaptation when upstream provides equivalent signal forwarding. Biome stdin suppresses useful plugin diagnostics, so boundary tests use actual temporary files; no Grit rule was removed.

## Deferred

Application features, install/update distribution and release workflow (decision A1, open in `plans/`), and SHA-pinned CI actions.

## Pending user actions

None.

## Deeper context

README.md for usage/configuration; docs/harness.md for adapter ownership; .claude/README.md for installed hooks/commands; .claude/skills/effect/SKILL.md for current APIs.
