# Phase 3.1c: `new --dry-run` and naming options

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | `new --dry-run` reports what `new` would write without writing anything, `--name` and `--author` set the template variables, and `slug` handles npm scopes, accented letters and camelCase |
| Traces to | Job 3 and the stack author ("write my own stacks once"), who previews a composition before using it; job 1, "the same well-tested setup I'd build by hand" (a project named the way the user names it) |
| Depends on | [1.2a](phase-1.2a-new-scaffold-and-templates.md) (the `new` command, the writer, the template variables, `slug`, `NewResult`), [1.2b](phase-1.2b-manifest-state-and-detection.md) (the manifest and state record a dry run must not write), [3.1a](phase-3.1a-show-and-preview.md) (`validate --brief`, the other preview path; the two share the human file listing) |
| Blocks | Nothing |
| Decisions needed | None |
| Settles | The dry-run result; `--name` and `--author` precedence; the full slug table |

## Scope

In:

- `new --dry-run`: compose, render every template in memory, and report the plan; write
  nothing, create no directory, write no state record, run no git command except the
  read-only `git rev-parse --show-toplevel` that decides the git state.
- `new --name "My App"` and `new --author "A. Name"`.
- The full `slug` rule table in `src/core/scaffold/slug.ts`, replacing 1.2a's ASCII rule
  in the same function.

Out:

- A dry run of `add` (3.0 has its own planning output).
- Any change to the template variable set; `--name` and `--author` only change values.

## Design

### Flags

```
quickstacks new <stack> [dir]
  --name "My App"     project name for templates (default: the directory's base name)
  --author "A. Name"  author for templates (default: Settings.author, then git user.name)
  --dry-run           compose and report what would be written; write nothing
```

`dir` defaults to the slug of `--name` when it is given, else `<stack>`. `--dry-run`
never launches an agent, whatever 1.4's flags say: the handoff is `print` with reason
`no-launch`. `--dry-run` with `--launch` is a flag contradiction and fails `Usage`, exit 2,
like every other contradiction (1.4).

Template variables after this sub-phase:

| Variable | Value |
|---|---|
| `project_name` | `--name`, else the directory's base name as given |
| `author` | `--author`, else `Settings.author`, else `git config user.name`, else empty |

The rest of 1.2a's table is unchanged.

### Dry-run result

`NewResult` gains `dryRun: Schema.Boolean`. A dry run returns the same shape with
`written` as the planned list (output paths, unescaped, including the `.quickstacks/`
files and the manifest), `stateRecord: false`, `git` as it would be, and nothing on disk.
Target-directory refusals (`TargetNotEmpty`, `needs_own_repo`) and template errors fail
the dry run exactly as they would fail `new`, because the point is to find them first.
Human output uses 1.1's `collapsePaths` and ends with
`Dry run: nothing was written.`

### Slug

`slug` stays one function with one table of cases. In order:

1. Strip an npm scope: `@acme/web-app` becomes `web-app`.
2. Unicode NFKD, then drop combining marks: `Café` becomes `Cafe`.
3. Split camelCase and digit boundaries: `myAPIServer2` becomes `my API Server 2`.
4. Lowercase; every run of characters outside `[a-z0-9]` becomes one `-`; trim `-` from
   both ends.
5. Empty result (for example `日本語` or `@@@`): `project`.

| Input | Slug |
|---|---|
| `My App` | `my-app` |
| `@acme/web-app` | `web-app` |
| `Café Déjà Vu` | `cafe-deja-vu` |
| `myAPIServer2` | `my-api-server-2` |
| `__init__` | `init` |
| `a--b__c` | `a-b-c` |
| `日本語` | `project` |
| `2048` | `2048` (and `env_prefix` `_2048`) |

Every row of 1.2a's ASCII table gives the same slug under these rules, so only inputs
with scopes, accents or camelCase change.

## Files and areas touched

| Path (under `packages/cli/`) | Change |
|---|---|
| `src/commands/new.ts` | `--name`, `--author`, `--dry-run` |
| `src/core/scaffold/slug.ts` | The full rule table |
| `src/core/scaffold/author.ts` | `--author` first |
| `src/schemas/new.ts` | `NewResult.dryRun` |
| `tests/new-dry-run.test.ts`, `tests/slug.test.ts` | New, or extended from 1.2a's |
| `README.md` (package) | The three flags |

## Acceptance tests

1. `new fixture-stack app --dry-run --json` returns the planned file list including
   `.quickstacks/manifest.json`, `dryRun: true`, `stateRecord: false`; the target does not
   exist afterwards and no state record was written.
2. A dry run into a non-empty target fails `TargetNotEmpty`; a dry run with an unknown
   `{{name}}` fails `EntryInvalid` reason `template`; neither writes anything.
3. A dry run with a fake `claude` on `PATH` and both TTY flags true never runs it.
4. `--dry-run --launch claude` exits 2 with a `Usage` envelope.
5. `--name "My App"` with no `dir` creates `my-app/` and renders `project_name` as
   `My App`; `--author` beats `Settings.author`, which beats a temp repo's
   `git config user.name`.
6. Slug: every row of the table, every row of 1.2a's table unchanged, and the property
   test that output always matches `^[a-z0-9]+(-[a-z0-9]+)*$`.

## Exit criteria

- Tests pass; `bun run check` green from the repo root.
- `packages/cli/README.md` documents the three flags.
- The Shared helpers row for `slug` still matches what was built.

## What this plan may get wrong

- A dry run that checks the target directory can pass and the real run still fail if the
  directory changes in between. That is expected; the real run checks again.
- NFKD folding covers Latin accents but not transliteration (`Ö` becomes `o`, `日本語`
  becomes `project`). If users with non-Latin project names ask, a transliteration table
  is the next step, still in this one function.
