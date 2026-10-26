# Phase 1.2: `new`: scaffold and manifest

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | `quickstacks new <stack> [dir]` writes the composed files, the brief and the manifest into a new project, initializes git, and returns a result an agent can act on, without running any command from any entry |
| Traces to | "The CLI writes a few files and a brief, then hands off" (README product summary); job 1, "the same well-tested setup I'd build by hand, without spending the afternoon"; job 2, "a running dev environment with tests in a few minutes"; What this is not, "never runs a command from a stack" |
| Depends on | [1.1](phase-1.1-composition-and-brief.md) |
| Blocks | [1.3](phase-1.3-verify-and-tamper-detection.md) (reads the manifest), [1.4](phase-1.4-handoff-and-entry-points.md) (hands off after `new`), [3.0](phase-3.0-add-fragments-to-repo.md) (reuses the writer) |
| Decisions needed | D14 shapes the manifest's digest fields; the fields are written here whichever way D14 goes, so 1.2 does not block on it |
| Decisions or questions this settles | Manifest format and location; the template variable set; target-directory rules; git behavior; `new --json` shape |

## Scope

In:

- `new <stack> [dir]` with `--with`, `--without`, `--sandbox`, `--yes`, `--agents`,
  `--no-launch`, `--dry-run`, `--json`.
- Target directory checks, file writing with no escape from the project, `.tmpl`
  rendering, JSON merge writing.
- `.quickstacks/` layout: `manifest.json`, `BRIEF.md`, empty `NOTES.md` with its two
  sections, `state/`, `.gitignore`.
- The project id and the out-of-project state record that D14 relies on.
- `git init` when the target is not inside a repository and git exists.
- Missing-tool detection (PATH lookup only).
- The `new` result for `--json` and human output.

Out:

- Launching or detecting an agent (1.4). 1.2 ends with the result; when 1.4 lands, the
  handler calls handoff after writing. Until then `new` behaves as if `--no-launch`.
- `add` into an existing repo (3.0).

## Design

### CLI surface

```
quickstacks new <stack> [dir]
  --with a,b          add optional fragments
  --without a,b       remove default fragments
  --sandbox           every default, no deploy or release fragments, prod steps skipped
  --yes               take every decision's default without asking (implied by --sandbox)
  --agents claude,codex   adapter targets (default: config `agents`, else claude)
  --no-launch         write and print the next step, never start an agent (1.4)
  --dry-run           compose and report what would be written; write nothing
  --json
```

`dir` defaults to `<stack>` under the current directory. `.` is allowed.

### Target directory

| State of `dir` | Behavior |
|---|---|
| Does not exist | Create it |
| Exists and empty | Use it |
| Exists, holds only `.git/` | Use it; git state is `fresh` if it has no commits, `parent` semantics otherwise |
| Exists with other files | `TargetNotEmpty`, exit 2. `add` (3.0) is the path for existing repos |
| Inside an enclosing git repository | Allowed; git state `parent`. If any composed fragment has `needsOwnRepo`, refuse with `ComposeConflict` (reason `needs_own_repo`) before writing anything |

### Writing

Every write goes through one function that resolves the real path of the parent
directory and refuses a destination outside the project root (`PermissionDenied` with
`details.path`), so a symlink created between checks can't redirect a write. Files are
written with the entry file's mode for the executable bit only (hooks must stay
executable), never with ownership or other bits.

`.tmpl` files are rendered with exactly these variables, and an unknown `{{name}}` in a
template is `EntryInvalid` at compose time, not a half-written project:

| Variable | Value |
|---|---|
| `project_name` | The directory's base name as given |
| `project_slug` | Lowercased, non-alphanumerics to `-`, trimmed |
| `env_prefix` | Slug upper-cased with `_`, prefixed `_` if it starts with a digit |
| `author` | Config `author`, else empty |
| `year` | The current UTC year from `Clock` |

There are no conditionals or loops in templates (D1). Anything conditional is prose.
Files that don't end in `.tmpl` are copied byte for byte, so `${{ secrets.X }}` in a
workflow file is safe.

The write order is: entry files, then `.quickstacks/`, then `git init`. If anything fails
after the first write, the handler removes the files it wrote (it tracks them) and the
directory if it created it, so a failed `new` leaves no half project. That cleanup runs as
an Effect finalizer, so it also runs on interrupt.

### `.quickstacks/` layout

| Path | Committed | Holds |
|---|---|---|
| `manifest.json` | Yes | What was composed and the verify steps |
| `BRIEF.md` | No | The one-shot task for the agent |
| `NOTES.md` | No | `## Findings` and `## Asked`, both empty |
| `state/` | No | `runs.jsonl` from verify (1.3) |
| `.gitignore` | Yes | `BRIEF.md`, `NOTES.md`, `state/`, `incoming/` |
| `stacks/`, `fragments/` | Yes, when present | Project-local entries (1.0) |

