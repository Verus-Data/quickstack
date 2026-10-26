# Phase 1.0: Entry format and registry

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Define what a stack and a fragment are on disk, load them from the project, user and bundled origins with trust marks, and ship `list` and `list --json` so an agent can pick a stack |
| Traces to | "It runs `list --json`, picks a stack, runs `new`" (Who has it, the coding agent); job 5, "I want a target I can verify against"; What this is not, "`files/` holds only what is the same across versions; everything else is prose" |
| Depends on | [0.3](phase-0.3-command-runtime.md) (structured error details), [0.2](phase-0.2-npm-distribution-artifact.md) for the bundled registry path at runtime (1.0 can start with a stub path and a test override) |
| Blocks | [1.1](phase-1.1-composition-and-brief.md), and through it everything else in phase 1. Stack prose for [1.6](phase-1.6-bundled-stacks-and-mvp-gate.md) can be drafted once this file's format is agreed |
| Decisions needed | None to start. D6 (bundled audience) only changes which entries ship, which is 1.6's concern |
| Decisions or questions this settles | Entry frontmatter schema v1; origin order and the trust rule; where the user directory lives; the `yaml` dependency; the `list --json` shape |

## Scope

In:

- The entry layout: `stacks/<id>/STACK.md`, `fragments/<id>/FRAGMENT.md`, optional
  `files/` and `adapters/<agent>/`.
- Frontmatter schema v1 for both kinds, decoded with Effect Schema, excess properties
  rejected.
- Splitting a markdown file into frontmatter and body. No markdown parsing beyond that.
- Loading entries from three origins: project, user, bundled.
- Trust marks per entry.
- `quickstacks list [stacks|fragments] [--json]`.
- A fixture registry under `packages/cli/tests/fixtures/registry/` used by this and later
  sub-phases.

Out:

- Composition, conditional prose and the brief (1.1).
- `show` (3.1). Git sources (3.2). The remote index (4.0).
- `last_run` data in `list` beyond a `null` placeholder; 2.0 fills it.
- Any real bundled stack content (1.6). 1.0 ships the fixture registry only.

## Design

### Entry layout

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

`<agent>` is one of `claude`, `codex`, `opencode`, `cursor`. AGENTS.md is the instruction
file for every agent, so an agent with no adapter directory still gets full guidance.

An entry directory must not contain symlinks anywhere. Reading one that does fails with
`EntryInvalid` (reason `symlink`). This keeps `new` from writing outside the project
through a link an entry shipped.

### Frontmatter schema v1

Fields shared by both kinds:

| Field | Type | Rule |
|---|---|---|
| `schemaVersion` | literal `1` | An entry with a higher value is skipped with a warning, and the next origin's copy is used |
| `id` | kebab-case string | Must equal the directory name |
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
| `merge` | string[] | Output paths this entry writes that are JSON and may be deep-merged with other writers |

Stack only: `fragments: { required: string[], default: string[], optional: string[] }`.

Fragment only: `category` (`agent-ops`, `ci`, `deploy`, `release`, `service`, `vendor`,
`tooling`), `appliesTo` (stack ids or tags; empty means anywhere), `requires`,
`conflicts`, `requiresTools`, `needsOwnRepo` (boolean, default false).

Frontmatter keys are camelCase to match the manifest and the JSON output. YAML authors
see the same names they see in `list --json`.

### Verify step schema

Defined here because it is part of the entry format; 1.3 runs it.

```ts
const Phase = Schema.Literals(["setup", "check", "serve", "teardown"])
const Layer = Schema.Literals(["install", "lint", "typecheck", "test", "build", "serve", "docs"])

const Probe = Schema.Struct({
  url: Schema.String,                     // may contain ${VAR} from env
  within: Schema.optional(Schema.String), // "90s", "2m"; default "60s"
})

const Check = Schema.Union([
  Schema.TaggedStruct("filled", { path: Schema.String }), // exists, non-empty, no quickstacks:fill
  Schema.TaggedStruct("exists", { path: Schema.String }),
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
})
```

Exactly one of `run` or `check` is present; a `serve` step has `run` and `probe`. These
cross-field rules are Schema filters on the struct, so a bad entry fails at decode with
a path to the offending step.

