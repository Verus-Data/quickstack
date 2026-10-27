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

`doctor` reports version, platform, compiled status, executable/config/data/working paths, the user entry directory, the bundled registry path (and whether it exists), and safe configuration errors. A missing configuration file is fine. A malformed optional file is reported in `configErrors` while doctor exits successfully; help and version do not open that file.

## Listing stacks and fragments

```sh
quickstacks list                 # Stacks, Fragments and Apps, then Next: lines
quickstacks list stacks          # one group: stacks, fragments (apps excluded) or apps
quickstacks list --json          # { entries, rejected } for an agent choosing a stack
```

Entries come from three roots, highest precedence first:

| Origin | Root | Trusted |
| --- | --- | --- |
| `project` | `./.quickstacks/` in the working directory | no: a cloned repository can ship these |
| `user` | `$XDG_CONFIG_HOME/quickstacks/` (`~/.config/quickstacks/`), beside `config.json` | yes |
| `bundled` | the registry shipped with the CLI (`packages/cli/registry/` in this repo, empty until the bundled catalog lands; `QUICKSTACKS_REGISTRY_DIR` replaces it) | yes, unless `QUICKSTACKS_REGISTRY_DIR` set it |

Each root holds `stacks/<id>/STACK.md` and `fragments/<id>/FRAGMENT.md`, each with optional `files/` (copied into every project) and `adapters/<agent>/` (copied when that agent is a target; agents are `claude`, `codex`, `opencode`, `cursor`). An app is a fragment with `category: app`. Files are stored under their real names, dotfiles included: `files/.gitignore` is written as `.gitignore`. An entry directory may not be or contain a symlink, and nothing past one is read. The project root and its `stacks/` and `fragments/` must be real directories (a symlinked one is skipped with a warning); the user and bundled roots may be symlinks.

The markdown file starts with YAML frontmatter between two `---` lines, then guidance prose for the building agent. Frontmatter keys are snake_case (`schema_version`, `applies_to`, `needs_own_repo`, `requires_tools`); unknown keys, including camelCase spellings, are errors. Output from the CLI spells the same fields in camelCase (`appliesTo`).

The same id in a higher root wins; `list --json` marks the winner's `shadows` with the origins it hides. An entry that fails to load is listed under `rejected` with a one-line error and is never silently replaced by a lower copy. An entry with a newer `schema_version` than this CLI reads is skipped with a warning, and the next root's copy is used.

## Configuration

Optional configuration is `$XDG_CONFIG_HOME/quickstacks/config.json`, defaulting to `$HOME/.config/quickstacks/config.json`. Its closed schema accepts only an optional string `dataDir`. Environment values override file values; blank values count as absent. Configuration is read lazily and cached for one invocation.

| Setting | Meaning |
| --- | --- |
| `QUICKSTACKS_DATA_DIR` | Data path; defaults to `$XDG_DATA_HOME/quickstacks` (`$HOME/.local/share/quickstacks`) |
| `QUICKSTACKS_LOG_FORMAT` | `json` for JSON diagnostics, otherwise plain readable logs |
| `QUICKSTACKS_LOG_FILE` | Optional JSONL file; directory recreated when needed |
| `LOG_LEVEL` | trace/debug/info/warn/error/fatal/none; default and invalid-value fallback warn |
| `QUICKSTACKS_REGISTRY_DIR` | A directory used as the bundled registry instead of the one shipped with the CLI, relative to the working directory; its entries are untrusted |
| `NO_COLOR` | Keep output free of ANSI (current formatter always uses plain text) |
| `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` | Path roots; an unset `HOME` means the user's home directory. The cache is `$XDG_CACHE_HOME/quickstacks` (`$HOME/.cache/quickstacks`) |

The development wrapper sets info logging, appends `logs/cli.jsonl`, copies noninteractive stderr to `logs/cli.log`, and uses `.dev/data`. Logs rotate above 5 MiB. It forwards arguments, terminal behavior, signals and the child's exit status. `.env` is optional for source development. The standalone build disables dotenv, bunfig, tsconfig and package autoload, following the [Bun compile API](https://bun.sh/docs/bundler/executables).

## Output contract

Stdout contains results only. `--json` emits one result object; JSON version is `{ "version": "0.1.0" }` and JSON help is `{ "help": "..." }`. Failures leave stdout empty and stderr contains a safe diagnostic, or exactly one JSON `{ "error": { "tag", "message", "retryable", "details"? } }` object as the last stderr line. `details`, when present, is a closed per-tag object (for example `{ "command", "suggestions" }` for an unknown subcommand). Two exceptions keep stdout: a verify failure (`VerifyFailed`, `VerifyChanged`) writes its report to stdout before the error, and a command that hands the terminal to another program writes its output so far before doing so, which stays on stdout if it later fails. In JSON mode ancillary logs go only to the optional log file so stderr remains parseable; set `QUICKSTACKS_LOG_FILE`, or rerun without `--json`, to see why a `Defect` happened. A `--json` after `--` belongs to the command, not to quickstacks. Human mode emits logs to stderr and optionally to the same JSONL file. No streaming command exists in this base.

Exit codes: usage/bad-input/not-found 2; config 3; upstream 4; verify failed or changed 5 (the verify report stays on stdout); permission 6; interruption 130; defect 1. Scripts that expect 1 for every failure get these specific codes instead. A closed stdout pipe exits quietly with 0, except after a verify failure, which keeps exit 5. Defects never become success.

Signals: Ctrl+C (SIGINT), SIGTERM or SIGHUP stops the command after its cleanup, with exit 130, and the processes it started are killed. A second Ctrl+C within a second of the first is treated as the same keypress (a wrapper such as `bun run dev` or `npx` forwards a copy); one a second or more later exits at once, killing those processes without further cleanup. While quickstacks has handed the terminal to another program, Ctrl+C and SIGQUIT belong to that program, and SIGTERM and SIGHUP are passed on to it; once that program exits, quickstacks stops too, with exit 130.

## Development checks

`bun run check` runs Biome (including the boundary plugin), TypeScript, Vitest on Node, then the compiled binary checks under Bun. `bun run coverage` measures application code. Tests isolate HOME/XDG and clear credentials; compiled tests create their environment from scratch. No `.env`, credentials or external services are needed.

Commands here run from `packages/cli/`; the repo root has the same names fanned out to every package. See [AGENTS.md](../../AGENTS.md), [the harness guide](../../docs/harness.md), and [the installed Effect guide](../../.claude/skills/effect/SKILL.md). CI reads Bun from packageManager through [setup-bun](https://github.com/oven-sh/setup-bun).
