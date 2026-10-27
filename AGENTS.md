# quickstacks

## Overview

A bun workspace; every package is in `packages/<name>/`. `packages/cli` is `quickstacks`, the CLI: Effect 4 commands/services, doctor/version, lazy configuration, safe output and logs. Bun compiles the executable; Node 24 runs Vitest. There is no product code, vendor, release tooling or network requirement. `packages/api` (`@quickstacks/api`) and `packages/mcp` (`@quickstacks/mcp`) are placeholders with no code or scripts. Code two packages share goes in its own package, never imported across another package's `src/`. How the monorepo works and how to add a package: README.md, "Monorepo".

The root owns the harness: `.claude/`, lefthook, CI, the root `biome.json`, `tsconfig.base.json`, and the root test suite in `tests/`: the hook tests in `tests/hooks/`, the delegate runner's in `tests/scripts/` and the check in `tests/acceptance/` that traces each plan's acceptance tests to tagged CLI tests. Each package owns its source, tests, `tsconfig.json` (extending `../../tsconfig.base.json`) and any Biome plugins in a nested `biome.json` (`"root": false, "extends": "//"`). See docs/harness.md.

## Repository map

| Path | What it holds |
| --- | --- |
| `packages/cli/` | The CLI: `src/` (see "Architecture map"), `tests/` (Vitest on Node), `e2e/` (Bun, compiled binary), `registry/` (the bundled stacks, fragments and `runs.json` ledger), `skill/` (the agent skill), `docs/` (user docs: quick start, concepts, agents, architecture, the reference pages under `docs/reference/`, maintaining, and `authoring.md`, the one doc the binary ships), `scripts/` (build, bench, ledger import), `biome-plugins/` (Grit boundary rules) |
| `packages/api/`, `packages/mcp/` | Placeholders |
| `plans/` | `HANDOFF.md` (start here), `README.md` (conventions, decisions log), `roadmap.md` (phases, shared contracts table, error tags), `phases/` (one file per sub-phase), `runs/` (reviewed bench notes), `requirements.md`, `risks-and-open-questions.md` |
| `product/` | Problem statement, pitch, demo outline |
| `docs/harness.md` | Who owns which part of the harness |
| `tests/` | Root suite: `hooks/` (the `.claude/hooks` guards), `scripts/` (`delegate.sh`), `acceptance/` (plan-to-test trace) |
| `scripts/` | `delegate.sh` (runs a Codex delegate), `prepare.ts` (installs git hooks), `commit-msg.sh` |
| `.github/workflows/` | CI (see "CI") |
| `.claude/` | The agent harness, shared by Claude Code and Codex (below) |
| `.agents/skills` | A tracked symlink to `.claude/skills`, where Codex discovers repo skills; edit the files under `.claude/skills/` |
| `.codex/hooks.json` | Codex's hooks: the Claude command guard for its Bash tool |

`.claude/` holds the harness. `settings.json` wires the hooks in `hooks/` (command guards, boundary and secret guards, lint and typecheck on write, format on stop; `.claude/README.md` lists each), which run for Claude Code only. `rules/` holds path-scoped guidance Claude Code loads automatically: `architecture.md` and `agent-ops.md` always, `typescript.md` for TypeScript, `cli/` (`cli.md` the UX contract, `effect.md`, `testing.md`, `verification.md`) for `packages/cli`. Codex doesn't load `rules/`; read the ones covering the files you change, and a delegate contract names them. `skills/` holds `effect` (current Effect 4 APIs) and `delegate` (the orchestrator's Codex workflow, with its contract templates). `agents/` holds `architect.md` (design review) and `code-reviewer.md` (the one code review of a diff, run by Claude Code as an agent and by Codex delegates as a prompt). `commands/` holds the slash commands `/check`, `/test`, `/feature` and `/execute:codex`. `settings.local.json` and `worktrees/` are gitignored; delegate and unit worktrees live under `.claude/worktrees/`.

## Planning

Product planning lives in `plans/`; start with [plans/HANDOFF.md](plans/HANDOFF.md), then [product/PROBLEM_STATEMENT.md](product/PROBLEM_STATEMENT.md) and [plans/README.md](plans/README.md). Settled decisions live only in the plans README decisions log; proposals stay in `plans/requirements.md` until the maintainers agree them. Keep each plan file's `Status:` line current and update HANDOFF.md at the end of a session.

## Commands

Root commands run from the repo root and fan out to every workspace package (`bun run --filter '*' <script>`); preserve the runner split. In a clone opted in to rr, an agent runs the whole-suite scripts (`check`, `test`, `test:hooks`, `test:unit` without a file, `coverage`, `e2e`) through rr instead, and the command guard denies them locally ("Test runs" below).

