# Phase 1.0: Entry format and registry

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Define what a stack and a fragment are on disk (entry format v1, D18), define `AgentId` and `DetectedAgent`, load entries from the project, user and bundled origins with `origin` and `trusted` marks (D19), and ship `list` and `list --json` so an agent can pick a stack |
| Traces to | "It runs `list --json`, picks a stack, runs `new`" (Who has it, the coding agent); job 5, "I want a target I can verify against"; What this is not, "`files/` holds only what is the same across versions; everything else is prose" |
| Depends on | [0.3a](phase-0.3a-errors-and-output.md) (the error table, closed `details`, and `Host.stdoutIsTTY` for the human layout). Soft: [0.2](phase-0.2-npm-distribution-artifact.md) for the bundled registry path at runtime (`Host.registry`); until 0.2 lands, 1.0 reads a stub path that tests override |
| Blocks | [1.1](phase-1.1-composition-and-brief.md), and through it the rest of phase 1. Stack prose for [1.6a](phase-1.6a-bundled-stack-content.md) can be drafted once D18 is agreed |
| Decisions needed | D18 (entry format v1, proposed by this file). If the maintainers change the format, this file's schema changes before 1.1 starts, and 1.6a waits for the new version. D19 (project entries untrusted). If D19 is declined, project entries with a new id become trusted: one line in the trust computation and acceptance test 5 flip, nothing else changes. D6 only changes which entries ship (1.6a) |
| Settles | Frontmatter schema v1, `AgentId` and `DetectedAgent`; origin order; where the user directory lives; the dotfile escape rule for `files/`; the `yaml` dependency; the `list --json` shape |

## Scope

In:

- The entry layout and the dotfile escape rule (roadmap, Other shared facts: Entry
  directories).
- Frontmatter schema v1 for both kinds (D18), decoded with Effect Schema, excess
  properties rejected, including `VerifyStep`, `Probe`, `Check`, `AgentId` and
  `DetectedAgent`.
- Splitting a markdown file into frontmatter and body. No markdown parsing beyond that.
- Loading entries from three origins: project, user, bundled, with `origin`, `trusted`
  and `shadows` on every `Entry`, and `RejectedEntry` for one that failed to decode.
- `quickstacks list [stacks|fragments] [--json]`.
- A fixture registry under `packages/cli/tests/fixtures/registry/` used by this and later
  sub-phases.

Out:

- Composition, conditional prose and the brief (1.1). Running verify steps (1.3a).
- The trust store and `quickstacks trust`, which make a project entry trusted (3.2a).
  1.0 marks every project entry untrusted; see "Trust marks" below.
- `show` (3.1a). Git sources (3.2a). The remote index (4.0d).
- `lastRun` data in `list` beyond a `null` placeholder; the run ledger
  ([2.0c](phase-2.0c-run-ledger.md)) fills it.
- Real bundled stack content (1.6a). 1.0 ships the fixture registry only, and
  `packages/cli/registry/` stays empty (roadmap, Other shared facts: Bundled registry in
  the repo).

## Design

### Entry layout

The layout and the escape rule are the roadmap contract (Other shared facts: Entry
directories). This file owns them:

```
<origin root>/
  stacks/<id>/
    STACK.md            required
    files/              optional, copied into the project for every agent
    adapters/<agent>/   optional, copied only when <agent> is a target
  fragments/<id>/
    FRAGMENT.md
    files/
    adapters/<agent>/
```

`<agent>` is an `AgentId` (below). AGENTS.md is the instruction file for every agent, so
an agent with no adapter directory still gets full guidance.

An entry directory must not contain symlinks anywhere. Reading one that does gives a
`RejectedEntry` in `list` and `EntryInvalid` (reason `symlink`) from `get` and `files`.
This keeps `new` from writing outside the project through a link an entry shipped.

### Dotfiles in `files/` and `adapters/`

npm leaves some dotfiles out of a published package (`.gitignore` among them, and the
agent-ops fragment ships one), so a bundled entry that stored `.gitignore` literally
would lose it in the tarball with no error. The rule, in every origin:

- Any path segment under `files/` or `adapters/<agent>/` that starts with `_dot_` maps to
  `.` plus the rest of the segment. `files/_dot_gitignore` is written as `.gitignore`;
  `files/_dot_github/workflows/ci.yml` as `.github/workflows/ci.yml`;
  `_dot_env.example.tmpl` is the template for `.env.example`.
