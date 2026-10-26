# Phase 3.1: Authoring

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | A developer can write a stack or fragment once in their user directory, preview the exact brief an agent will get with its word count and fingerprint, see any entry's metadata and guidance with `show`, override a bundled stack by id, and set personal defaults that apply to every `new` |
| Traces to | Job 3: "When I've settled on a stack I rebuild often, I want to write it down once, including the agent tooling, so every new project starts where the last one ended." The stack author: "the only proof a stack works is an end-to-end agent run, and nothing tells them when their prose has gone stale." Success row 5: "Stacks and fragments in `~/.stacks` and third-party sources, not only the bundled registry" |
| Depends on | 1.5 (`validate` and the budget), 2.2 (rot checks and the "changed since" note, which `show` and the preview report) |
| Blocks | 3.2 (sources reuse `show` and the preview to let a user inspect a source before trusting it) |
| Decisions needed | D5 (proposed) for the numbers the preview prints against. No new decision |
| Decisions or questions this settles | Where personal stacks live and how they shadow bundled ones; the shape of personal defaults in `config.json`; what `show` prints; what `create` scaffolds |

## Scope

In:

- `quickstacks show <id> [--json]`: one stack or fragment's metadata, origin, trust, guidance body (unfiltered), shipped files, fragments that fit it, its last recorded run and whether it changed since.
- `quickstacks create stack <id>` and `create fragment <id>`: a skeleton entry in the user directory that passes `validate` with zero errors and a handful of `quickstacks:fill` warnings.
- `quickstacks validate [path] --brief <stack> [--with a,b] [--without c] [--sandbox] [--json]`: prints the composed brief without scaffolding, with per-entry and composed word counts against the D5 caps and the composition fingerprint from 2.0.
- Personal defaults in `config.json`: `always`, `agents`, `author`, `packageScope`, `preset`.
- A shipped authoring guide, `packages/cli/docs/authoring.md`, included in the npm package and printed path by `create`.
- Shadowing: a user-directory entry with a bundled id replaces the bundled one, and `list`/`show` say so.

Out:

