# stacks

stacks starts projects for coding agents. You pick a stack, it writes a few starter files and a brief, your coding agent builds the project from the brief, and `stacks verify` says when it's done. To try it, follow the [quick start](docs/quickstart.md).

At a terminal, `new` and `add` launch an available configured agent, or ask you to pick when several harnesses are found. The order is Claude Code, Codex CLI, OpenCode, Cursor CLI, Copilot CLI, then the Codex app on macOS. Use `--launch claude|codex|opencode|cursor|copilot|codex-app` to choose explicitly, or `--no-launch` to print the prompt. A single harness launches without asking; a pick isn't saved. See [agents](docs/agents.md) for detection, adapter targets and launch behavior.

With missing arguments, `new`, `add` and `create` offer numbered choices only in human mode with both stdin and stdout on a terminal. Enter numbers (comma-separated for fragments); Ctrl+C quits before writing. The completed choices print a `Running:` command you can reuse. Agents, `--json`, CI and pipes keep the existing noninteractive behavior.

The npm package is `@steamfield/stacks`; the command it installs is `stacks`. It needs Node 22 or newer, on macOS or Linux.

```sh
npx @steamfield/stacks list stacks  # no install step
npm install -g @steamfield/stacks   # or install it, then run it as `stacks`
stacks new typescript-cli my-cli
```

Run `stacks update` to upgrade a global npm install, or `stacks update --check` to report versions without installing. Other installs get the command to run; agents may check but cannot install. Each invocation makes one request to the npm registry, with no background checks.

The CLI is TypeScript on Effect, bundled for Node. It executes nothing it reads: `verify` runs only the steps in a project's own manifest; `update` runs only npm's global prefix lookup and a version-pinned install. [How stacks works](docs/architecture.md) explains the design, and the [docs index](docs/README.md) lists everything else: concepts, agents, authoring, and the command, output, configuration and validation references.

`list`, `show`, `new` and `add` can also read a remote registry index. This release ships with no official index URL, so the remote origin is off until you set `STACKS_INDEX_URL`; ordinary commands make no registry requests. Precedence is project, user, index, bundled. Each bundle is checked against its advertised `sha256:<hex>` digest, and a matching bundled entry keeps its bundled identity. An index stack uses its proven fragment digests; an unavailable composition falls back to the bundled stack and fragments. Fetched content is only read and written, never executed.

When configured, the index cache lives under `$XDG_CACHE_HOME/stacks/index/` (normally `~/.cache/stacks/index/`). It refreshes after 24 hours with a 1,500 ms request deadline, falling back to verified stale data or bundled entries. Failures back off for ten minutes, or 24 hours after a 404. Every command accepts `--offline`; `STACKS_OFFLINE=1` also prevents registry requests while retaining verified cached entries. `doctor --json` reports `remoteIndex` without refreshing, with `url: null` when the origin is off. `STACKS_INDEX_URL` requires HTTPS (HTTP is allowed on localhost and 127.0.0.1). Configured URLs are untrusted and never auto-launch an agent unless they match an official URL supplied by a future release, whose signature must verify against its compiled-in key list. See [Configuration](docs/reference/configuration.md).

`list` and `show` can add published stats for bundled and index entries. `list --json` carries a summary per entry; `show --json` carries the full detail, including agent breakdowns and a weekly series. Stats are optional: a missing, unpublished or unreachable response adds no warning or exit change. The stats cache is under `$XDG_CACHE_HOME/stacks/stats/`, with a 24-hour refresh, a 1,500 ms fetch deadline, and per-resource backoff of ten minutes after a failure or 24 hours after a 404. `--offline` makes no stats request. A non-default `STACKS_INDEX_URL` disables stats, because those numbers describe a different registry. This release has no default stats API URL; source builds can use a loopback `STACKS_DEV_API_URL`.

| Stats field or text | Meaning |
| --- | --- |
| `window`, `through`, `population` | Trailing 7 or 28 finalized UTC days, ending on `through`; the population is either stacks projects or labeled seeded development data. |
| `projects` | Distinct mature projects in that window, counted once regardless of event count. |
| `greenRate`, `greenRateLower`, `greenRateUpper`, `sample` | Green projects over attempted projects, its 95% Wilson interval, and the effective attempted sample used for that interval. An attempted project has a verify not blocked solely by its environment; green requires a full, unchanged verify. |
| `noVerifyShare` | Share of projects with no verify event. It can include projects whose telemetry was blocked. |
| `medianMinutesToGreen` | Median elapsed time from scaffold to first green verify, in minutes. |
| `show` step failure shares | Share of failed runs before first green in which each named step failed; text shows the three largest published shares. |
| `show` content change | Latest registry content-change marker inside the displayed window, from the weekly series. |

Suppressed cells appear as `null` in `list --json` and are omitted or marked unavailable in text. Published counts are rounded to the nearest five; rates and interval bounds to whole percents. Seeded text says `seeded` beside the green-rate sample.

At a human terminal, status words use color, `verify` and `new` show live progress on stderr, and guide, guidance and descriptions wrap to the terminal width. Set `NO_COLOR=1` to disable color and live redraws; nonempty `NO_COLOR` overrides `FORCE_COLOR=1`. Agent and JSON output stay plain, including when color is forced.

## Bundled stacks