The built-in `check` kinds exist so an entry never ships shell like
`test -s README.md && ! grep ...` just to check a file. That keeps entry-supplied shell to
calls of project commands (see the roadmap's trust boundary).

### Body

Everything after the closing `---` is guidance prose for the building agent. 1.1 copies it
into the brief. Recommended stack sections: `## Layout`, `## Setup` (numbered, generators
named with their target directory, "non-interactively", no flags), `## Conventions`,
`## Tool configuration` (intent, never a pasted config file), `## Testing`, `## Commands`,
`## Gotchas` (by symptom and durable fix, never a version). These are guidance for
authors; 1.0 does not enforce headings.

### Origins and precedence

| Origin | Root | Trusted | Notes |
|---|---|---|---|
| `project` | `./.quickstacks/` in the directory the command runs from | Yes, unless it shadows an id another origin also has | A cloned repo can ship these, which is why shadowing is untrusted |
| `user` | `$XDG_CONFIG_HOME/quickstacks/` (default `~/.config/quickstacks/`) | Yes | Same directory as `config.json`. The problem statement's `~/.stacks` |
| `bundled` | `packages/cli/registry/` in the repo, inside the npm package at runtime | Yes | Located by the platform entry and passed in, never computed by core code |

Lookup by id walks project, user, bundled and returns the first hit. `list` shows each id
once, from the winning origin, with `shadows: ["bundled"]` when it hides another copy.

An entry that fails to decode in a higher origin is not silently replaced: `list` shows
it with `valid: false` and its error, and `new` (1.2) refuses it with `EntryInvalid`. The
exception is `schemaVersion` greater than 1, which falls through to the next origin with
a warning, so an older CLI keeps working against a newer user directory.

### Services

```ts
// src/core/registry/entry.ts
export type Origin = "project" | "user" | "bundled"
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

// src/core/registry/registry.ts
export class Registry extends Context.Service<Registry, {
  readonly all: Effect.Effect<ReadonlyArray<Entry | InvalidEntry>, PermissionDenied>
  readonly get: (kind: Entry["kind"], id: string) =>
    Effect.Effect<Entry, NotFound | EntryInvalid>
  readonly files: (entry: Entry) =>
    Effect.Effect<ReadonlyArray<EntryFile>, EntryInvalid> // files/ and adapters/, relative paths
}>()("quickstacks/Registry") {
  static layer: (roots: RegistryRoots) => Layer.Layer<Registry, never, FileSystem | Path>
}
export type RegistryRoots = { project: string; user: string; bundled: string }
```

`Registry.layer` is built per invocation from `AppConfig.paths` (user root),
`Host.cwd` (project root) and the bundled root that 0.2 adds to `Host`. It reads lazily:
`list` reads frontmatter only; `files` walks a directory only when 1.2 asks. No cache
crosses invocations (AGENTS.md: "No globals/caches across runs").

`config.ts::configLayer` gains a `registry` path in `Paths`:
`{ config, data, cache, user: join(XDG_CONFIG_HOME, "quickstacks") }`. Doctor reports it.

### Frontmatter parsing

Split on a first line of exactly `---` and the next line of exactly `---`. Parse the
YAML between with the `yaml` package's `parse` in its default (YAML 1.2 core) mode, then
decode the unknown value with `Schema.decodeUnknownEffect(StackMeta,
{ onExcessProperty: "error" })`.

`yaml` is the one new runtime dependency. Effect has no YAML reader, frontmatter is
YAML by convention in every markdown tool authors already use, and writing a YAML
subset parser by hand is the kind of custom code AGENTS.md says to avoid. It goes in the
root workspace catalog and `packages/cli/package.json`.

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
    valid: Schema.Boolean, error: Schema.optional(Schema.String),
    fragments: Schema.Struct({ required, default, optional }),
    tools: Schema.Array(Schema.String),
    lastRun: Schema.NullOr(Schema.Struct({ date: Schema.String, result: Schema.String })),
  })),
  fragments: Schema.Array(Schema.Struct({
    id, name, description, tags, category, appliesTo, requires, conflicts,
    origin, trusted, shadows, valid, error,
  })),
})
```

`lastRun` is always `null` in 1.0. It is in the shape now so agents written against the
MVP don't break when 2.0 fills it. `briefWords` is not in `list`, because it requires
composing; it appears in `new --json` (1.2) and `validate` (1.5).

The human table shows id, name, origin (only when not bundled), and an `untrusted` marker.
Output goes through `services/output.ts::Output.result(value, human)`, the way
`commands/doctor.ts::doctorCommand` does it.

### Failure modes

| Situation | Error tag | Exit | What the agent sees |
|---|---|---|---|
| Unknown kind argument (`list widgets`) | `Usage` | 2 | Fixed usage message |
| User or project root unreadable | `PermissionDenied` | 6 | `{ error: { tag, message, retryable: false, details: { path } } }` |
| An entry fails to decode | none for `list` | 0 | The entry with `valid: false` and a one-line `error` |
| Entry contains a symlink | none for `list` | 0 | `valid: false`, `error: "entry contains a symlink"` |
| Two entries in one origin share an id | `EntryInvalid` on `get`; `list` shows the first with `valid: false` | 2 | `details: { id, dirs }` |

`EntryInvalid` is a new tag on exit 2 with `details: { id, origin, reason, path? }`,
added to the single table that 0.3 introduces in `errors.ts`.

### Settled here

| Question | Answer | Why |
|---|---|---|
| Frontmatter key style | camelCase | One spelling across YAML, manifest and JSON output |
| User directory | `$XDG_CONFIG_HOME/quickstacks/{stacks,fragments}/` | User-authored entries are configuration; it sits beside `config.json`, which the base already resolves |
| Project-local entries | `./.quickstacks/{stacks,fragments}/` | The same directory as project metadata, so one name to learn |
| Invalid higher-origin entry | Shown as invalid, not replaced | Silent fallback hides an author's mistake behind a bundled copy |
| Trust | Shadowing project entries are untrusted | A clone can ship a `.quickstacks/` that overrides a familiar id |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/schemas/entry.ts` | `StackMeta`, `FragmentMeta`, `VerifyStep`, `Probe`, `Check` |
| `packages/cli/src/schemas/list.ts` | `ListResult` |
| `packages/cli/src/schemas/index.ts` | Exports |
| `packages/cli/src/core/registry/` | `entry.ts` (frontmatter split and decode), `registry.ts` (service and layer) |
| `packages/cli/src/commands/list.ts` | Thin handler |
| `packages/cli/src/cli.ts` | Add `listCommand` to the subcommand list |
| `packages/cli/src/config.ts` | `Paths.user` |
| `packages/cli/src/errors.ts` | `EntryInvalid` |
| `packages/cli/tests/fixtures/registry/` | Two stacks, four fragments, one invalid entry, one with `schemaVersion: 2` |
| `packages/cli/tests/list.test.ts`, `tests/registry.test.ts` | New |
| `packages/cli/package.json`, root `package.json` catalog | `yaml` |