| Command (repo root) | Purpose |
| --- | --- |
| `bun install` | Install every package's dependencies and the lefthook hooks |
| `bun run install:ci` | Frozen dependency install |
| `bun run dev doctor` | The CLI's source doctor with local logs/data (unprefixed output, so `--json` stays parseable) |
| `bun run dev doctor --json` | Machine-readable source doctor |
| `bun run dev create stack\|fragment <id> [--from bundled\|project] [--category ..] [--yes] [--json]` | Write a personal skeleton or working copy into the user registry; preserve existing targets. Untrusted copies require a person with terminal stdin, even with `--yes` |
| `bun run dev add <fragment...> [--dir <path>]` | Apply fragments without overwriting live files; park conflicts under `.quickstacks/incoming/` and write an add brief. An existing manifest is tamper-checked first; no verify step or tool is run |
| `bun run dev show <id> [--kind stack|fragment] [--json]` | Review entry metadata, full guidance, shipped files and bundled run evidence without starting a process |
| `bun run dev validate [path]` | Check a registry or one entry (no path: the bundled one). Exit 0 clean, 2 on any error finding (`ValidationFailed`, report kept on stdout) or a bad path, 6 unreadable root. `--brief <stack> [--with ..] [--without ..] [--sandbox]` prints the canonical composed brief; JSON includes findings and fingerprint. Errors retain the brief on stdout; agent mode prints only the brief, without word counts; size counts go to human stderr only. A relative path resolves against the directory you ran it from |
| `bun run dev runs [--json]` | Summarize the nearest project’s own verify history, trusted state timings and NOTES Asked count; exit 2 outside a project |
| `bun run dev verify [--only ..] [--skip-tag ..] [--all] [--accept-changes]` | Run the nearest project's manifest steps from the directory you ran it in. Exit 0 green or partial, 5 on a failed step (`VerifyFailed`) or changed steps (`VerifyChanged`, nothing run), both with the result kept on stdout, 2 outside a project, 3 bad manifest or a newer state record, 6 `--accept-changes` under an agent or without a TTY on stdin, 130 interrupted (teardown still ran) |
| `bun run build` | Build every package (the CLI compiles `packages/cli/dist/quickstacks`) |
| `bun run typecheck` | Root harness tsc, then each package's |
| `bun run lint` | Biome over the whole repo, with each package's nested plugins |
| `bun run format` | Safe fixes and formatting |
| `bun run test` | Root tests (hooks and acceptance trace), then each package's tests |
| `bun run test:hooks` | Root tests only: `tests/hooks/`, `tests/scripts/` and `tests/acceptance/` (Vitest on Node) |
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
| `bun run human -- <args>` | The compiled binary in human mode (pseudo-terminal, agent markers removed); `new` and `add` need `--no-launch` |
| `./dist/quickstacks --version` | Bundled version |
| `./dist/quickstacks doctor --json` | Compiled local diagnostics |
| `bun run check` | This package's gate only |

## Test runs