The brief and notes are ignored so a public repo doesn't publish the task text, and so
the agent's notes stay with the person who ran it. A user who wants them committed can
edit the ignore file; quickstacks preserves an existing one.

### Manifest

JSON, decoded with Schema on every read, excess properties rejected.

```ts
const Manifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  projectId: Schema.String,            // random UUID from Effect's Random/crypto
  createdAt: Schema.String,            // ISO, from Clock
  cli: Schema.String,                  // quickstacks version that wrote it
  mode: Schema.Literal("new"),         // "add" in 3.0
  preset: Schema.Literals(["default", "sandbox"]),
  agents: Schema.Array(AgentId),
  stack: EntryRef,                     // { id, origin, trusted }
  fragments: Schema.Array(EntryRef),
  env: Schema.Record(Schema.String, Schema.String),
  commands: Schema.Record(Schema.String, Schema.String),
  verify: Schema.Array(ManifestStep),  // VerifyStep + owner + skipByDefault
  verifyDigest: Schema.String,         // "sha256:<hex>" of the canonical steps
  briefWords: Schema.Number,
})
```

JSON rather than YAML because the CLI writes it and agents and tools read it: JSON has
one canonical form to hash, Schema decodes it directly, and it needs no second
dependency beyond the `yaml` reader 1.0 adds for frontmatter.

`verifyDigest` is sha256 over the canonical JSON of the steps (keys sorted, defaults
applied, `owner` excluded) so reordering keys in an editor doesn't count as a change and
renaming a step does. The digest function lives in `src/core/manifest.ts` and is shared
with 1.3.

The same digest, the project id, `createdAt` and the manifest's real path are also written
to `$XDG_STATE_HOME/quickstacks/projects/<projectId>.json`. That is the second copy D14
compares against; an agent that edits both the manifest steps and `verifyDigest` still
leaves this one unchanged. `config.ts::configLayer` gains `Paths.state`
(`XDG_STATE_HOME`, default `~/.local/state`) for it. If the state directory isn't
writable (some agent sandboxes allow writes only in the project), `new` still succeeds,
records `stateRecord: false` in its result, and 1.3 reports the tamper check as
manifest-only.

### Git

| Git state | `new` does | The brief says |
|---|---|---|
| git on PATH, target not in a repo | `git init` (the CLI's own command, not an entry's) | Fresh repo; skip generators' git setup; commit once verify is green |
| Target inside a repo | Nothing | Part of the repo at `<toplevel>`; don't commit without asking |
| git missing | Nothing | No git; skip commits; say so in the final summary |

`git` runs through the process service from 0.3 with a 10 second timeout and no shell.

### Missing tools

The composition's `tools` and every fragment's `requiresTools` are looked up on `PATH`
(read in `config.ts`, searched with `FileSystem`). Missing ones go into the brief's ground
rules and the result. They never fail `new`: the agent may be able to install them.

### Result

```ts
const NewResult = Schema.Struct({
  project: Schema.String,                 // absolute path
  stack: Schema.String,
  fragments: Schema.Array(Schema.String),
  preset, agents,
  written: Schema.Array(Schema.String),   // relative paths
  brief: Schema.Literal(".quickstacks/BRIEF.md"),
  briefWords: Schema.Number,
  missingTools: Schema.Array(Schema.Struct({ tool: Schema.String, owners: Schema.Array(Schema.String) })),
  untrusted: Schema.Array(Schema.Struct({ id: Schema.String, dir: Schema.String })),
  git: Schema.Literals(["fresh", "parent", "none"]),
  stateRecord: Schema.Boolean,
  handoff: Schema.Struct({ kind: Schema.Literal("print"), next: Schema.String }), // 1.4 widens
  dryRun: Schema.Boolean,
})
```

`next` is the prompt the agent or user should act on: "Read .quickstacks/BRIEF.md and
carry it out. It is your full task for this project; you're done when `<cli> verify`
passes." 1.4 replaces the `print`-only handoff with its full union.

Human output lists the stack, fragments, written file count, missing tools and the next
step. `--dry-run` returns the same shape with `written` as the planned list and nothing on
disk.

### Failure modes

