# quickstacks

A local Bun-compiled CLI with Effect services, a real command parser, typed errors, isolated configuration and structured diagnostics. The base has no account, vendor, release or interactive application dependencies.

## Quick start

Use Bun 1.4.2 and Node 24 LTS. Install lefthook (`brew install lefthook` on macOS) and jq for the development hooks.

```sh
bun install
bun run dev doctor
bun run dev doctor --json
bun run build
./dist/quickstacks --version
./dist/quickstacks doctor --json
```

`doctor` reports version, platform, compiled status, executable/config/data/working paths, and safe configuration errors. A missing configuration file is fine. A malformed optional file is reported in `configErrors` while doctor exits successfully; help and version do not open that file.

## Configuration

Optional configuration is `$XDG_CONFIG_HOME/quickstacks/config.json`, defaulting to `$HOME/.config/quickstacks/config.json`. Its closed schema accepts only an optional string `dataDir`. Environment values override file values; blank values count as absent. Configuration is read lazily and cached for one invocation.

| Setting | Meaning |
| --- | --- |
| `QUICKSTACKS_DATA_DIR` | Data path; defaults to `$XDG_DATA_HOME/quickstacks` (`$HOME/.local/share/quickstacks`) |
| `QUICKSTACKS_LOG_FORMAT` | `json` for JSON diagnostics, otherwise plain readable logs |
| `QUICKSTACKS_LOG_FILE` | Optional JSONL file; directory recreated when needed |
| `LOG_LEVEL` | trace/debug/info/warn/error/fatal/none; default and invalid-value fallback warn |
| `NO_COLOR` | Keep output free of ANSI (current formatter always uses plain text) |
| `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` | Path roots; an unset `HOME` means the user's home directory. The cache is `$XDG_CACHE_HOME/quickstacks` (`$HOME/.cache/quickstacks`) |

The development wrapper sets info logging, appends `logs/cli.jsonl`, copies noninteractive stderr to `logs/cli.log`, and uses `.dev/data`. Logs rotate above 5 MiB. It forwards arguments, terminal behavior, signals and the child's exit status. `.env` is optional for source development. The standalone build disables dotenv, bunfig, tsconfig and package autoload, following the [Bun compile API](https://bun.sh/docs/bundler/executables).

## Output contract

Stdout contains results only. `--json` emits one result object; JSON version is `{ "version": "0.1.0" }` and JSON help is `{ "help": "..." }`. Failures leave stdout empty and stderr contains a safe diagnostic, or exactly one JSON `{ "error": { "tag", "message", "retryable" } }` object. In JSON mode ancillary logs go only to the optional log file so stderr remains parseable; set `QUICKSTACKS_LOG_FILE`, or rerun without `--json`, to see why a `Defect` happened. A `--json` after `--` belongs to the command, not to quickstacks. Human mode emits logs to stderr and optionally to the same JSONL file. No streaming command exists in this base.

Exit codes: usage/bad-input/not-found 2; config 3; upstream 4; permission 6; interruption 130; defect 1. A closed stdout pipe exits quietly with 0. Defects never become success.

## Development checks

`bun run check` runs Biome (including the boundary plugin), TypeScript, Vitest on Node, then the compiled binary checks under Bun. `bun run coverage` measures application code. Tests isolate HOME/XDG and clear credentials; compiled tests create their environment from scratch. No `.env`, credentials or external services are needed.

Commands here run from `apps/cli/`; the repo root has the same names fanned out to every package. See [AGENTS.md](../../AGENTS.md), [the harness guide](../../docs/harness.md), and [the installed Effect guide](../../.claude/skills/effect/SKILL.md). CI reads Bun from packageManager through [setup-bun](https://github.com/oven-sh/setup-bun).
