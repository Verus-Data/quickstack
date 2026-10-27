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

`doctor` reports version, platform, compiled status, executable/config/data/working paths, the user entry directory, the bundled registry and skill paths (and whether each exists), and safe configuration errors. A missing configuration file is fine. A malformed optional file is reported in `configErrors` while doctor exits successfully; help and version do not open that file.

## Project run history and the bundled ledger

`quickstacks runs [--json]` finds the nearest project and reports its stack, fingerprint,
creation time, handoff kind, brief words, verify count, last outcome, timings, interventions,
state-record availability and skipped history lines. It reads the project’s
`.quickstacks/state/runs.jsonl` and `NOTES.md`. Timings come only from the out-of-project
state record; unavailable timings or notes stay unknown. Invalid or newer history lines
are counted and skipped. Outside a project it exits 2 with `NotFound`. A newer state schema exits 3 with
`InvalidConfig`. Moving a project retains its timings through its project id.

Each bundled stack in `list --json` carries `lastRun: { date, result, agent, preset,
fingerprint } | null`, the latest run of its default composition across agents and presets.
When the registry has a ledger, text output labels it `proven <date>` for a pass, `<result> <date>` otherwise, or `unproven`.
Other origins and fragments have no proof. This describes the recorded run; it does not
claim the current stack still has that fingerprint.

The reviewed ledger is `registry/runs.json`. From this package, import gate notes with:

```sh
bun run ledger:import ../../plans/runs/2026-10-27-*.md
bun run ledger:import ../../plans/runs/2026-10-27-*.md --dry-run
```

The development script discovers the repo from cwd, archives only the registry at each
note’s commit into a temporary directory and fingerprints it with the current composition
code. A contradictory Outcome row and final verify record are reported and skipped; a
maintainer’s explicit `partial` remains partial even when verify is green. The driving agent
is independent of adapter targets: targets default to `claude`; notes for an override can
include a `Target agents` table row with comma-separated ids such as `codex`, `claude`.
It records only added fragments in `with`, removing fragments already selected by
the default composition at that commit. Existing `(repoCommit, stack, date)` records are
skipped. Incomplete notes are reported, other notes continue, and any failure exits 1.
`--dry-run` prints a JSON array and writes no ledger; `--` ends options. Bun consumes an
initial `--` before passing arguments to a script, so single-dash note names are also
accepted directly. Use `./` for a note name that collides with a long option.

## Maintainer bench

From this package, `bun run bench <stack> --agent claude --keep` builds the dev binary,
installs it with the working registry into a throwaway prefix, scaffolds the stack,
runs the agent headlessly and verifies independently. `--cli <binary>` skips the build;
`--preset default` uses defaults instead of sandbox, `--with a,b` adds fragments,
`--max-minutes 60` sets the time limit, and `--no-record` skips the ledger and run note.
`--existing <kept-root>` continues matching content and adds one intervention.
The package must be clean before a run. Read every generated note under `plans/runs/`
and its `registry/runs.json` record before committing; a green verify can still need
relabeling as `partial` after review. The bench never commits anything.