Several agents and delegates often work at once, and parallel gates on one laptop starve each other into timeouts. A clone that has test hosts runs the full gate and whole test suites through [rr](https://github.com/rileyhilliard/rr): `.rr.yaml` runs the task on the first free host (the dev machine in place, or a synced remote) under a per-host lock, so concurrent runs queue. All worktrees share one remote copy per host.

rr is opt-in per clone and off by default: `git config quickstacks.rr true` turns it on (stored in the clone's `.git/config`, so every worktree of the clone shares it and nothing is committed), and `git config --unset quickstacks.rr` turns it off. Check with `git config --get quickstacks.rr`. Opted in, the command guard denies local whole-suite runs and names the rr task; opted out, run the `bun run` commands above. "The gate" in contracts and skills means `rr check` in an opted-in clone and `bun run check` otherwise.

| Command (repo root) | Runs |
| --- | --- |
| `rr check` | The full gate, partitioned across the hosts (about 30 s) |
| `rr check-serial` | The full gate in order on one host (`bun run check`, as CI runs it) |
| `rr test` | Root tests, then every package's tests |
| `rr test-cli tests/<file>.test.ts` | CLI Vitest tests, optionally narrowed (`rr test-cli -- -t "<name>"`) |
| `rr test-hooks` | Root tests only |
| `rr e2e` | Compile and run the binary e2e tests |

Output is rr's JSON phase events on stderr, then the command's own output, then a `result` event whose `details.summary` has the test counts and `details.log_file` the full log; the exit code is the command's. `rr check` prints nothing on stdout: its `result` event lists `passed`/`total` partitions, each failed partition's host, `log_file` and parsed failures, and `details.log_dir`, which holds one log per partition. Read the counts as `.claude/rules/cli/verification.md` asks. rr needs its hosts in `~/.rr/config.yaml` and a reachable SSH agent. If `rr` isn't installed, or it fails before running the command (exit 1 with an error envelope such as `SSH_AUTH_FAILED` or `HOST_NOT_FOUND`), say so and run the same `bun run` command locally; never report a local run as an rr run. A single scoped test file, lint and typecheck are cheap enough to run locally.

In Claude Code, the session-start hook exports macOS's own ssh-agent socket for an opted-in clone, because the Bash sandbox can't reach every agent socket a session inherits; rr then runs inside the sandbox. A session started before opting in picks it up on its next start or `/clear`.

## Architecture map (packages/cli)

Paths below are relative to `packages/cli/`.

- `src/bin.ts`: Bun/platform/Host/writer boundary, the per-invocation `Foreground` holder, signal policy wiring and exit status.
- `src/main.ts`: one invocation, framework Console capture, safe outcome and logging.
- `src/cli.ts`, `commands/doctor.ts`, `commands/guide.ts`, `commands/list.ts`, `commands/new.ts`, `commands/add.ts`, `commands/validate.ts`, `commands/verify.ts`, `commands/skill.ts`: real Effect command tree and thin handlers. `commands/runs.ts` reports project run history. `commands/schema.ts` prints the JSON Schema of each `--json` result, the error envelope and verify's events, from `core/result-schemas.ts::RESULT_SCHEMAS` (`jsonSchema`). `commands/root.ts::root` is the root with its shared `--json` flag, which a handler reads with `yield* root`; the root with no subcommand prints the agent guide.
- `src/commands/handoff.ts`: `projectFlags`, `prepareHandoff` and `completeHandoff` own the shared flag parsing, handoff preferences, result presentation and interactive launch flow for `new` and `add`; previews force a printed plan.
- `src/project-layout.ts`: the one owner of `.quickstacks/` paths and starter metadata text, imported by writers, readers, schemas and reports.
- `src/core/handoff.ts`: `decideHandoff` (pure: `inside-agent`, `launch` or `print`, first matching rule wins; an untrusted entry never reaches `launch`), `agentPrompt`, `LAUNCH_ARGS` (per-agent binary and arguments), `renderHandoff`. `new` decides before writing, records the manifest's `handoff`, and for `launch` flushes its summary and runs the agent through `Processes.interactive`. `src/core/guide.ts`: the agent guide text (`guideText`, also `quickstacks guide`), `guideCommands` and the root `--help` footer (`helpFooter`, appended by `main`).
- `src/core/doctor.ts`: platform-free diagnostic program. Reports both bundled asset directories from Host.
- `src/core/skill.ts`: `SKILL_WORDS` (600), `installSkill` (bundled text, user/project targets, compare and safe write); `src/schemas/skill.ts::SkillResult` is the install result. `skill/SKILL.md` is the fixed agent skill, resolved by bin as `Host.skill` beside the registry. `plugin/` is the Claude Code plugin carrying a committed copy of it (`packages/cli/docs/maintaining.md`, "Publishing the Claude Code plugin").
- `src/core/registry/`: `entry.ts` (frontmatter split and decode, `Entry`, `RejectedEntry`, `EntryFile`, `entryRef`, `isStack`, `isFragment`) and `registry.ts` (the `Registry` service over ordered `RegistryRoots`, `trustOf`, `defaultRoots`); `core/list.ts` builds the `list` result and computes `projectChoices`; `core/list-report.ts` owns the catalog and addable-fragment text views.
- `src/core/compose/`: `compose.ts` (the public composition contracts, `compose`, step/env/decision aggregation, `missingTools` and `dropFlags`), `selection.ts` (fragment selection, dependency ordering and `fitsStack`), `plan-files.ts` (file writers, reserved-path and collision checks and JSON merge planning), `conflicts.ts` (composition conflicts and their parties), `files.ts` (`composeFiles`: the one renderer for every planned file, with ordered owners and executable flags; `composeFilesWithNeutral` renders project and neutral values from one source snapshot; `NEUTRAL_VARS` fixes template values for fingerprints and checks), `conditionals.ts` (`quickstacks:when` blocks), `merge.ts` (`deepMerge`), `agents.ts` (`targetAgents`), `tools.ts` (`missingToolsOnPath`, the shared lookup without executing tools).
- `src/core/create.ts`: `createEntry` writes a skeleton or a whole copy through `openProject` in exclusive mode; `Registry.tree` owns source traversal. `src/core/create-text.ts` owns the skeleton text; `src/schemas/create.ts::CreateResult` returns absolute entry and authoring-guide paths. Untrusted copies show the full `showReport` before a person confirms. `Settings.preset` defaults `new`; explicit `--preset` or `--sandbox` wins, then the setting, then default. Preview ignores the setting; add uses the manifest. `packages/cli/docs/authoring.md` is the shipped authoring guide.
- `src/core/show.ts`: `showReport` builds `ShowReport` using list metadata and ledger selection; `core/show-report.ts::renderShow` prints every guidance branch, command and shipped file. `commands/show.ts` owns parsing and presentation.
- `src/core/ledger.ts`: `readLedger` decodes the `Ledger` envelope then individual `LedgerRecord`s, returning newer/invalid counts; `latestRecord` matches stack, added fragments, preset and agent; `appendRecord` preserves raw skipped records and replaces the ledger atomically. `registry/runs.json` ships with the registry; `list` attaches its latest default-composition record only to bundled stacks. `scripts/ledger-import.ts` (`bun run ledger:import <notes>... [--dry-run]`) imports gate notes at their git commits through `Processes`, outside the shipped command tree; `scripts/ledger-note.ts::parseLedgerNote` owns parsing the gate-note format.
- `scripts/bench.ts` (`bun run bench <stack> [--agent claude|codex] [--no-record] [--keep]`) is the maintainer-only headless bench. It builds or takes `--cli`, installs the compiled dev binary with the working registry in a throwaway prefix, scaffolds, runs the adapter under a time limit, verifies independently and records through `appendRecord`. `scripts/bench/` owns preparation, adapters, execution, verification/classification and run notes. Claude uses `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`); Codex uses `CODEX_ACCESS_TOKEN` (`codex login --with-access-token`). Only the selected token reaches the agent. The fresh `HOME` is not a security boundary; these are full-permission local runs. Tests use fake agents and credentials only.
- `src/core/runs.ts`: `projectRuns` reads the nearest manifest, its history, trusted project state and notes into `ProjectRuns`; `countAsked` counts nonempty list items under `## Asked`. `commands/runs.ts` prints the summary.
- `src/core/fingerprint.ts`: `fingerprint`, a length-prefixed sha256 over composed entry kinds, ids, canonical decoded frontmatter and bodies, the preset and `composeFiles` with `NEUTRAL_VARS`. `fingerprintFromFiles` hashes an already neutral-rendered snapshot for scaffold. `new --json` and the manifest carry it; project settings and fixed CLI brief text are excluded.
- `src/core/brief/`: `render.ts` (`renderBrief`, pure over a `Composition`), `text.ts` (every fixed sentence of the brief), `words.ts` (`countWords`), `headings.ts` (`nest`), `paths.ts` (`collapsePaths`).
- `src/core/scaffold/`: `new.ts` (`scaffold`: compose, check the target, render entry files through `composeFiles`, compute the fingerprint, render the manifest, then write; `--dry-run` stops before the writer and forces a `print`/`no-launch` handoff; `--name` and `--author` override template values), `write.ts` (`openProject`: the only writer into a project; real-path escape check, `wx` writes, atomic `rewrite` with original bytes and permissions retained for rollback, rollback finalizer on failure or interrupt), `target.ts` (empty-target rule, OS litter, `TargetNotEmpty`'s `scaffold` detail from an existing manifest and its state record), `template.ts` (`.tmpl` tokenizer, fixed variables), `values.ts` (`templateOverrides`, `templateValues`: explicit values, settings, then git author fallback; one fixed-variable builder), `slug.ts`, `git.ts` (constant git commands through `Processes.run`, including `gitToplevel` for add's repository guard), `report.ts` (text output per audience).
- A scaffolded project holds `.quickstacks/`: `BRIEF.md`, `NOTES.md`, `state/` (verify's `runs.jsonl`; all ignored by its `.gitignore`), and `manifest.json` (committed). `new` writes the manifest after the rest of `.quickstacks/`, then the state record, then runs `git init`; rollback removes both. Entry files may not be planned under `.quickstacks/` or `.git/`.
- `src/core/validate/`: `validate` (`index.ts`: the check list over a `View` of one root, resolving through every origin), one module per check group (format, references, conditionals, files, git, compositions, content, shipped references, imports and ledger notes). `sources.ts` holds source text and locations; `composed.ts` renders each budgeted composition per adapter through `composeFiles` with `NEUTRAL_VARS`. `shipped-refs.ts` checks, per composed snapshot, that every file or command a shipped config names is composed or declared; `native-config.ts` parses and decodes each agent's config format (Codex TOML, Cursor and OpenCode JSON), and `native-refs.ts` checks the commands those configs run (`ref-toml`, `ref-json`, `ref-config` on a config it can't read). Imports may depend only on the same entry or the transitive `requires` closure (`fragments.required` for stacks), never default/optional fragments. Ledger notes compare each default-composition preset/agent key with its last pass through `readLedger`, `latestRecord` and `fingerprint`; invalid ledgers are errors, `budget.ts` (`BUDGET` in words: stack body 2,000, fragment 1,000, app 3,000, composed brief 6,000 or 9,000 with an app; `canonicalContext`), `target.ts`, `preview.ts` (`--brief`) and `report.ts`. Severities: error exits 2, warning fails only the bundled registry's zero-warning test (`tests/bundled-registry.test.ts`), note never fails.
- `src/core/verify/`: `run.ts` (`runVerify`: base then app, each in phase order; a base failure skips every app step with `base-failed`; setup stops at its first failure, every check runs, each started stage tears down in its finalizer, and the run's finalizer calls `onFinished`, so interrupted runs are recorded too), `plan.ts` (`planVerify`: order, `--only`/`--skip-tag`/`--all`, scope), `step.ts` (`runStep`: `cwd` real-path check, `Processes.run` with the step `timeout`, the `pipesHeld` note, exit 127 as `env`; serve steps through `Processes.start`, raced against the probe and `within`, then the port-closed check), `probe.ts` (`probeTarget`: `${VAR}` expansion and the local-host rule; `HttpClient` probe; `Tcp` port checks), `next.ts` (`verifyNext`, the next action per outcome, shared with the error envelope; `nextLine`, its text `Next:` line), `events.ts` (`stepStarted`, `stepFinished`: the live events through `Output.event`) and `report.ts` (text output per audience). A step's env is `childEnv(AGENT_MARKER_NAMES)` over the manifest's `env` defaults. `core/manifest.ts::locateManifest` walks up from `Host.cwd`. `tamper.ts` (`checkTamper`: D14 before any step, the manifest's digest then the state record by `projectId`, then by manifest real path; `acceptChanges` for `--accept-changes`, which the command refuses under an agent or without a TTY on stdin; `changedResult`) and `record.ts` (`recordRun`, through `onFinished`: one `RunRecord` line appended to `.quickstacks/state/runs.jsonl`, then `firstGreenAt`/`firstTestPassAt` in the state record; write failures are a warning).
- `src/services/`: Output buffers success output and resolves the invocation's audience (`json`, `agent` or `human`); Host supplies process facts; `invocation.ts::Invocation` (built fresh by `main`) carries a command's exit-status override and `command` log fields back to `main`; `net.ts::Tcp` opens TCP sockets for port checks; `processes.ts::Processes` runs child processes (`run`, `start`, `exec`, `interactive`, `which`) and `Foreground` holds this invocation's live process groups and interactive child.
- `src/platform/`: the only Node process code. `process.ts` spawns on `node:child_process` and signals/probes process groups; `signals.ts` is the A3 signal policy (`decide`, `installSignalPolicy`); `net.ts::NetLayer` supplies `HttpClient` (fetch, redirects not followed) and `Tcp`, provided by `bin.ts` and `tests/helpers/cli.ts`.
- `src/core/add.ts`: orchestrates `add/project.ts::readAddProject`, `add/prepare.ts::prepareAdd`, the pure `add/manifest.ts::mergeAddManifest` and `add/write.ts::applyAdd`. `add/plan.ts::planAdd` classifies absent, identical and conflicting files and carries their rendered bytes to the writer; `add.ts` re-exports it. `add/name.ts::inferName` reads project names as data; `add/report.ts::renderAdd` owns the summary. Existing files stay unchanged; `.quickstacks/incoming/` holds every pending merge. Untrusted additions under an agent or without terminal stdin keep the previous digest baseline until a person accepts.
- `src/core/manifest.ts`: `.quickstacks/manifest.json` (`buildManifest` from a `Composition`, `encodeManifest`, `readManifest`, `writeManifest`) and the tamper digests (`digestSteps`, `digestStep`, `digestSettings`: sha256 over sorted-key JSON, step defaults applied, `owner` excluded). `core/project-state.ts`: the out-of-project `ProjectState` record under `Paths.state` (`writeProjectState`, `removeProjectState` for rollback, `readProjectState`; `saveProjectState`, the atomic write; `replaceProjectState`, scoped replacement that restores old bytes unless the scope succeeds; `findProjectState` by id, `InvalidConfig` for a newer record, and `findProjectStateByPath` for the tamper check).
- `src/core/shell.ts`: `shellArg`, the shared shell-argument rendering for command hints, and `shellWords`, the literal tokenizer for static command references; neither executes commands.
- `src/core/shown-path.ts`: `shownPath`, a path as text output shows it (relative to the cwd when inside it, real paths compared too).
- `src/config.ts`: lazy per-invocation AppConfig; independent paths/log settings; agent detection (`AgentMarkers`, `AppConfig.agent`, `AGENT_MARKER_NAMES` for `childEnv`'s strip list).
- `src/errors.ts`, `logging.ts`, `runtime.ts`, `version.ts`: stable boundaries.
- `src/schemas/add.ts::AddResult` records new files, skips, parked merges, retained commands, warnings, name provenance, tamper/state/digest status and handoff.
- `src/schemas/`: config/report schemas and their types; `entry.ts` is entry format v1 (`StackMeta`, `FragmentMeta`, `VerifyStep`, `AgentId`, `DetectedAgent`, `withStepDefaults`), `list.ts` the `list --json` result, `new.ts` the `new --json` result (`NewResult`), `guide.ts` the guide's `--json` result (`GuideResult`), `manifest.ts` the project manifest (`Manifest`, `ManifestStep`, `EntryRef`; optional `name`, written by `new` and `add`, with inference for older manifests) and `verify.ts` the `verify --json` result (`VerifyResult`, `StepResult`, `FailureKind`, `VerifyChange`, `TamperCheck`) and the run record (`RunRecord`, `RunStep`).
- `tests/`, `e2e/`: Node programs/hook tests and Bun standalone binary tests.
- `scripts/`, `biome-plugins/`: lifecycle/build and enforced boundaries.
- Repo root: `.claude/`, `.github/`, `docs/`, `tests/hooks/`, `tests/acceptance/`: adapter, CI, harness guide, hook tests and the acceptance trace.

bin supplies platform, Host, Foreground and the stdout/stderr writers; AppLayer builds config, then Output over config and Host (its audience needs both), then logging and Processes, without opening config. main runs one scoped command. Doctor reads cached config and reports optional-file errors. Framework help is captured and flushed only on success; failures clear the output buffer.

## Conventions

Use namespaced Context.Service classes, static layer factories and fresh per-invocation state. No globals/caches across runs. Core uses Effect FileSystem/Path and remains unchanged under Node. Only bin/explicit adapters may use Bun; only `bin.ts` and `src/platform/` use Node process APIs (`process.kill`/`on`/`exit`, `node:child_process`, `@effect/platform-node`); everything else runs processes through `Processes`. Only config reads env: a child's whole environment comes from `AppConfig.childEnv` (nothing inherited), and `Processes.which` is the only PATH search, over the captured PATH. No direct console or stdout writes in application logic. Output has three audiences, resolved once per invocation by `services/output.ts::resolveAudience`: `json` with `--json`, `human` only when stdout is a terminal and `AppConfig.agent` is `"none"`, `agent` otherwise (the default: an agent's shell, a pipe, CI). Audiences never behave differently; commands only render by `Output.audience`, and agent text drops what an agent doesn't need (rules/cli/cli.md, "Three audiences"). Grit and adapter guards enforce platform/schema/env/output boundaries.

Strict TypeScript 7: unchecked indices, verbatim modules, erasable syntax, explicit Bun/Node types and no emit. Biome: two spaces, double quotes, width 100, recommended rules and explicit type imports/exports. Structure rules are errors: cognitive complexity at most 15 per function, no nested ternaries, at most four parameters (pass an options object); only the registry's shipped files are exempt. Split an over-limit function into named steps rather than suppressing the rule. Prefer current patterns and dependencies; keep changes scoped.

## Code structure

Lint catches size; these are the placement mistakes it can't, each found in review here, with the fix.

- A fallback beside a service field. A default path or value computed next to a `Host` or config field (from `import.meta.url`, say) hides a missing input and breaks in the compiled binary. Make the field required, set it in `bin.ts`, and give tests their value in `tests/helpers/cli.ts`.
- A shared helper left in its first user's module. When a second command needs a helper from `commands/new.ts`, move it to the module named for its concept (as `commands/handoff.ts` holds the flow `new` and `add` share), not an import from the other command.
- A growing `Effect.gen` body. A new case gets a named step (a function returning an Effect, or a small pure function) called from the body, not another branch inline. The body reads as the command's sequence of steps.
- Registry-wide work on a per-entry path. A command that needs one entry or composition reads and checks only that one; whole-registry passes belong to `validate` of a registry and to tests. Ask how the cost grows with the registry.
- Options nobody asked for. A parameter, flag or abstraction with one caller and no plan behind it is removed, not documented.
- A wide function signature. More than four parameters, or several of the same type in a row, becomes one options object with named fields.

## Schemas

`src/schemas/` contains Settings, DoctorReport, the entry frontmatter schemas and ListResult, each sharing its schema/type name. Decode unknown input at boundaries; encode reports for output. Config rejects excess properties. Use branded ids when adding domain ids, Schema.TaggedError for errors, and Schema.toJsonSchemaDocument with onExcessProperty:error for closed external JSON schemas. Keep framework validators; do not add @effect/schema or competing validators.

## Testing

`tests/helpers/cli.ts` invokes the real command tree with real NodeServices and injected Output/Host; no module mocks. Setup isolates HOME/XDG and clears credentials before app imports. Tests cover streams, parser failures, config laziness/caching, all error mappings, scope disposal, cancellation, EPIPE, logging and sink failures. Property tests use @effect/vitest; timers use TestClock. Hook tests execute actual helpers; all Grit rules are probed on real files.

Bun tests only `./e2e` after compiling. Binary tests spawn the artifact with an environment built from scratch, including hostile local dotenv/bunfig files to prove autoload is disabled. Never use unscoped bun test, --bun with Vitest, or weaken tests. A bug fix starts with a failing regression.

## Error handling

Fixed safe tagged messages; `errors.ts::errorTable` is the one exit/retryable/keepsResult table, and `errorClasses` lists every class (a test keeps the two equal). Adding a tag means its class, its row and its line in the roadmap's Error tags table. Expected usage/input/not-found exit 2, config 3, upstream 4, VerifyFailed/VerifyChanged 5 (read the verify report), permissions 6, interruption 130, defects 1; BrokenPipe is quiet 0. The one exit outside the table: after `new` launches an agent, the invocation exits with the agent's status (`Invocation.exitWith`, applied only when the command succeeded, so no envelope). `--json`, a detected agent, a non-terminal and any untrusted entry never launch. main observes failures/defects once and clears stdout on error, except for a keeps-result tag (VerifyFailed, VerifyChanged, ValidationFailed), whose buffered result is flushed to stdout before the envelope. BrokenPipe rule: a closed stdout or stderr while writing the result or envelope is quiet and exits 0, except after a keeps-result tag, which keeps its own exit. The outer runtime maps a pending interrupt after cleanup to 130. `SpawnFailed` (`kind`: cwd, shell, command, resources; `errno`) is internal and outside `AppError`, so it is a Defect unless the caller handles it; a missing command under `/bin/sh -c` is a normal exit 127. Logs never serialize arbitrary cause objects or secrets; a defect is logged as its class and stack frames, without its message. Defects are not retryable.

Signals (A3, `platform/signals.ts`): with no interactive child, SIGINT, SIGTERM and SIGHUP interrupt (finalizers run, exit 130). A second one within 1 s of the first is the same Ctrl+C delivered twice (terminal plus a forwarding wrapper) and is ignored; one 1 s or more later SIGKILLs every registered process group and exits 130 at once. SIGQUIT keeps its default action after the groups are SIGKILLed. While `Processes.interactive` runs a child, SIGINT and SIGQUIT are ignored (the terminal already gave them to the child) and SIGTERM and SIGHUP are forwarded to it. Process groups from `run`, `start` and `exec` get SIGTERM, 5 s, then SIGKILL on interruption, timeout or scope close; `run` and `exec` drain output for 2 s after exit before killing the group (`Finished.pipesHeld`). A SIGINT within 1 s of one left to the interactive child is still that child's Ctrl+C (a wrapper's late copy), and a SIGTERM or SIGHUP forwarded to the child stops the CLI with 130 once the child exits. Process groups leave the `Foreground` registry once seen gone and only registered groups are signaled. A closing scope sends SIGTERM to all of its groups at once, so they share one grace period. A `process.on("exit")` handler SIGKILLs any group still registered.