## Acceptance tests

All through `tests/helpers/cli.ts::runCli` with temporary HOME and XDG directories.
`runCli` needs a `cwd` option so `Host.cwd` can point at a temp project; add it here.

1. `list --json` with only the fixture bundled root returns both stacks and four
   fragments, every one `origin: "bundled"`, `trusted: true`, `lastRun: null`; exit 0;
   stderr empty.
2. A user-directory stack with a new id appears with `origin: "user"`.
3. A user-directory copy of a bundled id wins, with `shadows: ["bundled"]`, trusted.
4. A project-directory copy of a bundled id wins with `trusted: false`.
5. A project-directory entry with a new id is trusted.
6. A malformed frontmatter (unknown key, bad id, missing `---`) shows `valid: false` with
   an error that names the field, and `list` still exits 0.
7. `schemaVersion: 2` in the user directory falls through to the bundled copy and logs
   one warning.
8. A symlink inside an entry marks it invalid; nothing outside the entry is read.
9. A `serve` step without `probe`, and a step with both `run` and `check`, fail decode.
10. `list widgets` exits 2 with the usage envelope under `--json`.
11. An unreadable user root (mode 000, skipped on CI as root) exits 6.
12. A property test (`@effect/vitest`): for any generated valid frontmatter object,
    stringify with `yaml`, split, parse and decode returns the same object.

## Exit criteria

- All tests above pass; `bun run check` green from the repo root.
- `bun run dev list --json` against the fixture registry prints parseable JSON.
- `AGENTS.md` architecture map lists `src/core/registry/` and `src/schemas/entry.ts`;
  `packages/cli/README.md` documents `list` and the user directory.
- The roadmap's contracts table still matches what was built, or is updated in the same
  change.

## What this plan may get wrong

- The `effect/cli` argument API for an optional positional with a fixed set of values may
  push `list [stacks|fragments]` into two subcommands. Check the installed exports first.
- `Schema.Literals` and `Schema.TaggedStruct` are the Effect 4 names as far as this plan
  knows; confirm against the installed `effect` types, as the effect skill says.
- camelCase keys in YAML may annoy authors used to snake_case. Cheap to change now,
  expensive after 1.6 ships stacks.
- Reading only frontmatter for `list` assumes bodies are large enough to matter; if not,
  reading whole files is simpler.