- A path segment that starts with a literal `.` is rejected: `RejectedEntry` in `list`,
  `EntryInvalid` (reason `dotfile`, with the entry-relative path) from `files`.

One rule for every origin, not only bundled, so an entry behaves the same wherever it
lives and moving a user entry into the bundled registry can't lose a file. The mapping is
`src/core/registry/dotfiles.ts::unescapeEntryPath`. `Registry.files` returns each file
with both names (`source`, the escaped path on disk, and `path`, the unescaped output
path), so 1.1 plans ownership and merges on output paths and 1.2a writes to them. A file
whose real name starts with `_dot_` can't be shipped; no known tool needs one.

### Frontmatter schema v1 (D18)

The schema symbols are the roadmap contract (Types and schemas: Entry format v1), in
`src/schemas/entry.ts`. The versioning rule is the roadmap's Schema versions table (Entry
frontmatter row): this file implements it and doesn't restate it.

Fields shared by both kinds:

| Field | Type | Rule |
|---|---|---|
| `schemaVersion` | literal `1` | See Schema versions |
| `id` | kebab-case string | Must equal the directory name, so two entries of one kind in one origin can't share an id. Ids are unique per kind: a stack and a fragment may share an id (roadmap, Contracts: Entry and its listing) |
| `kind` | `"stack" \| "fragment"` | Must match the file name |
| `name` | string | Human title |
| `description` | string, one sentence | What an agent reads from `list --json` to choose. Say what the project is for |
| `tags` | string[] | Runtime (`bun`, `node`, `go`, `python`), shape (`web`, `cli`, `api`, `monorepo`), entry style (`make` or `scripts`, exactly one on a stack) |
| `deps` | record of role to package names | Names only. A value that looks like a version (`@1.2`, `^`, `~`, `>=`) is rejected by `validate` (1.5) |
| `tools` | string[] | CLIs the agent needs on PATH (`uv`, `bun`, `go`, `make`) |
| `decisions` | string[] | Each states its default: "Package manager for the frontend (default: bun)" |
| `env` | record of string to string | Defaults copied to the manifest and passed to verify, used for ports (`PORT_WEB: "5173"`) |
| `commands` | record of name to one-line purpose | The project commands this entry adds or redefines |
| `verify` | `VerifyStep[]` | See below |
| `merge` | string[] | Output paths (unescaped) this entry writes that are JSON and may be deep-merged with other writers |

Stack only: `fragments: { required: string[], default: string[], optional: string[] }`.

Fragment only: `category` (`agent-ops`, `ci`, `deploy`, `release`, `service`, `vendor`,
`tooling`), `appliesTo` (stack ids or tags; empty means anywhere), `requires`,
`conflicts`, `requiresTools`, `needsOwnRepo` (boolean, default false).

Frontmatter keys are camelCase to match the manifest and the JSON output. YAML authors
see the same names they see in `list --json`.

### `AgentId`

`src/schemas/entry.ts::AgentId` is the roadmap contract (Types and schemas: Agent ids).
It lives here because the entry format names adapter directories by it, and 1.1
(`ComposeOptions.agents`, `Settings.agents`), 1.2b (the manifest, detection) and 1.4
(handoff) all import it from this file. No other file declares the set.

`src/schemas/entry.ts::DetectedAgent` is `AgentId | "other" | "none"`, declared next to
it: the agent the CLI is running under, where `"other"` is a generic marker that names
no known agent and `"none"` means no marker. It is the one type for `AppConfig.agent`
(1.2b), `RunRecord.agent` (1.3b), `HandoffDecision` (1.4) and `LastRun.agent` (4.0c).
1.0 declares it so all four import one schema; nothing in 1.0 detects an agent.

### Verify step schema

Part of the entry format; 1.3a runs it. `VerifyStep.timeout`, the single-key `check` and
the `within` pattern are contract rules (Entry format v1); this is how they look in the
schema:

```ts
const Phase = Schema.Literals(["setup", "check", "serve", "teardown"])
const Layer = Schema.Literals(["install", "lint", "typecheck", "test", "build", "serve", "docs"])
const Duration = Schema.String.check(Schema.isPattern(/^\d+(ms|s|m)$/)) // "500ms", "90s", "10m"

const Probe = Schema.Struct({
  url: Schema.String,                      // may contain ${VAR} from env
  within: Schema.optional(Duration),       // default "60s"
})

// Single-key form: `check: { filled: README.md }` or `check: { exists: src/main.go }`.
// Each member rejects excess keys, so `{ filled: a, exists: b }` fails decode.
const Check = Schema.Union([
  Schema.Struct({ filled: Schema.String }), // exists, non-empty, no quickstacks:fill marker
  Schema.Struct({ exists: Schema.String }),
])

const VerifyStep = Schema.Struct({
  name: Kebab,
  phase: Schema.optional(Phase),           // default "check"
  layer: Schema.optional(Layer),           // what D7 counts; 1.5 checks coverage
  run: Schema.optional(Schema.String),     // a project command, run through the shell
  check: Schema.optional(Check),           // evaluated by the CLI, no shell
  cwd: Schema.optional(Schema.String),     // relative, must stay inside the project
  tags: Schema.optional(Schema.Array(Schema.String)), // "prod" is skipped under --sandbox
  probe: Schema.optional(Probe),           // required when phase is "serve"
  timeout: Schema.optional(Duration),      // default "10m"; 1.3a reports failureKind "timeout"
})
```

Decided here, against the other option (a `kind` key): the single-key form reads
naturally in YAML (`check: { filled: README.md }`), needs no `_tag`, and the decoded value
is the same object the author wrote, so the manifest copies it unchanged and the step
digest (1.2b) sees what the author sees. Code narrows with `"filled" in check`.

`timeout` bounds the whole step, including a `serve` step's run (the probe has its own
`within`). Ten minutes covers a cold dependency install on a slow network; a step that
needs longer says so. Defaults (`phase: "check"`, `within: "60s"`, `timeout: "10m"`) are
applied by one function, `entry.ts::withStepDefaults`, which 1.2b's digest and 1.3a's
runner both call, so the digest and the runner never disagree about a default.

Cross-field rules are Schema filters on the struct, so a bad entry fails at decode with a
path to the offending step: exactly one of `run` or `check`; a `serve` step has `run` and
`probe`; `probe` only on `serve`.