A tag may carry an optional closed `details` struct (`Schema.optionalKey` on its TaggedError fields), holding only CLI-produced values or caller arguments. Construction drops keys the schema doesn't name; `Output.error` encodes details per tag (`errors.ts::encodeDetails`) with `onExcessProperty: "error"`, so only a details object mutated after construction can reach the Defect path (exit 1). Details go only in the envelope, `{ error: { tag, message, retryable, next?, details? } }` (`errors.ts::ErrorEnvelope`, printed by `quickstacks schema error`); human and agent output print the message, then the lines `errors.ts::failureGuide` picks, indented, then `Next:` with the same text as the envelope's `next`. Every tag but BrokenPipe has a next action; a keeps-result tag's report carries its own `Next:` line, so text modes don't repeat it. Details never enter the message or a log record. An unknown subcommand is `Usage` with `details: { command, suggestions }` from `core/suggest.ts::closest`; effect/cli's own suggestions are discarded. A parser-rejected value is `Usage` with closed `details: { flag, value, expected, suggestions? }`: the caller's flag spelling and rejected value, the parser's expected text, and `closest` over `AgentId.literals` for agent values; text modes show the details and end with a `Next:` line. A keeps-result failure whose result couldn't be written (non-EPIPE) keeps its exit, and the command log record gets `result: "unwritten"` with the write error's tag.