Auth is `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, or `CODEX_ACCESS_TOKEN`
as documented by `codex login --with-access-token`. Only the selected token reaches
the agent; no credentials or settings are copied. The fresh `HOME` and project are
not a security boundary: local runs give the agent full permissions. Child processes
get `DO_NOT_TRACK=1`. Fake-agent tests need no account or real token.

## Starting a project with an agent

There are two ways in: run the CLI yourself, or install the skill once and ask your coding agent to start a project. The skill ships with the next release; npm publication is deferred. These are the packaged entry points:

```sh
npx quickstacks new astro-blog my-blog
npx quickstacks skill install
```

For the current dev build, choose a destination outside this checkout. Use `bun run dev new astro-blog "$HOME/quickstacks-projects/my-blog"` or `bun run dev skill install` from this package, or `./dist/quickstacks` after building. The skill teaches the agent to choose a stack, read `.quickstacks/BRIEF.md`, and build until verify is green. For an existing repository, use `add <fragment...>`.

```sh
quickstacks skill install             # $HOME/.claude/skills/quickstacks/SKILL.md
quickstacks skill install --project   # git toplevel, or cwd outside a repo
quickstacks skill install --force     # replace an edited copy
quickstacks skill install --print     # copy the skill to another location yourself
quickstacks skill install --json      # { path, action: "written" | "unchanged" }
quickstacks skill install --print --json   # { path: null, action: "printed", text }
```

An identical installed file is unchanged. A differing file is preserved with `TargetNotEmpty` (exit 2) unless `--force` is set; a directory occupying `SKILL.md` is always preserved. Writes refuse symlinks escaping the skills root and final `SKILL.md` symlinks; a dotfiles symlink above the skills root is supported. Installation is allowed under an agent. A missing `HOME` or an unwritable target exits 6; `--print` skips all target lookup and writes nothing. A missing bundled skill exits 2 and appears as `skill.found: false` in `doctor --json`.

## Listing stacks and fragments

Create personal entries with `quickstacks create stack my-api` or
`quickstacks create fragment my-ci --category ci`. They are written into the user registry;
existing targets are preserved. `quickstacks create stack go-cli --from bundled` copies an
entry under the same id for editing, including all files and adapters. `--from project`
requires a person at a terminal to review the full trust report; `--yes` skips only the
question. Agents and non-terminal stdin cannot confer trust. `--from user` is refused.
`--json` returns `{ kind, id, path, guide }` with absolute paths. Follow the shipped
[authoring guide](docs/authoring.md) to preview, validate and prove the entry.

Set `"preset": "sandbox"` in `config.json` to default new projects to sandbox.
`new --preset default|sandbox` overrides the setting; `--sandbox` is a sandbox alias.
Flags win, then the setting, then `default`. `--sandbox --preset default` is Usage
(exit 2). Sandbox implies `--yes` regardless of how it was selected. `add` keeps the
manifest's preset; `validate --brief` ignores the setting.

```sh
quickstacks list                 # Addable fragments in a project; otherwise all groups
quickstacks list stacks          # one group: stacks, fragments (apps excluded) or apps
quickstacks list --json          # Full registry, plus project context when a manifest decodes
quickstacks show <id> --json     # Full metadata, guidance, files and bundled run evidence
quickstacks show <id> --kind fragment   # Resolve an id shared with a stack
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

`list` reads the manifest in the current directory (or `--dir`). Its default text view shows fitting, unapplied fragments with add commands; explicit groups keep their usual view. JSON keeps the full registry and adds optional `project: { stack, applied, addable }`. A corrupt, newer or unreadable manifest warns and falls back to the full view.

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

## Agent adapters

`--agents` selects native config; it does not change which agent drives the handoff.
All targets receive `AGENTS.md`. Guard scripts are shared under `.claude/hooks/`;
only selected agents receive their config. A blocked action means ask the user.

| Agent | Enforced guards and instructions | Proof |
| --- | --- | --- |
| Claude Code (`claude`) | Enforced destructive-command and secret-write hooks; lint-on-write, format-on-stop; CLAUDE.md imports AGENTS.md and path rules carry instructions | Existing Claude bench adapter; see the composition's ledger record |
| Codex (`codex`) | Enforced Bash and native apply_patch guards after hook trust; workspace-write sandbox, on-request approvals; AGENTS.md and project skills carry instructions; lint/format are instructions | Bench adapter exists; a real pass with hooksFired is still required for native adapter proof |
| OpenCode (`opencode`) | Enforced permissions and plugin callback guards; lint-on-write, format-on-idle; AGENTS.md and project skills carry instructions | Unproved: 2.0b has no OpenCode bench adapter; composition and offline callbacks only |
| Cursor (`cursor`) | Enforced preToolUse shell/write guards; always-applied MDC instructions; lint/format are instructions | Unproved: 2.0b has no Cursor bench adapter; composition and offline hooks only |

Codex project hooks require review and trust through `/hooks`. Linked-worktree hook
discovery needs a live-agent check; offline payload tests prove protocol decisions.
OpenCode targets its documented local-plugin format; no Claude marketplace settings
or TypeScript harness extensions are migrated to the other agents.