| Stack | What it builds | App (`--with`) |
| --- | --- | --- |
| `astro-api` | Bun workspace: a static Astro site with React islands and an Effect HttpApi server on Node, sharing a typed contract package | |
| `astro-blog` | Static Astro blog: MDX posts in a validated collection, React islands, Tailwind, RSS and sitemap | |
| `cloudflare-react-router` | React Router on the local Workers runtime with typed bindings and Workers integration tests | |
| `go-cli` | Go CLI: cobra, viper config, structured errors, human and JSON output, golangci-lint | |
| `mobile-expo` | Expo Router app and a Bun + Hono API on Postgres, sharing zod schemas through a typed client | |
| `python-react` | FastAPI backend and a React SPA talking through a client generated from the OpenAPI spec | |
| `react-router` | React Router framework mode with SSR, Effect services, typed HTTP errors, Tailwind and shadcn | `openrouter-chat` |
| `tauri-react` | Tauri desktop app: Rust crates behind a thin shell, typed IPC, a React frontend with a mock transport | |
| `typescript-api` | Node HTTP API on Effect's HttpApi: REST resource conventions, one error-status table, request logs, a core that also runs as a fetch handler | |
| `typescript-cli` | Bun-compiled TypeScript CLI on Effect with typed errors, safe output and logs | `openrouter-chat-cli` |

`stacks list` shows each stack's fragments; `validate` reports every stack's composed brief size in both presets.

## Development

Use Bun 1.4.2 and Node 24 LTS. Install lefthook (`brew install lefthook` on macOS) and jq for the development hooks.

```sh
bun install
bun run dev doctor            # the CLI from source
bun run build                 # bundle dist/cli.mjs behind the dist/stacks entry
node dist/stacks --version
bun run check                 # this package's gate
```

`bun run dev` runs the CLI from source in the directory you ran it from; [Configuration](docs/reference/configuration.md#the-development-wrapper) covers its logs, data directories and how to run it from outside the repo.

`bun run check` runs Biome (including the boundary plugin), TypeScript, Vitest on Node, then the package e2e checks, which pack the npm tarball, install it offline and run it under Node. `bun run coverage` measures application code. Tests isolate HOME/XDG and clear credentials; e2e tests create their environment from scratch. No `.env`, credentials or external services are needed.

Commands here run from `packages/cli/`; the repo root has the same names fanned out to every package. See [AGENTS.md](../../AGENTS.md), [the harness guide](../../docs/harness.md), and [the installed Effect guide](../../.claude/skills/effect/SKILL.md). CI reads Bun from packageManager through [setup-bun](https://github.com/oven-sh/setup-bun). Maintainer tasks (the bench, the ledger, publishing the plugin) are in [Maintaining the bundled registry](docs/maintaining.md).

## Telemetry

There is no official telemetry endpoint configured. Source builds never collect. A release build with a configured endpoint shows a first notice before recording anything; that invocation queues no events. Users who saw the earlier notice see a second notice about dependencies on their next enabled run, which also queues no events. Run `stacks telemetry disable` to turn it off and delete pending events and local identities. Agents and scripts can disable or reset it; enabling requires a person with terminal stdin. `--no-telemetry` and offline runs record and send nothing while keeping pending events. `DO_NOT_TRACK`, `STACKS_TELEMETRY_DISABLED`, `"telemetry": false` in settings, and any set `CI` disable collection. See [Telemetry](docs/reference/telemetry.md) for consent precedence, commands, state, debug mode and delivery.

Schema v2 records anonymous `new`, `add`, `show`, scaffold-error and verify events. Custom entries and steps are redacted. Install and telemetry project ids are random and separate from manifest ids; cloned projects have no telemetry link. A green verify may include `deps`: allowlisted dependency names from root manifest files and installed major versions from manifests or lock files. After queuing a report, the client skips later reports for that project for 7 days; simultaneous verifies may each report. Verify uses a previously cached, signed allowlist and never refreshes it. Every field has a reader:

| Field | Reader |
| --- | --- |
| `schemaVersion` | Ingest schema selection (4.1b) |
| `eventId` | Ingest idempotency (4.1b) |
| `type` | Event routing (4.1b) |
| `installId` | Distinct installs and per-install caps (4.1b, 4.2a) |
| `projectId` | Distinct projects (4.2a) |
| `cliVersion` | Released-version check and release counts (4.1b, 4.1d) |
| `os` | Platform failure counts (4.1d) |
| `nodeMajor` | Node line failure counts (4.1d) |
| `agent` | Per-agent green rate (4.2a) |
| `sentAt` | Event retention windows (4.1b, 4.2a) |
| `stack` | Stack projects and green rate (4.2a) |
| `fragments` | Fragment attach rate (4.2a) |
| `without` | Without rate (4.2a) |
| `preset` | Per-preset green rate (4.2a) |
| `targetAgents` | Adapter target share (4.1d) |
| `handoff` | Entry-point share (4.2a) |
| `source` | Entry-point share (4.2a) |
| `origin` | Index reach (4.1d) |
| `nonOfficial` | Non-official use counts (4.1d) |
| `fingerprint` | Per-composition green rate (4.2a) |
| `kind` | Show pick rate (4.2a) |
| `id` | Show pick rate (4.2a) |
| `command` | Failed scaffold share (4.2a) |
| `code` | Failure spikes per release (4.1d) |
| `scope` | Verify scope (4.2a) |
| `outcome` | Green rate (4.2a) |
| `tamperCheck` | Verify trust coverage (4.2a) |
| `steps` | Step failures and environment blockage (4.2a) |
| `stepsChanged` | Changed-step share (4.2a) |
| `secondsSinceScaffold` | Time to green (4.2a) |
| `secondsToFirstTestPass` | Time to first test (4.2a) |
| `deps` | Allowlisted dependency trends (4.2e) |

Never sent: paths, directory or project names, git remotes, usernames, hostnames, environment variable values, decision answers, brief or NOTES text, file contents, except allowlisted dependency names and major versions from manifest and lock files, command lines, output tails, custom entry ids, or anything from offline runs. Collection must stay off until the privacy page, schema page and phase 4.1e launch checks are complete.