JSON commands produce one result; JSON failures produce one stderr error envelope as the last stderr line. To preserve that contract, and to keep an agent's stderr to the failure itself, JSON-mode and agent-mode ancillary logs use only the configured JSONL file (none when `QUICKSTACKS_LOG_FILE` is unset). Only human mode writes log lines to stderr. `Output.progress` writes live lines to stderr in human mode only, swallows every write error and stops after the first. `Output.event` (D33) is the one exception to a quiet stderr: in JSON mode it writes one JSON line per event (verify's `step-started` and `step-finished`, `schemas/verify.ts::VerifyEvent`, `quickstacks schema verify-event`), in agent mode an optional short line (`> <step>` as each verify step starts), in human mode nothing; it shares `progress`'s write-error policy, and the envelope stays the last stderr line. `Output.flushNow` (human and agent modes) writes buffered results immediately; once it has run, stdout is no longer empty on a later failure in that invocation. No colors are currently emitted, respecting NO_COLOR and pipes. `Host.stdinIsTTY`/`stdoutIsTTY` come from bin.ts; core never reads the streams.

## Debugging

Read packages/cli/logs/cli.log and packages/cli/logs/cli.jsonl. Development data stays under packages/cli/.dev/data. Use LOG_LEVEL=debug for detail. The session hook reports Bun mismatch and only newly added warning/error lines. Shared session-start can advise about absent .env; this base intentionally works without it.