The built-in `check` kinds exist so an entry never ships shell like
`test -s README.md && ! grep ...` just to check a file ([roadmap, Trust
model](../roadmap.md#trust-model), point 1).

### Body

Everything after the closing `---` is guidance prose for the building agent. 1.1 copies it
into the brief. Recommended stack sections: `## Layout`, `## Setup` (numbered, generators
named with their target directory, "non-interactively", no flags), `## Conventions`,
`## Tool configuration` (intent, never a pasted config file), `## Testing`, `## Commands`,
`## Gotchas` (by symptom and durable fix, never a version). These are guidance for
authors; 1.0 does not enforce headings.

### Origins and precedence

`Origin` is the roadmap contract (Types and schemas: Entry and its listing):
`"project" | "user" | "bundled"` here, extended by `"source"` (3.2a) and `"index"`
(4.0d).

| Origin | Root | Default trust | Notes |
|---|---|---|---|
| `project` | `./.quickstacks/` in `Host.cwd` | Untrusted ([Trust model](../roadmap.md#trust-model), point 2; D19) | A cloned repo can ship these |
| `user` | `$XDG_CONFIG_HOME/quickstacks/` (default `~/.config/quickstacks/`) | Trusted | The directory that holds `config.json`. The problem statement's `~/.stacks` |
| `bundled` | `packages/cli/registry/` in the repo, inside the npm package at runtime | Trusted | `Host.registry` from 0.2; never computed by core code |

Lookup by id walks project, user, bundled and returns the first hit. `list` shows each id
once, from the winning origin, with `shadows: ["bundled"]` when it hides another copy.

An entry that fails to decode in a higher origin is not silently replaced: `list` shows a
`RejectedEntry` with its error, and `get` (used by 1.1 and 1.2a) fails `EntryInvalid`. The
exception is `schemaVersion` above 1, which falls through to the next origin with one
warning (Schema versions), so an older CLI keeps working against a newer user directory.

### Trust marks

Every `Entry` carries `trusted`, computed by one function,
`registry.ts::trustOf(origin, entry)`. In 1.0 it returns `true` for `bundled` and `user`
and `false` for `project`, with or without shadowing. 3.2a makes `project` entries whose
content digest is in the trust store return `true` and adds `source`; 4.0d adds `index`.
1.0 does not read the trust store or define the entry content digest: both are 3.2a's,
and 1.0 must not invent a format 3.2a then has to migrate. What an untrusted entry can do
is [Trust model](../roadmap.md#trust-model), point 3; 1.1, 1.2a and 1.4 implement it.

### Services

`Entry`, `RejectedEntry` and `Origin` are the roadmap contract (Entry and its listing).

```ts
// src/core/registry/entry.ts
export type Entry = {
  id: string
  kind: "stack" | "fragment"
  origin: Origin
  dir: string                  // absolute
  trusted: boolean
  shadows: ReadonlyArray<Origin>
  meta: StackMeta | FragmentMeta
  body: string
}
export type RejectedEntry = {
  id: string                   // the directory name
  kind: "stack" | "fragment"
  origin: Origin
  dir: string
  error: string                // one line naming the field or rule
}
export type EntryFile = { source: string; path: string; mode: number } // see Dotfiles

// src/core/registry/registry.ts
export class Registry extends Context.Service<Registry, {
  readonly all: Effect.Effect<ReadonlyArray<Entry | RejectedEntry>, PermissionDenied>
  readonly get: (kind: Entry["kind"], id: string) =>
    Effect.Effect<Entry, NotFound | EntryInvalid>
  readonly files: (entry: Entry) =>
    Effect.Effect<ReadonlyArray<EntryFile>, EntryInvalid> // files/ and adapters/, relative
}>()("quickstacks/Registry") {
  static layer: (roots: RegistryRoots) => Layer.Layer<Registry, never, FileSystem | Path>
}
// ordered, highest precedence first; see roadmap, Contracts: Registry view
export type RegistryRoots = ReadonlyArray<{ origin: Origin; path: string }>
```

`Registry.layer` is built per invocation from `Host.cwd` (project root), `AppConfig.paths`
(user root) and `Host.registry`, in that order. Taking an ordered list rather than
three named fields lets 1.5 put the root it validates first, and lets 3.2a and 4.0d insert
their origins without changing the service. It reads lazily: `list` reads frontmatter only;
`files` walks a directory only when 1.1 asks. No cache crosses invocations (AGENTS.md: "No
globals/caches across runs").

`config.ts::Paths` gains `user: join(XDG_CONFIG_HOME, SLUG)`. Today `Paths.config` is the
path of `config.json` itself, so `user` is a separate field rather than a parent of it.
Doctor reports it.

### Frontmatter parsing

Split on a first line of exactly `---` and the next line of exactly `---`. Parse the YAML
between with the `yaml` package's `parse` in its default (YAML 1.2 core) mode, then decode
the unknown value with `Schema.decodeUnknownEffect(StackMeta, { onExcessProperty: "error" })`.

`yaml` is the one new runtime dependency (roadmap, Other shared facts: New dependencies).
Effect has no YAML reader, frontmatter is YAML by convention in every markdown tool authors
already use, and a hand-written YAML subset parser is the kind of custom code AGENTS.md
says to avoid. It goes in the root workspace catalog and `packages/cli/package.json`.

### `list`

```
quickstacks list                 # stacks, then fragments, human table
quickstacks list stacks --json   # one kind
quickstacks list --json          # everything
```

```ts
const ListResult = Schema.Struct({
  stacks: Schema.Array(Schema.Struct({
    id, name, description, tags,
    origin: Origin, trusted: Schema.Boolean, shadows: Schema.Array(Origin),
    valid: Schema.Literal(true),
    fragments: Schema.Struct({ required, default, optional }),
    tools: Schema.Array(Schema.String),
    lastRun: Schema.NullOr(Schema.Struct({ date: Schema.String, result: Schema.String })),
  })),
  fragments: Schema.Array(Schema.Struct({
    id, name, description, tags, category, appliesTo, requires, conflicts,
    origin, trusted, shadows, valid: Schema.Literal(true),
  })),
  rejected: Schema.Array(Schema.Struct({
    id, kind, origin, dir, valid: Schema.Literal(false), error: Schema.String,
  })),
})
```

Rejected entries get their own array so an agent iterating `stacks` never meets an entry
it can't use, and `valid` stays on every row so a reader that merges the arrays can still
tell them apart. `lastRun` is always `null` in 1.0; it is in the shape now so agents
written against the MVP don't break when 2.0c fills it. `briefWords` is not in `list`,
because it requires composing; it appears in `new --json` (1.2a) and `validate` (1.5).

The human view is grouped and ends with what to run next:

- A `Stacks` section, then a `Fragments` section with one sub-heading per `category` in
  the schema's order (`agent-ops`, `ci`, `deploy`, `release`, `service`, `vendor`,
  `tooling`); empty groups are left out. `list stacks` and `list fragments` print only
  their section.
- Each row is the id, then the origin (only when not bundled) and an `untrusted` marker,
  then the description on the following line, indented four spaces and word-wrapped at 80
  columns, or at the terminal width when `Host.stdoutIsTTY` is true and it is narrower.
  Words are never split; a single word longer than the width gets its own line.
- A final `Rejected` block with one line per rejected entry (id, origin, error).
- Then `Next:` lines with the exact commands to run, using `Host.invocation` (0.2; a fixed `quickstacks` until 0.2 lands) so a
  copy and paste works: `Next: <invocation> new <first-stack-id> <dir> --sandbox` and
  `Next: <invocation> list --json` (for an agent choosing). When there are no stacks, the
  only line is `Next: <invocation> doctor` (the registry path is wrong). `--json` has no
  `Next:` lines; the result shape is unchanged.

Output goes through
`services/output.ts::Output.result(value, human)`, the way
`commands/doctor.ts::doctorCommand` does it.

### Failure modes

| Situation | Error tag | Exit | What the agent sees |
|---|---|---|---|
| Unknown kind argument (`list widgets`) | `Usage` | 2 | Fixed usage message |
| User or project root unreadable | `PermissionDenied` | 6 | `{ error: { tag, message, retryable: false, details: { reason: "read", path } } }` (the details shape is 0.3a's; 1.0 adds the reason `read`) |
| An entry fails to decode, has a symlink, a literal dotfile, or an `id` that differs from its directory | none for `list` | 0 | A `rejected` row with a one-line `error` |
| `get` or `files` on any of the above | `EntryInvalid` | 2 | `details: { id, origin, reason, path? }` |

`EntryInvalid` is the roadmap's Error tags row; its `details` schema is
`{ id, origin, reason: "decode" | "symlink" | "dotfile" | "id_mismatch" | "conditional" |
"merge_json" | "merge_template" | "template", path?, line? }`. 1.0 adds the tag and the
first four reasons; 1.1 adds `conditional`, `merge_json` and `merge_template`; 1.2a adds
`template`. There is no duplicate-id reason: `id` must equal the directory name, so one
origin can't hold two entries of one kind with the same id.

### Settled here

| Question | Answer | Why |
|---|---|---|
| Frontmatter key style | camelCase | One spelling across YAML, manifest and JSON output |
| `check` form | Single-key (`check: { filled: README.md }`) | Natural YAML, no `_tag`, decoded value equals what the author wrote |
| Default step timeout | 10 minutes | Covers a cold install; a hung step can't hold verify forever |
| User directory | `$XDG_CONFIG_HOME/quickstacks/{stacks,fragments}/` | User-authored entries are configuration; they sit beside `config.json`, which the base already resolves |
| Project-local entries | `./.quickstacks/{stacks,fragments}/`, all untrusted (D19) | Same directory as project metadata; a clone can ship any id |
| Invalid higher-origin entry | Shown as rejected, not replaced, so a broken user or project copy hides a working bundled one until it is fixed or removed. The rejected row's `error` names the origin it hid (`hides bundled copy`) so the fix is obvious. [Open question 27](../risks-and-open-questions.md#open-questions-for-the-maintainers) asks the maintainers to confirm this over falling back | Silent fallback hides an author's mistake behind a bundled copy |
| Dotfiles | `_dot_` escape in every origin; literal dotfiles rejected | npm drops some dotfiles; one rule keeps entries portable between origins |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/schemas/entry.ts` | `AgentId`, `DetectedAgent`, `StackMeta`, `FragmentMeta`, `VerifyStep`, `Probe`, `Check`, `withStepDefaults` |
| `packages/cli/src/schemas/list.ts` | `ListResult` |
| `packages/cli/src/schemas/index.ts` | Exports |
| `packages/cli/src/core/registry/` | `entry.ts` (frontmatter split, decode, `Entry`, `RejectedEntry`), `dotfiles.ts` (`unescapeEntryPath`), `registry.ts` (service, layer, `trustOf`) |
| `packages/cli/src/commands/list.ts` | Thin handler |
| `packages/cli/src/cli.ts` | Add `listCommand` to the subcommand list |
| `packages/cli/src/config.ts` | `Paths.user` |
| `packages/cli/src/errors.ts` | `EntryInvalid` and its row |
| `packages/cli/tests/fixtures/registry/` | Two stacks, four fragments (one with `files/_dot_gitignore`), one invalid entry, one with a literal dotfile, one with `schemaVersion: 2` |
| `packages/cli/tests/list.test.ts`, `tests/registry.test.ts`, `tests/entry-schema.test.ts` | New |
| `packages/cli/tests/helpers/cli.ts` | `runCli` gains a `cwd` option for `Host.cwd` |
| `packages/cli/package.json`, root `package.json` catalog | `yaml` |

## Acceptance tests

All through `tests/helpers/cli.ts::runCli` with temporary HOME and XDG directories, using
the new `cwd` option to point `Host.cwd` at a temp project.

1. `list --json` with only the fixture bundled root returns both stacks and four
   fragments, every one `origin: "bundled"`, `trusted: true`, `lastRun: null`, and an
   empty `rejected`; exit 0; stderr empty.
2. A user-directory stack with a new id appears with `origin: "user"`, trusted.
3. A user-directory copy of a bundled id wins, with `shadows: ["bundled"]`, trusted.
4. A project-directory copy of a bundled id wins with `trusted: false`.
5. A project-directory entry with a new id appears with `origin: "project"`,
   `trusted: false` (D19).
6. Malformed frontmatter (unknown key, bad id, `id` different from the directory, missing
   `---`) gives a `rejected` row whose error names the field, and `list` still exits 0.
7. `schemaVersion: 2` in the user directory falls through to the bundled copy and logs
   one warning.
8. A symlink inside an entry rejects it; nothing outside the entry is read.
9. Decode failures: a `serve` step without `probe`; a step with both `run` and `check`;
   `check: { filled: a, exists: b }`; `within: "90"`; `timeout: "1h"`.
10. Decode successes: `check: { filled: README.md }`, `within: "500ms"`, `timeout: "15m"`;
    `withStepDefaults` fills `phase: "check"`, `timeout: "10m"` and a probe's
    `within: "60s"`.
11. `Registry.files` on the fixture fragment returns `{ source: "files/_dot_gitignore",
    path: ".gitignore" }`; an entry with a literal `files/.npmrc` is rejected with reason
    `dotfile`.
12. `list widgets` exits 2 with the usage envelope under `--json`.
12a. Human `list` over the fixtures prints `Stacks`, then `Fragments` with one heading per
    non-empty category in schema order; a 200-character description wraps at 80 columns
    with no line longer than 80 and no split word; the last lines are `Next:` lines whose
    commands start with the fixture `Host.invocation`; with an empty registry the only
    `Next:` line names `doctor`; `list --json` output contains no `Next:`.
12b. A user-directory copy of a bundled id that fails to decode is a `rejected` row whose
    error mentions the hidden bundled copy, and the bundled copy is not in `stacks`.
13. An unreadable user root (mode 000, skipped when running as root) exits 6 with
    `details: { reason: "read", path }`.
13a. A stack and a fragment with the same id both load and both appear in `list --json`.
14. A property test (`@effect/vitest`): for any generated valid frontmatter object,
    stringify with `yaml`, split, parse and decode returns the same object.
15. A property test: `unescapeEntryPath` maps every segment starting `_dot_` and leaves
    every other segment unchanged.

## Exit criteria

- All tests above pass; `bun run check` green from the repo root.
- `bun run dev list --json` against the fixture registry prints parseable JSON.
- `AGENTS.md` architecture map lists `src/core/registry/` and `src/schemas/entry.ts`;
  `packages/cli/README.md` documents `list`, the user directory and the dotfile escape.
- What was built matches the roadmap contracts this file owns (Entry and its listing,
  Entry format v1, Agent ids and `DetectedAgent`, Entry directories). A mismatch is reported to the
  maintainers, not fixed by editing another sub-phase.

## What this plan may get wrong

- The `effect/cli` argument API for an optional positional with a fixed set of values may
  push `list [stacks|fragments]` into two subcommands. Check the installed exports first.
- `Schema.Literals`, `Schema.isPattern` and struct-level filters are the Effect 4 names as
  far as this plan knows; confirm against the installed `effect` types, as the effect
  skill says.
- A `Union` of two single-key structs may give a poor decode message ("expected one of")
  for a typo like `check: { filed: x }`. If so, add a custom message on the union rather
  than switching forms.
- Rejecting literal dotfiles in the user directory will annoy authors who copy files from
  a real project. 3.1b's `create --from` writes escaped names; if hand authors hit it
  often, accept literal dotfiles outside the bundled origin and keep 1.5's check for
  bundled entries only.
- camelCase keys in YAML may annoy authors used to snake_case. Cheap to change now,
  expensive after 1.6a ships stacks.
- Reading only frontmatter for `list` assumes bodies are large enough to matter; if not,
  reading whole files is simpler.