Formats: [Codex config](https://developers.openai.com/codex/config-advanced/),
[Codex hooks](https://developers.openai.com/codex/hooks/),
[Codex skills](https://developers.openai.com/codex/skills/),
[OpenCode permissions](https://opencode.ai/docs/permissions/),
[plugins](https://opencode.ai/docs/plugins/), [formatters](https://opencode.ai/docs/formatters/),
[skills](https://opencode.ai/docs/skills/),
[Cursor hooks](https://cursor.com/docs/hooks) and [rules](https://cursor.com/docs/rules).

## Starting a project

```sh
quickstacks new <stack> [dir]    # dir defaults to the slug of --name, else <stack>; `.` is the current directory
  --with a --with b              # add optional fragments (repeatable, or comma-separated)
  --without a                    # remove default fragments
  --sandbox                      # every default, nothing deployed or released; implies --yes
  --yes                          # the brief tells the agent to take each decision's default
  --agents claude,codex          # adapter targets (default: the `agents` setting, else claude)
  --name "My App"                # project_name for templates (default: directory base name)
  --author "A. Name"             # author for templates (default: setting, then git user.name)
  --dry-run                      # render and report the plan without writing or launching
  --scope acme                   # npm scope for {{package_scope}} (default: the `package_scope` setting)
  --launch codex                 # the agent to hand off to: claude, codex, opencode or cursor
  --no-launch                    # print the prompt instead of starting an agent
  --json                         # one NewResult object; never starts an agent
```

`new` composes the stack, writes its files and `.quickstacks/` (`BRIEF.md`, `NOTES.md`, `manifest.json`, an empty `state/`, and a `.gitignore` that ignores `BRIEF.md`, `NOTES.md`, `state/` and `incoming/`), writes a state record outside the project, runs `git init` when the target isn't already inside a repository and git is on PATH, then hands off to an agent. It never runs a command from a stack or fragment.

`--dry-run` checks the same target, composes and renders every file in memory, including the manifest, then stops before writing. It creates no directory, state record or git repository and starts no agent. Its JSON result has `dryRun: true`, `stateRecord: false`, and `written` lists the planned files; real runs have `dryRun: false`. Git, fingerprints, word counts and missing tools describe the planned scaffold. Read-only git probes and the author fallback still run. A preview's handoff is `print` with reason `no-launch`, even inside an agent session; text output ends with `Dry run: nothing was written.`. `--dry-run --launch` is `Usage` (exit 2).

`--name` sets `project_name` and, when no directory is given, chooses the directory through its slug. An explicit directory stays the target. Slugs strip npm scopes, fold accents with NFKD, split camelCase and digit boundaries, then join lowercase ASCII words with dashes; names without ASCII words become `project`. `--author` overrides the `author` setting and git fallback; an explicit empty value suppresses both.

The handoff for a real run, first match wins (the manifest's `handoff` records which, with the agent and time):

1. Run from inside an agent session (an agent marker such as `CLAUDECODE` or `AI_AGENT` is set): stdout ends with `NEXT STEP FOR THE AGENT: ...`, telling that agent to read the brief and loop on `verify`. With an untrusted entry it says `STOP` instead: show the user the entries and the brief's first section, and continue only if they confirm.
2. `--json`, `--no-launch`, stdin or stdout not a terminal, or any untrusted entry: the prompt is printed (with an example command, for a human) and nothing is launched. An untrusted entry never launches an agent.
3. Otherwise the first agent CLI on PATH (`--launch` alone, else the `agents` setting, then `claude`, `codex`, `opencode`, `cursor-agent`) starts in the project with the prompt as its first message, with your environment and the terminal. If it can't be started, the manifest's `handoff` is rewritten to `print`. quickstacks exits with that agent's status, with no error envelope: the project was written either way. None on PATH: the prompt is printed. `--launch` with `--no-launch` or `--json` is `Usage` (exit 2).

## Adding fragments to a repository

```sh
quickstacks add ci-github                    # current repository
quickstacks add ci-github --dir ../my-project --no-launch
quickstacks add agent-ops --agents claude,codex --json
```

`add` applies only the requested fragments and their requirements. Existing live files keep their bytes: conflicting contributions are parked whole under `.quickstacks/incoming/<path>` for the agent to merge. Identical contributions are skipped; subsequent parked JSON contributions deep-merge with the parked copy, and other contributions get numbered copies. The result and add brief list every pending incoming file, including earlier runs.

An existing manifest keeps its stack, preset, agents, accepted verify steps, and existing env and command values. Without one, `add` creates a manifest with `mode: "add"` and `stack: null`; it infers the project name from package.json, pyproject.toml, go.mod, Cargo.toml, then the directory name. `--sandbox` and `--agents` configure only a newly created manifest; contradictory values on an existing project refuse. `--yes`, `--launch`, `--no-launch` and `--json` follow `new`'s rules. Tools are looked up but never run, and `add` runs no verify steps.

Before planning, `add` performs the same tamper check as `verify`. Changed steps refuse with `VerifyChanged` (5). A manifest-only project stays manifest-only. An untrusted addition under an agent or without terminal stdin writes the new steps while retaining the previous digest baseline (`digestRecorded: false`); a person must review them and run `verify --accept-changes`. Failed or interrupted writes restore parked copies, metadata and state records and remove new files.

`add --json` returns `AddResult`: `added`, `alreadyApplied`, newly `written` fragment files, `skipped`, `mergeNeeded` with incoming paths, `missingRequired` with exact add commands, `commandsKept`, `warnings`, `missingTools`, inferred `name`, manifest and digest status, and the brief and handoff. Read `.quickstacks/BRIEF.md`, merge the parked contributions while preserving project choices, then run `quickstacks verify` over the whole project.

## The agent guide

`quickstacks` with no arguments, or `quickstacks guide` (proposed; not yet agreed by the maintainers), prints a short guide written for agents: the `list`, `new`, `verify` loop and its rules. `--json` returns `{ guide, commands }`. `quickstacks --help` keeps the full help and ends with a "Start here (agents)" footer.

- `.quickstacks/manifest.json` records the stack, fragments, preset, agents and the verify steps with their digest; it is committed with the project. A manifest whose `schemaVersion` is newer than this CLI reads fails `InvalidConfig` (exit 3): upgrade quickstacks.
- The state record is a second copy of the verify digest at `$XDG_STATE_HOME/quickstacks/projects/<projectId>.json` (`QUICKSTACKS_STATE_DIR` replaces `$XDG_STATE_HOME/quickstacks`), so editing the project's files can't hide a changed verify step. When that directory isn't writable, `new` still succeeds with `stateRecord: false`, and verify's tamper check uses the manifest only.
- The target must not exist, or be empty. A directory holding only `.git` or OS litter (`.DS_Store`, `Thumbs.db`, `desktop.ini`, `._*`) counts as empty; anything else fails `TargetNotEmpty` (exit 2).
- Inside another repository nothing is initialized, and a fragment with `needs_own_repo` is refused (`ComposeConflict`, with the `--without` flags that would avoid it). A target that is itself a repository's root is that project's own repository, so those fragments are allowed. When git fails for any reason other than "not a git repository" (a broken `.git`, unsafe ownership), nothing is initialized and the result carries a `git_unusable` warning.
- Files ending `.tmpl` are rendered and lose the suffix. The only variables are `project_name` (`--name`, else the directory's base name; control characters are refused), `project_slug`, `env_prefix`, `package_scope`, `author` (`--author`, else the `author` setting, else `git config user.name`; quotes, backslashes and line breaks are removed, and other control characters in the flag fail `BadInput`) and `year`; a token is `{{ name }}` on one line, and an unknown name fails `EntryInvalid` before anything is written. Every other file is copied byte for byte, keeping its executable bit.
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
- With `app`-tagged steps, all base phases finish, including teardown, before the app phases start. A failed or interrupted base skips every app step, including app teardown, with reason `base-failed`. An incomplete base also skips app steps, with a reason explaining that the app stage waits for a full verify. A stage interrupted by Ctrl+C still tears down; a base interruption never starts the app. Results and run records include `stages: { base, app }` only for these projects, and both text audiences print their outcomes before the summary. `app` is `null` when it did not run, including `--skip-tag app`. Each stage reports `green` when its selected steps pass, or `partial` when selection left out its steps; default skips still allow green. The whole run stays partial with `--only` or `--skip-tag`. After a green base and a failed app, `Next:` points at the application section of `.quickstacks/BRIEF.md`.
- Steps run through `/bin/sh -c` in the project root (or the step's `cwd`, which must resolve inside the project) with stdin closed, in their own process group. Their environment is the caller's, minus every agent session marker (`CLAUDECODE` and the rest), with the manifest's `env` filling keys the caller doesn't set: `PORT_WEB=5187 quickstacks verify` moves a port.
- Each setup, check and teardown step has its `timeout` (default 10m). A step that leaves a process holding its output is stopped 2 s after its shell exits and gets a note; its own exit status still decides it. Exit 127 is reported as a missing command (`failureKind: "env"`).
- A serve step's `expect.http` (with `${VAR}` expanded from the step environment) must be an `http` URL on `localhost`, `127.0.0.1` or `::1`. Verify fails the step without starting it when that port already answers, then polls the URL every 500 ms until any status below 500, for up to `within` (default 60s). Serve commands must stay in the foreground: one that exits before its probe passes fails, and so does a server still answering on the port after its process group was stopped.
- Outcomes: `green` (exit 0) is a full run with every step that ran passing. A passing `--only` or `--skip-tag` run is `partial` (exit 0), which never counts as done. A failed step is `failed`: exit 5 (`VerifyFailed`) with the full result still on stdout, each failed step's `failureKind` (`step`, `env`, `timeout`) and output tail in it, and the error envelope naming the failed steps as the last stderr line. Ctrl+C is exit 130 after teardown. Outside a project is `NotFound` (2); a manifest that doesn't decode is `InvalidConfig` (3).
- Human mode streams each step's output to stderr, prefixed with its name, and ends a run that isn't green with a `Next:` line.

### Changed steps and run records

Before running anything, `verify` checks the steps against the copies recorded by `new`: the manifest's own `verifyDigest`, and the project state record outside the project (`$XDG_STATE_HOME/quickstacks/projects/<projectId>.json`, or under `QUICKSTACKS_STATE_DIR`). The digest covers every field verify reads from each step, plus the manifest's `env` and `preset`; a step's `owner` is left out.

- Any difference is outcome `changed`: no step runs, not even teardown, and the exit is 5 (`VerifyChanged`) with the result on stdout. Its `changed` field (and the envelope's `details`) says which copy disagreed (`against`: `manifest` or `state-record`) and, from the state record's per-step digests, which steps were `edited`, `added` or `removed`, and whether `env` or `preset` changed (`settings`). A state record found only by the manifest's path, under a different `projectId`, is a change with `reason: "project-id"`.
- With no state record on this machine (a fresh clone, or a state directory `new` couldn't write), only the manifest's copy is checked and the result says `tamperCheck: "manifest-only"`, which never counts for the MVP gate. An unreadable record counts as missing; one a newer quickstacks wrote fails `InvalidConfig` (3).
- `verify --accept-changes` is for a person who changed the steps on purpose. It is refused with `PermissionDenied` (6) when an agent is detected (`reason: "agent"`) or stdin isn't a terminal (`no-tty`), and then changes nothing. Otherwise its report names what changed, it writes the new digest to the state record (creating it on a fresh clone) and then to the manifest, keeps the project's timing fields, and runs the steps. A state record it can't write fails `PermissionDenied` (`state-unwritable`) with the manifest untouched.
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

Rot checks also try explicitly applicable fragments beside each stack's defaults when 1.5 has not already budgeted the combination (`compose-each`). Declared conflicts replace default fragments in either direction, following the `--without` drop hint; required fragments stay. Listed combinations retain the existing composition finding without a duplicate. Unlisted combinations are also checked against the composed brief budget. Dead `stack=` branches warn, or note when reachable only through `--with`. Verify commands must be declared in that composition's commands table. Fragment commands need verify coverage; a fragment describing an existing stack command does not add a new deliverable.

Author bodies with ATX headings (`## Heading`). Exact versions and dated release phrases warn outside fenced examples, in bodies, decisions and shipped Markdown. Version-sensitive config files also warn: describe how the agent should generate them instead. A bare Actions expression such as `${{ github }}` in a `.tmpl` warns; dotted expressions remain literal, and known template variables are intentional substitutions.

Reference checks read the neutral-rendered, merged files for every shipped adapter. Claude settings permissions and VS Code launch arguments must name composed commands or commands named in inline code. Hook paths must exist in the composed files. Literal localhost ports in settings or VS Code JSON warn when an env variable has a `PORT` segment. Invalid reference JSON is one error per file; its reference checks are skipped.

Shipped JavaScript/TypeScript relative imports and shell `source`/`.` targets must resolve to composed files owned by the same entry or a dependency. A fragment may import through the transitive closure of `requires`; a stack may import through `fragments.required`. Default and optional fragments are removable and do not grant import access. Resolution maps `.js` to `.ts`/`.tsx`, tries `.ts`, `.tsx`, `.js` and `.mjs` for extensionless imports, and tries `index.ts` for directories. In shell paths, `$CLAUDE_PROJECT_DIR` means the project root; another leading variable means the script's directory.

When a registry has `runs.json`, ledger notes report stacks without a sandbox pass (`ledger-unproven`), changes since the latest pass for each preset/agent key (`ledger-changed`), and latest failed or partial runs (`ledger-failed`). Only default compositions (`with: []`) count. Infrastructure outcomes do not report failure; newer records are skipped. A malformed ledger or invalid v1 record is `ledger-schema`, an error that skips the ledger notes. A missing ledger is normal.

Every stack's base composition must verify each layer: `install`, `lint`, `typecheck` and `test`, plus a `serve` step with a probe when the stack is tagged `web` or `api`.

Word budgets, counted with every conditional branch in a body and, for a composed brief, the CLI's own text included (reported separately as fixed text). Every composed brief is rendered on one fixed context (no missing tools, a fresh repository, the `npx` invocation) so the counts are the same on every machine:

| Subject | Limit (words) |
| --- | --- |
| Stack body | 2,000 |
| Fragment body | 1,000 |
| App body (`category: app`) | 3,000 |
| Composed brief | 6,000 |
| Composed brief with an app | 9,000 |

Findings are errors, warnings or notes. Exit 0 when there are no errors; exit 2 (`ValidationFailed`) with the full report still on stdout and `Validation failed.` (with `--json`, the error envelope, whose `details` carry the counts) as the last stderr line. A path that is neither a registry root nor an entry under `stacks/` or `fragments/` is `NotFound` (2); an unreadable root is exit 6. Warnings don't change the exit, but the bundled registry is held to zero.

`show <id>` reviews a stack or fragment without starting a process: metadata, every guidance branch, commands, verify steps and shipped output paths, including adapters for every agent. `--json` returns `ShowReport`. Only bundled entries receive ledger evidence; `sameContent` compares the current composition fingerprint with the recorded run. Non-bundled entries get `lastRun: null`.

`--brief <stack>` prints only the canonical composed brief to stdout. Word count, fixed-text count and limit go to stderr in human mode; agent stderr stays empty on success. `--json` returns `BriefPreview`, including its fingerprint and findings for the selected entries. Error findings exit 2 with `ValidationFailed` and keep the brief on stdout. Preview uses only the first configured agent (default `claude`), ignores `always`, and starts no processes. `--with` and `--without` take ids (repeatable or comma-separated); they and `--sandbox` work only with `--brief`.

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

The development wrapper sets info logging, appends `logs/cli.jsonl` (the info records land there whoever reads the output; on stderr only for a human), copies noninteractive stderr to `logs/cli.log`, and uses `.dev/data` and `.dev/state`. Logs rotate above 5 MiB. It forwards arguments, terminal behavior, signals and the child's exit status. `.env` is optional for source development. The standalone build disables dotenv, bunfig, tsconfig and package autoload, following the [Bun compile API](https://bun.sh/docs/bundler/executables).

## Output contract

Output has three audiences, picked once per invocation. `--json` is the machine contract below. Without it, the output is for a human only when stdout is a terminal and no coding agent is detected (`CLAUDECODE`, `AI_AGENT` and the other markers in `src/config.ts`); everything else (an agent's shell, a pipe, CI) gets agent output, the default. The two text renderings carry the same result with the same exit code and files; agent output leaves out what an agent doesn't need:

- no log lines on stderr (they go only to `QUICKSTACKS_LOG_FILE` when it is set), so stderr is the failure message and its detail lines;
- paths in a command's result text printed relative to the working directory when inside it, absolute otherwise; paths in error details (`Path:`, `Looked for:`) stay absolute for now, and `--json` keeps every path absolute;
- `new`: no written-file listing (the brief lists the files), no absolute `Project:` line, and no `For example:` command after a printed prompt (it repeats the prompt);
- `verify`: no rows for passed steps (the summary counts them) and none on a `changed` run, where every step is skipped for the same reason and the error lists the change; failed and skipped rows, output tails and the `Next:` line stay, and the per-command progress lines are human-only;
- the guide: a human first gets one line saying it is written for agents and how to start a project yourself;
- `validate`: only the size rows over their limit (a human sees the whole table; `--json` keeps every size);
- `list`: each description on one line, not wrapped.

Stdout contains results only. `--json` emits one result object; JSON version is `{ "version": "0.1.0" }` and JSON help is `{ "help": "..." }`. Failures leave stdout empty and stderr contains a safe diagnostic, or exactly one JSON `{ "error": { "tag", "message", "retryable", "details"? } }` object as the last stderr line. `details`, when present, is a closed per-tag object (for example `{ "command", "suggestions" }` for an unknown subcommand). Two exceptions keep stdout: a failure that carries a report (`VerifyFailed`, `VerifyChanged`, `ValidationFailed`) writes that report to stdout before the error, and a command that hands the terminal to another program writes its output so far before doing so, which stays on stdout if it later fails. In JSON and agent output ancillary logs go only to the optional log file, so stderr stays parseable and short; set `QUICKSTACKS_LOG_FILE`, or rerun at a terminal, to see why a `Defect` happened. A `--json` after `--` belongs to the command, not to quickstacks. Human output emits logs to stderr and optionally to the same JSONL file. No streaming command exists in this base.

Exit codes: usage/bad-input/not-found 2, and validation failed 2 (the validate report stays on stdout); config 3; upstream 4; verify failed or changed 5 (the verify report stays on stdout); permission 6; interruption 130; defect 1. After `new` launches an agent, the exit is that agent's own status (128 plus the signal number if a signal killed it), outside this table. Scripts that expect 1 for every failure get these specific codes instead. A closed stdout pipe exits quietly with 0, except after a failure that keeps its report, which keeps its exit (2 for validate, 5 for verify). Defects never become success.

Signals: Ctrl+C (SIGINT), SIGTERM or SIGHUP stops the command after its cleanup, with exit 130, and the processes it started are killed. A second Ctrl+C within a second of the first is treated as the same keypress (a wrapper such as `bun run dev` or `npx` forwards a copy); one a second or more later exits at once, killing those processes without further cleanup. While quickstacks has handed the terminal to another program, Ctrl+C and SIGQUIT belong to that program, and SIGTERM and SIGHUP are passed on to it; once that program exits, quickstacks stops too, with exit 130.

## Development checks

`bun run check` runs Biome (including the boundary plugin), TypeScript, Vitest on Node, then the compiled binary checks under Bun. `bun run coverage` measures application code. Tests isolate HOME/XDG and clear credentials; compiled tests create their environment from scratch. No `.env`, credentials or external services are needed.

Commands here run from `packages/cli/`; the repo root has the same names fanned out to every package. See [AGENTS.md](../../AGENTS.md), [the harness guide](../../docs/harness.md), and [the installed Effect guide](../../.claude/skills/effect/SKILL.md). CI reads Bun from packageManager through [setup-bun](https://github.com/oven-sh/setup-bun).
