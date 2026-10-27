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

`bun run dev` runs the CLI from source in the directory you ran it from (a subdirectory of the repo works), with Bun's `.env` and `bunfig.toml` autoload off there. From outside the repo, Bun hides that directory, so pass it: `INIT_CWD="$PWD" bun run --cwd <repo> dev new <stack> app`.

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
| `bundled` | the registry shipped with the CLI (`packages/cli/registry/` in this repo; `QUICKSTACKS_REGISTRY_DIR` replaces it) | yes, unless `QUICKSTACKS_REGISTRY_DIR` set it |

Each root holds `stacks/<id>/STACK.md` and `fragments/<id>/FRAGMENT.md`, each with optional `files/` (copied into every project) and `adapters/<agent>/` (copied when that agent is a target; agents are `claude`, `codex`, `opencode`, `cursor`). An app is a fragment with `category: app`. Files are stored under their real names, dotfiles included: `files/.gitignore` is written as `.gitignore`. An entry directory may not be or contain a symlink, and nothing past one is read. The project root and its `stacks/` and `fragments/` must be real directories (a symlinked one is skipped with a warning); the user and bundled roots may be symlinks.

The markdown file starts with YAML frontmatter between two `---` lines, then guidance prose for the building agent. Frontmatter keys are snake_case (`schema_version`, `applies_to`, `needs_own_repo`, `requires_tools`); unknown keys, including camelCase spellings, are errors. Output from the CLI spells the same fields in camelCase (`appliesTo`).

The same id in a higher root wins; `list --json` marks the winner's `shadows` with the origins it hides. An entry that fails to load is listed under `rejected` with a one-line error and is never silently replaced by a lower copy. An entry with a newer `schema_version` than this CLI reads is skipped with a warning, and the next root's copy is used.

## Bundled stacks

The core loop: `new <stack>` writes the starter files and `.quickstacks/BRIEF.md`, your coding agent builds the project from the brief, and `verify` runs the stack's steps until they pass. `--sandbox` keeps it local: every decision takes its default, deploy, release and app fragments stay out unless named with `--with`, and steps tagged `prod` are skipped.

| Stack | What it builds | App (`--with`) |
| --- | --- | --- |
| `astro-blog` | Static Astro blog: MDX posts in a validated collection, React islands, Tailwind, RSS and sitemap | |
| `cloudflare-react-router` | React Router on the local Workers runtime with typed bindings and Workers integration tests | |
| `go-cli` | Go CLI: cobra, viper config, structured errors, human and JSON output, golangci-lint | |
| `mobile-expo` | Expo Router app and a Bun + Hono API on Postgres, sharing zod schemas through a typed client | |
| `python-react` | FastAPI backend and a React SPA talking through a client generated from the OpenAPI spec | |
| `react-router` | React Router framework mode with SSR, Effect services, typed HTTP errors, Tailwind and shadcn | `openrouter-chat` |
| `tauri-react` | Tauri desktop app: Rust crates behind a thin shell, typed IPC, a React frontend with a mock transport | |
| `typescript-cli` | Bun-compiled TypeScript CLI on Effect with typed errors, safe output and logs | `openrouter-chat-cli` |

`quickstacks list` shows each stack's fragments; `validate` reports every stack's composed brief size in both presets.

## Starting a project

```sh
quickstacks new <stack> [dir]    # dir defaults to <stack>; `.` is the current directory
  --with a --with b              # add optional fragments (repeatable, or comma-separated)
  --without a                    # remove default fragments
  --sandbox                      # every default, nothing deployed or released; implies --yes
  --yes                          # the brief tells the agent to take each decision's default
  --agents claude,codex          # adapter targets (default: the `agents` setting, else claude)
  --scope acme                   # npm scope for {{package_scope}} (default: the `package_scope` setting)
  --launch codex                 # the agent to hand off to: claude, codex, opencode or cursor
  --no-launch                    # print the prompt instead of starting an agent
  --json                         # one NewResult object; never starts an agent
```