| Situation | Error tag | Exit | What the agent sees |
|---|---|---|---|
| Unknown stack or fragment | `NotFound` | 2 | From 1.1, with known ids |
| Composition conflict, needs own repo | `ComposeConflict` | 2 | `details.reason` |
| Target has files | `TargetNotEmpty` | 2 | `details: { path, entries: <first 10 names> }` |
| Target or state dir unwritable | `PermissionDenied` | 6 | `details: { path }`; no files left behind |
| A write would escape the project | `PermissionDenied` | 6 | `details: { path }` |
| Interrupted mid-write | `Interrupted` | 130 | Written files removed |

`TargetNotEmpty` is a new tag on exit 2.

### Settled here

| Question | Answer | Why |
|---|---|---|
| Manifest format | JSON at `.quickstacks/manifest.json` | Canonical hashing, direct Schema decode, one fewer dependency |
| Brief and notes in git | Ignored by default | The brief is a one-shot task; notes are for the person who ran it |
| Non-empty target | Refused | `new` never overwrites; `add` is the path for an existing repo (D4) |
| Failed `new` | Rolls back its own writes | A half-written project looks finished to an agent |
| Second digest copy | Under `XDG_STATE_HOME`, keyed by project id | Outside the project, so editing project files can't hide a changed step |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/commands/new.ts` | Thin handler |
| `packages/cli/src/core/scaffold/` | `target.ts`, `write.ts` (safe writer with rollback), `template.ts` |
| `packages/cli/src/core/manifest.ts` | Schema-backed read and write, `digestSteps` |
| `packages/cli/src/core/project-state.ts` | The out-of-project record |
| `packages/cli/src/core/tools.ts` | PATH lookup |
| `packages/cli/src/schemas/manifest.ts`, `schemas/new.ts` | `Manifest`, `NewResult` |
| `packages/cli/src/config.ts` | `Paths.state`, `PATH` value |
| `packages/cli/src/errors.ts` | `TargetNotEmpty` |
| `packages/cli/src/cli.ts` | `newCommand` |
| `packages/cli/tests/new.test.ts`, `tests/manifest.test.ts` | New |
| `packages/cli/e2e/` | One binary test for `new --sandbox --no-launch --json` on the fixture registry |

## Acceptance tests

Through `runCli` with temp HOME, XDG dirs and a temp `cwd`; git is the real binary (tests
that need it skip with a message when it is absent).

1. `new fixture-stack app --sandbox --no-launch --json` exits 0, prints one JSON result,
   and on disk has the stack's files, rendered templates with no `{{`, executable hooks,
   `.quickstacks/manifest.json` that decodes, `BRIEF.md` whose word count equals
   `briefWords`, and `NOTES.md` with both headings.
2. The manifest digest equals `digestSteps(manifest.verify)`, and the state record under
   `XDG_STATE_HOME` holds the same digest and project id.
3. With `XDG_STATE_HOME` unwritable, `new` succeeds with `stateRecord: false`.
4. A target with a file in it fails `TargetNotEmpty` and writes nothing.
5. A target inside a temp git repo is not re-initialized, and a `needsOwnRepo` fragment is
   refused before any write.
6. An entry with a symlinked `files/` target, and a planned path with `..`, both fail
   without writing outside the temp root (assert the parent dir is unchanged).
7. A failure injected after the first write (a later file's directory made read-only)
   leaves the target exactly as it was.
8. Interrupt via `runCli`'s `signal` during writing exits 130 and leaves no files.
9. `--dry-run --json` returns the planned file list and the target does not exist.
10. Missing tools are listed in the result and the brief; `new` still exits 0.
11. `--sandbox` marks `prod` steps `skipByDefault` and implies `--yes` in the brief.
12. Under `--json`, no entry command ran: a fixture fragment whose verify step is
    `touch ran` leaves no `ran` file (the D2 check).

## Exit criteria

- Tests pass; `bun run check` green from the repo root, including the new e2e case
  against the built artifact.
- `AGENTS.md` documents `.quickstacks/` and the state record in its architecture map;
  `packages/cli/README.md` documents `new` and its flags.
- The roadmap's contracts table matches the `.quickstacks/` layout as built.

## What this plan may get wrong

- Rolling back by tracking written paths assumes nothing else writes into the target
  during `new`. True for the CLI alone; an editor watching the directory could add files,
  which the rollback must leave alone.
- `XDG_STATE_HOME` may not be writable in exactly the sandboxes where tamper detection
  matters most. If 1.6's gate runs show `stateRecord: false` often, D14's second copy is
  weaker than it looks and the plan should say so in D14's row.
- `project_name` from the directory name may produce a slug some generators reject (a
  leading digit for Go modules). The stack's decisions own that; the variable set stays
  fixed.
- The `new` result's `handoff` field is a placeholder union until 1.4; if 1.4 lands first
  in parallel, merge the shapes by hand.