After two unsuccessful fixes with no new diagnostic, stop and investigate other hypotheses. Read errors before guessing; do not swallow defects or report success after failure.

## Git hooks

Install lefthook on PATH (e.g. brew install lefthook), then bun install. Pre-commit formats/checks staged code/config and restages safe fixes. Commit-msg requires Conventional Commits, allowing merge/revert/fixup/squash forms. Pre-push runs lint, typecheck and tests in parallel. Never bypass hooks with --no-verify.

## CI

.github/workflows/ci.yml runs a sequential `check` job on ubuntu-latest only (macOS runners cost too much) for main pushes, PRs and manual runs, then `ci-ok`, which passes only when it did; contents:read only. Tests whose meaningful branch is macOS-only carry `(macOS)` in their name; lefthook's pre-commit runs them on a Mac (`bun run test:macos` in `packages/cli`), and a test that can't pass on Linux is `test.runIf(process.platform === "darwin")`. Bun comes from packageManager, Node from .node-version. Frozen install, lint, typecheck, coverage, binary e2e; upload each package's logs/coverage on failure. Required check: ci-ok. Upgrade official action tags after checking upstream; SHA pins are deferred.

## Build workarounds

No patches, pinned prereleases or disabled rules. Every shared dependency version lives once, in the root `workspaces.catalog`; packages depend on `catalog:`. Effect packages resolve together at stable 4.0.6 with compatible 4.x ranges, Vitest/coverage 5.x. The generated type config targets current TypeScript 7. Bun compile disables all runtime config autoload and removes its linked sourcemap output intentionally.