- Publishing or sharing (3.2 git sources, 4.0 index).
- An interactive wizard. `create` writes a skeleton and exits.
- Editing entries for the user. `create` never touches an existing directory.
- Category `app` and two-phase briefs (roadmap, Won't have).

## Design

### Where authored entries live

The user origin is `$XDG_CONFIG_HOME/quickstacks/{stacks,fragments}/` (default `~/.config/quickstacks/`), the same directory as `config.json`. That is the contract in the roadmap. Entries are user-authored configuration, so they belong under the config home, not data or cache. The problem statement's `~/.stacks` reads as this directory.

Shadowing rules, applied by the 1.0 registry loader:

| Entry at | Same id exists in | Result |
|---|---|---|
| User directory | Bundled | User copy wins. `list` shows `origin: user`, `shadows: "bundled"`; `trusted: true` (the user wrote it) |
| Project directory | User or bundled | Project copy wins and is `trusted: false` (a cloned repo can ship it), as 1.0 defines |
| User directory | Nothing | Ordinary user entry |

To change a bundled stack, copy it: `quickstacks create stack go-cli --from bundled` copies the bundled entry into the user directory so the author edits a working copy rather than starting from a skeleton.

### `show`

```
quickstacks show go-cli
Go CLI (go-cli), stack, origin bundled, trusted
A Go command-line tool with ...
Fragments: required none; default agent-ops, git-hooks, ci-github; optional goreleaser
Verify: install, build, lint, test, smoke, readme-filled
Brief: 2,980 words with defaults (cap 5,000)
Last run: pass 2026-11-02, unchanged since
--- guidance ---
<body, unfiltered>
```

`show --json` result:

```json
{
  "id": "go-cli",
  "kind": "stack",
  "name": "Go CLI",
  "description": "...",
  "origin": "bundled",
  "shadows": null,
  "trusted": true,
  "path": "/.../registry/stacks/go-cli",
  "tags": ["go", "cli", "make"],
  "deps": { "cli": ["github.com/spf13/cobra"] },
  "decisions": ["Module path: ... (default)"],
  "fragments": { "required": [], "default": ["agent-ops"], "optional": ["goreleaser"] },
  "fits": ["postgres"],
  "verify": [{ "name": "install", "phase": "setup", "layer": "install" }],
  "commands": { "test": "Unit tests" },
  "files": ["files/.gitignore", "adapters/claude/.claude/settings.json"],
  "body": "...",
  "briefWords": { "body": 1266, "composed": 2980, "cap": 5000 },
  "lastRun": { "date": "2026-11-02", "result": "pass", "changedSince": false }
}
```

`show` composes (it needs the composed word count and fingerprint), so it is slower than `list`. That is the split 2.0 already draws: `list` reads the ledger, `show` compares fingerprints. For a fragment, `fits` lists stacks whose tags or ids match its `applies_to`, and `composed` is the fragment alone.

Run from inside a project, `show` also prints which of the stack's optional fragments the project hasn't applied yet, with the `quickstacks add` command.

### `create`

```
quickstacks create stack my-api [--from <id>] [--json]
quickstacks create fragment my-ci [--category ci] [--json]
```

Writes to the user directory and prints the path and the authoring guide's path. Refuses when the directory exists (`BadInput`, exit 2). A stack skeleton contains:

- `STACK.md` with every frontmatter field present, ids filled in, a `quickstacks:fill` placeholder for the description, one decision written in the required "(default: ...)" form, verify steps for the D7 layers calling project commands (`make install`, `make lint`, `make typecheck`, `make test`) plus a built-in `filled` check on `README.md`, and body headings Layout, Setup, Conventions, Tool configuration, Testing, Commands, Gotchas, each with a one-line instruction about what goes there.
- `files/.gitignore` and `files/README.md` containing `quickstacks:fill`.

A fragment skeleton has the fragment fields (`category`, `applies_to`, `requires`, `conflicts`, `requires_tools`, `needs_own_repo`, `merge`) and headings What to add, Tool configuration, Verify, AGENTS.md.

`create` executes nothing and makes no network call. `validate` on a fresh skeleton reports zero errors and only fill-marker warnings; a test enforces that so the skeleton can never drift from the format.

### Brief preview

`validate --brief` uses the same `composeBrief` path `new` uses, with a neutral variable set (`project_name: "example"`, `year` fixed) so output is reproducible. Human output prints the brief to stdout and the size report to stderr; `--json` returns:

```json
{
  "stack": "go-cli",
  "fragments": ["agent-ops", "git-hooks", "ci-github"],
  "preset": "sandbox",
  "brief": "# Build example: Go CLI\n...",
  "words": {
    "brief": 2980,
    "cap": 5000,
    "entries": [{ "id": "go-cli", "body": 1266, "cap": 2000, "shippedMarkdown": 410 }]
  },
  "fingerprint": "sha256:...",
  "errors": [],
  "warnings": []
}
```

A preview over the cap still prints the brief and exits 2 with `BudgetExceeded`, the same tag `validate` uses, so an author can read what to cut.

### Personal defaults

`schemas/config.ts::Settings` gains optional fields. It keeps `onExcessProperty: "error"`, so a typo fails loudly and `doctor` reports it (the base already survives a broken config file for `doctor` and `--version`).

```ts
export const Settings = Schema.Struct({
  dataDir: Schema.optional(Schema.String),
  always: Schema.optional(Schema.Array(EntryId)),      // fragments added to every new
  agents: Schema.optional(Schema.Array(AgentId)),      // handoff order and adapter targets
  author: Schema.optional(Schema.String),              // {{author}} in templates
  packageScope: Schema.optional(Schema.String),        // {{package_scope}}
  preset: Schema.optional(Schema.Literals(["default", "sandbox"])),
});
```

Precedence, lowest first: config file, then flags. `--without <id>` removes an `always` fragment for one run; an `always` id that doesn't fit the stack (`applies_to`) is skipped with a warning rather than failing `new`, because a personal default shouldn't break every stack it doesn't apply to. `agents` is the handoff order 1.4 already reads; this sub-phase makes it configurable.

### The authoring guide

`packages/cli/docs/authoring.md`, shipped in the package `files` list. Written for an author starting from a project they trust. It covers sorting a project into frontmatter, prose and `files/`; the rule that anything that would be wrong after the next major release goes in prose (and the three forms a stale fact can be rewritten into: the durable rule, a discovery step, or a verify step that asks the tool); Setup as numbered steps that run generators non-interactively into a subdirectory; verify steps that call project commands and cover the D7 layers; every decision stating its default; when something is a fragment; staying within budget (move shared material to an optional fragment, move reference material into a shipped doc the body points to, cut what the agent would do anyway); and how to run one sandbox build and read `.quickstacks/NOTES.md`. It is the format reference's companion, not a copy of it.

### Failure modes

| Case | Result | Exit |
|---|---|---|
| `show` unknown id | `NotFound` with nearest ids in `details` | 2 |
| `show` on an entry that fails to parse | `InvalidEntry` with the file and the first schema issue | 2 |
| `create` target exists | `BadInput` | 2 |
| `create --from` unknown id | `NotFound` | 2 |
| User directory not writable | `PermissionDenied` | 6 |
| Preview over budget | Brief printed, `BudgetExceeded` | 2 |
| `config.json` has an unknown key | `InvalidConfig` for commands that read settings; `doctor` reports it | 3 |

### Decisions settled here

- The user origin is under the config home. It is what authors edit by hand, and backing up `~/.config` should carry it.
- `--from` copies a whole entry instead of supporting partial overrides. Partial inheritance would need merge rules for prose, and the single-owner rule exists to avoid those.
- `show` prints the body unfiltered (every conditional branch) so an author sees all of it; the filtered view is `validate --brief`.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/commands/show.ts`, `create.ts` | New handlers |
| `packages/cli/src/commands/validate.ts` | `--brief`, `--with`, `--without`, `--sandbox` |
| `packages/cli/src/core/create.ts` | Skeleton writer |
| `packages/cli/src/core/show.ts` | Builds the show report from registry, composition and ledger |
| `packages/cli/src/schemas/config.ts` | New `Settings` fields |
| `packages/cli/src/schemas/show.ts` | `ShowReport` schema |
| `packages/cli/src/core/registry.ts` | `shadows` field on loaded entries |
| `packages/cli/src/commands/new.ts` | Apply `always`, `preset`, `author`, `packageScope` |
| `packages/cli/docs/authoring.md` | New shipped guide; `package.json` `files` updated |
| `packages/cli/tests/show.test.ts`, `create.test.ts`, `preview.test.ts`, `config.test.ts` | New and extended |

## Acceptance tests

- `create stack my-api`, then `validate <userdir>/stacks/my-api --json`: zero errors, warnings only for fill markers. Guards the skeleton against format drift.
- `create stack go-cli --from bundled` copies the entry; `list --json` then shows `go-cli` with `origin: "user"` and `shadows: "bundled"`; `new go-cli` uses the user copy (assert a marker sentence added to its body appears in the brief).
- `show go-cli --json` decodes against `ShowReport`; `lastRun.changedSince` flips to true after editing the user copy's body.
- `validate --brief go-cli --sandbox --json` returns the same brief text `new go-cli --sandbox --no-launch` writes to `BRIEF.md` for the same project name, and the same fingerprint as `quickstacks runs` records for it.
- A fixture stack over the composed cap: preview exits 2, stdout still holds the brief, stderr's last line is the `BudgetExceeded` envelope.
- `config.json` with `always: ["ci-github"]`: `new` includes it; `--without ci-github` removes it; an `always` fragment that doesn't fit the stack produces one warning and `new` succeeds.
- `config.json` with an unknown key: `new` exits 3; `doctor` exits 0 and lists the config error.
- Neither `show`, `create` nor the preview starts any process (process service test layer records none).

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- The authoring guide is in the packed tarball (`npm pack --dry-run` lists it) and the 0.2 package e2e asserts it.
- One maintainer writes a personal stack from a project they trust using only `create`, the guide and the preview, and records in the run notes where the guide was missing something.
- `AGENTS.md` and the CLI README document `show`, `create`, the preview and personal defaults.

## What this plan may get wrong

- Authors may want inheritance ("go-cli but with my lint rules") more than whole copies. If several personal stacks turn out to be near-copies of bundled ones, a fragment is the right answer and the guide should say so loudly; real inheritance is a format change.
- The skeleton's D7 verify steps assume Make-style project commands. Stacks with package scripts will rewrite them every time; a `--scripts` flag may earn its place.
- Putting entries under `~/.config` may surprise people who expect a dotdir. `doctor` prints the path, and `create` prints it on every run.