`new` composes the stack, writes its files and `.quickstacks/` (`BRIEF.md`, `NOTES.md`, `manifest.json`, an empty `state/`, and a `.gitignore` that ignores `BRIEF.md`, `NOTES.md`, `state/` and `incoming/`), writes a state record outside the project, runs `git init` when the target isn't already inside a repository and git is on PATH, then hands off to an agent. It never runs a command from a stack or fragment.

The handoff, first match wins (the manifest's `handoff` records which, with the agent and time):

1. Run from inside an agent session (an agent marker such as `CLAUDECODE` or `AI_AGENT` is set): stdout ends with `NEXT STEP FOR THE AGENT: ...`, telling that agent to read the brief and loop on `verify`. With an untrusted entry it says `STOP` instead: show the user the entries and the brief's first section, and continue only if they confirm.
2. `--json`, `--no-launch`, stdin or stdout not a terminal, or any untrusted entry: the prompt is printed, with an example command, and nothing is launched. An untrusted entry never launches an agent.
3. Otherwise the first agent CLI on PATH (`--launch` alone, else the `agents` setting, then `claude`, `codex`, `opencode`, `cursor-agent`) starts in the project with the prompt as its first message, with your environment and the terminal. quickstacks exits with that agent's status, with no error envelope: the project was written either way. None on PATH: the prompt is printed. `--launch` with `--no-launch` or `--json` is `Usage` (exit 2).

## The agent guide

`quickstacks` with no arguments, or `quickstacks guide` (proposed; not yet agreed by the maintainers), prints a short guide written for agents: the `list`, `new`, `verify` loop and its rules. `--json` returns `{ guide, commands }`. `quickstacks --help` keeps the full help and ends with a "Start here (agents)" footer.

- `.quickstacks/manifest.json` records the stack, fragments, preset, agents and the verify steps with their digest; it is committed with the project. A manifest whose `schemaVersion` is newer than this CLI reads fails `InvalidConfig` (exit 3): upgrade quickstacks.
- The state record is a second copy of the verify digest at `$XDG_STATE_HOME/quickstacks/projects/<projectId>.json` (`QUICKSTACKS_STATE_DIR` replaces `$XDG_STATE_HOME/quickstacks`), so editing the project's files can't hide a changed verify step. When that directory isn't writable, `new` still succeeds with `stateRecord: false`, and verify's tamper check uses the manifest only.
- The target must not exist, or be empty. A directory holding only `.git` or OS litter (`.DS_Store`, `Thumbs.db`, `desktop.ini`, `._*`) counts as empty; anything else fails `TargetNotEmpty` (exit 2).
- Inside another repository nothing is initialized, and a fragment with `needs_own_repo` is refused (`ComposeConflict`, with the `--without` flags that would avoid it). A target that is itself a repository's root is that project's own repository, so those fragments are allowed. When git fails for any reason other than "not a git repository" (a broken `.git`, unsafe ownership), nothing is initialized and the result carries a `git_unusable` warning.
- Files ending `.tmpl` are rendered and lose the suffix. The only variables are `project_name` (the directory's name, which may not contain control characters), `project_slug`, `env_prefix`, `package_scope`, `author` (the `author` setting, else `git config user.name`; quotes, backslashes and line breaks are removed) and `year`; a token is `{{ name }}` on one line, and an unknown name fails `EntryInvalid` before anything is written. Every other file is copied byte for byte, keeping its executable bit.
- No entry may write under `.git/` or `.quickstacks/`, in any letter case (`ComposeConflict`, reason `reserved_path`), and two entry files whose paths differ only in case collide (`file_owner`).
- Every write is checked against the project's real path, so nothing lands outside it (`PermissionDenied`, reason `escape`). A failure or Ctrl+C removes everything `new` wrote, the state record included.
- Missing tools never fail `new`: they are listed in the result and the brief, with the `--without` flag that would drop the fragment needing one.

## Verifying a project

```sh
quickstacks verify                 # every step, from the project root or any directory below it
  --only lint,test                 # only these check and serve steps (repeatable); setup and teardown still run
  --skip-tag slow                  # leave out steps with this tag (repeatable)
  --all                            # also run steps skipped by default (prod steps in a --sandbox project)
  --accept-changes                 # a person only: record the steps as they are now, then run them
  --json                           # one VerifyResult object
```

`verify` finds the nearest `.quickstacks/manifest.json` walking up from the current directory and runs only the steps it lists, printing each command before running it. Nothing else runs.

- Phases run in order. `setup` stops at its first failure and skips the check and serve steps; every `check` step runs, so one run reports every failing check; each `serve` step is started, probed and stopped; `teardown` always runs, after a failure or a Ctrl+C too.
- Steps run through `/bin/sh -c` in the project root (or the step's `cwd`, which must resolve inside the project) with stdin closed, in their own process group. Their environment is the caller's, minus every agent session marker (`CLAUDECODE` and the rest), with the manifest's `env` filling keys the caller doesn't set: `PORT_WEB=5187 quickstacks verify` moves a port.
- Each setup, check and teardown step has its `timeout` (default 10m). A step that leaves a process holding its output is stopped 2 s after its shell exits and gets a note; its own exit status still decides it. Exit 127 is reported as a missing command (`failureKind: "env"`).
- A serve step's `expect.http` (with `${VAR}` expanded from the step environment) must be an `http` URL on `localhost`, `127.0.0.1` or `::1`. Verify fails the step without starting it when that port already answers, then polls the URL every 500 ms until any status below 500, for up to `within` (default 60s). Serve commands must stay in the foreground: one that exits before its probe passes fails, and so does a server still answering on the port after its process group was stopped.
- Outcomes: `green` (exit 0) is a full run with every step that ran passing. A passing `--only` or `--skip-tag` run is `partial` (exit 0), which never counts as done. A failed step is `failed`: exit 5 (`VerifyFailed`) with the full result still on stdout, each failed step's `failureKind` (`step`, `env`, `timeout`) and output tail in it, and the error envelope naming the failed steps as the last stderr line. Ctrl+C is exit 130 after teardown. Outside a project is `NotFound` (2); a manifest that doesn't decode is `InvalidConfig` (3).
- Human mode streams each step's output to stderr, prefixed with its name, and ends a run that isn't green with a `Next:` line.

### Changed steps and run records

Before running anything, `verify` checks the steps against the copies recorded by `new`: the manifest's own `verifyDigest`, and the project state record outside the project (`$XDG_STATE_HOME/quickstacks/projects/<projectId>.json`, or under `QUICKSTACKS_STATE_DIR`). The digest covers every field verify reads from each step, plus the manifest's `env` and `preset`; a step's `owner` is left out.

- Any difference is outcome `changed`: no step runs, not even teardown, and the exit is 5 (`VerifyChanged`) with the result on stdout. Its `changed` field (and the envelope's `details`) says which copy disagreed (`against`: `manifest` or `state-record`) and, from the state record's per-step digests, which steps were `edited`, `added` or `removed`, and whether `env` or `preset` changed (`settings`). A state record found only by the manifest's path, under a different `projectId`, is a change with `reason: "project-id"`.
- With no state record on this machine (a fresh clone, or a state directory `new` couldn't write), only the manifest's copy is checked and the result says `tamperCheck: "manifest-only"`, which never counts for the MVP gate. An unreadable record counts as missing; one a newer quickstacks wrote fails `InvalidConfig` (3).
- `verify --accept-changes` is for a person who changed the steps on purpose. It is refused with `PermissionDenied` (6) when an agent is detected (`reason: "agent"`) or stdin isn't a terminal (`no-tty`), and then changes nothing. Otherwise it prints what changed, writes the new digest to the state record (creating it on a fresh clone) and then to the manifest, keeps the project's timing fields, and runs the steps. A state record it can't write fails `PermissionDenied` (`state-unwritable`) with the manifest untouched.
- Every run that gets past the manifest (`changed`, `failed` and interrupted ones included) appends one `RunRecord` line to `.quickstacks/state/runs.jsonl`, which the project's `.gitignore` ignores: `schemaVersion`, start time, CLI version, detected agent, outcome, scope, `tamperCheck`, `acceptedChanges`, durations and each step's name, phase, layer, status, failure kind and exit code. No commands, output, paths or environment values, so it is safe to attach to a bug report.
- The state record's `firstGreenAt` is set by the first green run and `firstTestPassAt` by the first run, of any scope, in which a `test`-layer step passed; neither is overwritten. The result's `firstGreen` is true on the run that set it, and `stateRecord` is false when there was no record to update or it couldn't be written. A run record or state record that can't be written is one logged warning; the outcome and exit don't change.

## Validating a registry

```sh
quickstacks validate                       # the bundled registry
quickstacks validate ~/my-registry         # a registry root (holds stacks/ or fragments/)
quickstacks validate ~/my-registry/stacks/web   # one entry
quickstacks validate --json                # the ValidateReport
quickstacks validate --brief web --with docs --sandbox   # the brief a composition renders to
```

`validate` reads files only; it runs nothing from an entry. It checks frontmatter and identity, references (`fragments`, `requires`, `conflicts`, `applies_to`), conditional prose markers, `merge` files, verify step layers, whether git ignores any of an entry's files, and composes each stack in both presets: alone (with its required and default fragments), then with each optional fragment and each app that fits it added on its own. References resolve through every root, the one being validated first; one that resolves only in another root is a note naming that root. The bundled registry must be self-contained.

Every stack's base composition must verify each layer: `install`, `lint`, `typecheck` and `test`, plus a `serve` step with a probe when the stack is tagged `web` or `api`.

Word budgets, counted with every conditional branch in a body and, for a composed brief, the CLI's own text included (reported separately as fixed text). Every composed brief is rendered on one fixed context (no missing tools, a fresh repository, the `npx` invocation) so the counts are the same on every machine:

| Subject | Limit (words) |
| --- | --- |
| Stack body | 2,000 |
| Fragment body | 1,000 |
| App body (`category: app`) | 3,000 |
| Composed brief | 6,000 |
| Composed brief with an app | 9,000 |

Findings are errors, warnings or notes. Exit 0 when there are no errors; exit 2 (`ValidationFailed`) with the full report still on stdout and the error envelope, with the counts, as the last stderr line. A path that is neither a registry root nor an entry under `stacks/` or `fragments/` is `NotFound` (2); an unreadable root is exit 6. Warnings don't change the exit, but the bundled registry is held to zero.

`--brief <stack>` prints the composed brief, then its word count, fixed-text count and limit. `--with` and `--without` take ids (repeatable or comma-separated); they and `--sandbox` work only with `--brief`.

## Configuration

Optional configuration is `$XDG_CONFIG_HOME/quickstacks/config.json`, defaulting to `$HOME/.config/quickstacks/config.json`. Its closed schema accepts these optional keys, and rejects any other. Environment values override file values; blank values count as absent. Configuration is read lazily and cached for one invocation.

| Key | Meaning |
| --- | --- |
| `dataDir` | Data path; `QUICKSTACKS_DATA_DIR` overrides it |
| `always` | Fragment ids added to every composition that they fit; one that doesn't fit, or doesn't exist, is skipped with a warning. `--without` still removes one |
| `agents` | Agents whose `adapters/<agent>/` files are written: any of `claude`, `codex`, `opencode`, `cursor`. `--agents` overrides it; the default is `["claude"]` |
| `author` | Author name for templates |
| `package_scope` | npm scope for templates, such as `@acme` |

Environment settings:

| Setting | Meaning |
| --- | --- |
| `QUICKSTACKS_DATA_DIR` | Data path; defaults to `$XDG_DATA_HOME/quickstacks` (`$HOME/.local/share/quickstacks`) |
| `QUICKSTACKS_STATE_DIR` | Project state records; defaults to `$XDG_STATE_HOME/quickstacks` (`$HOME/.local/state/quickstacks`) |
| `QUICKSTACKS_LOG_FORMAT` | `json` for JSON diagnostics, otherwise plain readable logs |
| `QUICKSTACKS_LOG_FILE` | Optional JSONL file; directory recreated when needed |
| `LOG_LEVEL` | trace/debug/info/warn/error/fatal/none; default and invalid-value fallback warn |
| `QUICKSTACKS_REGISTRY_DIR` | A directory used as the bundled registry instead of the one shipped with the CLI, relative to the working directory; its entries are untrusted |
| `NO_COLOR` | Keep output free of ANSI (current formatter always uses plain text) |
| `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME` | Path roots; an unset `HOME` means the user's home directory. The cache is `$XDG_CACHE_HOME/quickstacks` (`$HOME/.cache/quickstacks`) |

The development wrapper sets info logging, appends `logs/cli.jsonl`, copies noninteractive stderr to `logs/cli.log`, and uses `.dev/data` and `.dev/state`. Logs rotate above 5 MiB. It forwards arguments, terminal behavior, signals and the child's exit status. `.env` is optional for source development. The standalone build disables dotenv, bunfig, tsconfig and package autoload, following the [Bun compile API](https://bun.sh/docs/bundler/executables).

## Output contract

Stdout contains results only. `--json` emits one result object; JSON version is `{ "version": "0.1.0" }` and JSON help is `{ "help": "..." }`. Failures leave stdout empty and stderr contains a safe diagnostic, or exactly one JSON `{ "error": { "tag", "message", "retryable", "details"? } }` object as the last stderr line. `details`, when present, is a closed per-tag object (for example `{ "command", "suggestions" }` for an unknown subcommand). Two exceptions keep stdout: a failure that carries a report (`VerifyFailed`, `VerifyChanged`, `ValidationFailed`) writes that report to stdout before the error, and a command that hands the terminal to another program writes its output so far before doing so, which stays on stdout if it later fails. In JSON mode ancillary logs go only to the optional log file so stderr remains parseable; set `QUICKSTACKS_LOG_FILE`, or rerun without `--json`, to see why a `Defect` happened. A `--json` after `--` belongs to the command, not to quickstacks. Human mode emits logs to stderr and optionally to the same JSONL file. No streaming command exists in this base.

Exit codes: usage/bad-input/not-found 2, and validation failed 2 (the validate report stays on stdout); config 3; upstream 4; verify failed or changed 5 (the verify report stays on stdout); permission 6; interruption 130; defect 1. After `new` launches an agent, the exit is that agent's own status (128 plus the signal number if a signal killed it), outside this table. Scripts that expect 1 for every failure get these specific codes instead. A closed stdout pipe exits quietly with 0, except after a failure that keeps its report, which keeps its exit (2 for validate, 5 for verify). Defects never become success.

Signals: Ctrl+C (SIGINT), SIGTERM or SIGHUP stops the command after its cleanup, with exit 130, and the processes it started are killed. A second Ctrl+C within a second of the first is treated as the same keypress (a wrapper such as `bun run dev` or `npx` forwards a copy); one a second or more later exits at once, killing those processes without further cleanup. While quickstacks has handed the terminal to another program, Ctrl+C and SIGQUIT belong to that program, and SIGTERM and SIGHUP are passed on to it; once that program exits, quickstacks stops too, with exit 130.

## Development checks

`bun run check` runs Biome (including the boundary plugin), TypeScript, Vitest on Node, then the compiled binary checks under Bun. `bun run coverage` measures application code. Tests isolate HOME/XDG and clear credentials; compiled tests create their environment from scratch. No `.env`, credentials or external services are needed.

Commands here run from `packages/cli/`; the repo root has the same names fanned out to every package. See [AGENTS.md](../../AGENTS.md), [the harness guide](../../docs/harness.md), and [the installed Effect guide](../../.claude/skills/effect/SKILL.md). CI reads Bun from packageManager through [setup-bun](https://github.com/oven-sh/setup-bun).