The shipped dev wrapper was adapted to forward directly delivered SIGINT/SIGTERM/SIGHUP, with a reproducing subprocess test. Reassess/remove local adaptation when upstream provides equivalent signal forwarding. Biome stdin suppresses useful plugin diagnostics, so boundary tests use actual temporary files; no Grit rule was removed.

## Deferred

Application features, install/update distribution and release workflow (decision A1, open in `plans/`), and SHA-pinned CI actions.

## Delegates

Claude Code orchestrates; Codex takes the coding tasks Claude delegates (`scripts/delegate.sh`, workflow in `.claude/skills/delegate/SKILL.md`). A delegate is trusted like Claude Code and works in its own worktree from a contract file with full access (network, `bun add`, git, the whole gate). It leaves its changes uncommitted and doesn't push, because Claude reviews, refactors and commits them, and it keeps to the contract's scope. A dependency it adds keeps shared versions in the root `workspaces.catalog`. Of the Claude hooks, only the command guard runs for a delegate (`.codex/hooks.json` wires `.claude/hooks/guard-commands.ts` for Codex's Bash tool; Codex reads it from the main checkout, so it lands there before it applies). The lint, typecheck and boundary hooks don't, so a delegate runs the contract's checks itself (`bun run lint`, `bun run typecheck`, the named tests and the gate, "Test runs") and reports each result; Claude reviews, refactors and commits. `.claude/rules/` is Claude's: a contract names the rule files that apply to the task. Before handing back, a delegate runs one review in a fresh Codex process with `.claude/agents/code-reviewer.md` as its prompt.

## Pending user actions

None.

## Deeper context

README.md for usage/configuration; docs/harness.md for adapter ownership; .claude/README.md for installed hooks/commands; .claude/rules/architecture.md for product and contract constraints on any design; .claude/skills/effect/SKILL.md for current APIs.
