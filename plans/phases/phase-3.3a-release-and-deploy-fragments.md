# Phase 3.3a: Release and deploy fragments

Status: DRAFT 2026-10-26 (not agreed). Re-scoped 2026-10-26: D28 is superseded, so
`package_scope`, `--scope` and `Settings.package_scope` are built in
[1.2a](phase-1.2a-new-scaffold-and-templates.md) as part of v1, with no
`schema_version: 2` and no `template-version` check; and 1.6a ports the release and
deploy fragments (`bun-release`, `goreleaser`, `docker-deploy`, `cloudflare-pages`), so
this file gives each its bench proof and keeps the proof rule rather than authoring them.
The `package_scope` section and tests below are historical until the body is rewritten

| Field | Value |
|---|---|
| Goal | The bundled registry gains the release and deploy fragments a stranger would expect from a curated catalog (D6), each landing only with a green bench run of a composition that includes it, and the template set gains `package_scope` (D28) so release fragments can publish a package under the user's scope. This file also defines the proof rule every later bundled entry follows |
| Traces to | Job 4: "add a known-good piece (CI, agent hooks, Postgres) without it overwriting what's there"; Job 1: "I want a project set up the way I'd set it up myself, with tests, lint, CI and agent config"; open question "Who is the bundled registry for?" |
| Depends on | [2.0b](phase-2.0b-bench.md) (every entry lands with a bench run, and release and deploy fragments need its `--preset default` passthrough, since `--sandbox` drops their categories), [2.0c](phase-2.0c-run-ledger.md) (the ledger records the proof rule checks), [2.2](phase-2.2-deterministic-rot-checks.md) (reference, import and dated-phrase checks on the new content), [1.6c](phase-1.6c-first-release.md) (the shipped format and stacks the fragments compose onto) |
| Blocks | [3.3c](phase-3.3c-service-vendor-and-effect-fragments.md) (it cites this file's proof rule), [3.3b](phase-3.3b-bundled-stack-expansion.md) soft (where a new stack defaults to one of these fragments) |
| Decisions needed | D6 (curated catalog) assumed; if the bundled set is the maintainers' own stack instead, these go to a user directory or a source and only `package_scope` is built. D28 (the `package_scope` variable, a D18 amendment) before any template uses it. D5 and D7 apply unchanged |
| Settles | Which fragments join the bundled set and in what order; the `package_scope` variable, `new --scope` and `Settings.packageScope`; the proof rule for adding a bundled entry after the MVP |

## Scope

In:

- Fragments, in landing order (each one a separate change with its own bench run). The service, vendor and Effect fragments are [3.3c](phase-3.3c-service-vendor-and-effect-fragments.md).

| Fragment | `category` | `appliesTo` | What it gives the project |
|---|---|---|---|
| `release-binary` | `release` | tags `cli` | A tag-driven single-binary release: per-platform builds, a checksums file, an install script that downloads the right archive and refuses on a checksum mismatch, a Windows installer script, and a prose note on macOS signing and notarization (what it requires, where the credentials go, that the release still works unsigned with a documented warning) |
| `release-go` | `release` | tags `go` | Go release tooling configured by intent (cross-compile targets, archives, checksums, changelog from Conventional Commits); conflicts with `release-binary` for Go stacks, which it replaces |
| `release-npm` | `release` | tags `node`, `bun` | Publishing a package from a tag with provenance, the package name under `{{package_scope}}` when one is set |
| `deploy-container` | `deploy` | tags `api`, `web` | A container image build from a multi-stage file shipped as intent prose, a `.dockerignore`, a smoke step that builds the image and probes its health route locally |
| `deploy-static` | `deploy` | tags `web` with a static build | Publishing a static build to a pages-style host from CI, with a preview-per-pull-request rule |

- D28: the `package_scope` template variable, its sources, a `validate` rule, and the schema-version consequence (below).
- A composition test per fragment against every bundled stack it applies to.
- The package README's fragment table.

Out:

- Service, vendor and Effect fragments (3.3c), new stacks (3.3b) and the agent harness fragment (3.4a).
- Any fragment that needs a paid account for `verify` to pass. A deploy fragment's verify builds and smoke-tests locally; publishing steps carry the `prod` tag.
- CI changes in this repo (D23). The release fragments ship CI content for the generated project; they don't touch `.github/workflows/` here.
- Dependency versions anywhere (D1, D3). Fragments name tools; agents choose versions.

## Design

### Where this fits

1.6a shipped the three MVP stacks and their default fragments, and `--sandbox` already drops `deploy` and `release` categories. This sub-phase and 3.3c grow the catalog with the pieces the problem statement's job 4 names (CI, agent hooks, Postgres) and the ones a stranger expects next. This one takes release and deploy, which share the default-preset bench mode and the `package_scope` variable. 2.0b makes proving each one a single command; 2.2's checks catch the defects that only show up in a composition.

### The proof rule for a new bundled entry

Every fragment here and in 3.3c, and every stack in 3.3b, lands in its own change, and the change is mergeable only when all of this holds:

1. `validate` over the bundled registry: zero errors and zero warnings (1.5 and 2.2), with the fragment composed alone against each stack it applies to (1.5's per-fragment composition dry run).
2. D5: fragment body at most 1,000 words, and every stack's composed brief with this fragment as its one optional fragment at most 6,500.
3. D7: the fragment's own verify steps carry a `layer`, and a fragment that adds a server adds a `serve` step with a probe.
4. A `pass` ledger record (2.0c) from a 2.0b bench run of one composition that includes it, with the run note in [plans/runs/](../runs/README.md). For `deploy` and `release` fragments the run uses `bench --preset default`, since `--sandbox` drops them; the steps that would publish carry the `prod` tag and are skipped by default, and the run proves the build and the local smoke steps.
5. 2.2's `ledger-unproven` is a note for stacks, not fragments, so this rule is checked by the composition test, which asserts a `pass` record exists whose `with` includes the fragment.

A fragment that can't meet the rule within the session stays on a branch; the next agent picks it up. Landing order is the table above, cheapest first.

### `package_scope` (D28)

1.2a's fixed template set gains one variable:

| Variable | Value |
|---|---|
| `package_scope` | `new --scope <scope>` (with or without a leading `@`; stored without it), else `Settings.packageScope`, else empty |

Rules:

- The value is validated as an npm scope (lowercase, URL-safe, no `/`); a bad value is `BadInput` for the flag and `InvalidConfig` for the setting.
- Templates write `{{package_scope}}` where a scope belongs and the prose says what to do when it's empty (publish unscoped). There are no template conditionals (D1), so a template never has to branch on it.
- `NEUTRAL_VARS` (2.0a) gains `package_scope: ""`, so fingerprints don't depend on the user's setting.
- `Settings.packageScope` joins `Settings` (still rejecting excess properties); the roadmap's Settings fields row lists it.
- The manifest records the scope only as part of the rendered files; it is not a manifest field.

Schema-version consequence: an entry whose template uses `{{package_scope}}` fails `EntryInvalid` (reason `template`) under a CLI that predates this variable. Bundled entries ship with the CLI that knows it, so they're unaffected. A user or source entry that uses it needs a CLI at least this version; the entry declares that with the existing `schemaVersion` rule: entries that use a variable added after v1 set `schemaVersion: 2`, so an older CLI skips them with one warning instead of failing a scaffold halfway through rendering. The index (4.0c) uses its `minCli` for the same reason. `validate` errors when an entry uses `package_scope` and declares `schemaVersion: 1` (check id `template-version`).

### Content rules

1.6a's entry content rules apply unchanged: no versions, numbered Setup, configuration as intent, a default for every decision, verify steps that call project commands. Additional rules for these categories:

- A release fragment never publishes from a verify step. Verify proves the release build and the install script against the local artifacts; publishing runs only from the generated project's CI on a tag.
- The install script verifies the checksum before it moves anything into place, and prints the expected and actual digests on mismatch. Its test in the fragment's verify runs it against a locally built archive with a deliberately wrong checksums file and expects a non-zero exit.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/registry/fragments/{release-binary,release-go,release-npm,deploy-container,deploy-static}/` | `FRAGMENT.md`, `files/`, `adapters/claude/` where needed |
| `packages/cli/src/core/scaffold/template.ts` (1.2a's renderer) | `package_scope` |
| `packages/cli/src/core/compose/files.ts` | `NEUTRAL_VARS.package_scope` |
| `packages/cli/src/commands/new.ts` | `--scope` |
| `packages/cli/src/schemas/config.ts` | `Settings.packageScope` |
| `packages/cli/src/core/validate/` | `template-version` check |
| `packages/cli/tests/registry.test.ts`, `tests/new.test.ts`, `tests/validate.test.ts` | Composition, scope and version tests |
| `packages/cli/registry/runs.json`, `plans/runs/` | One bench record and note per fragment |
| `packages/cli/README.md`, repo `AGENTS.md` | Fragment table; the variable |

## Acceptance tests

- For each new fragment and each bundled stack it applies to: `new <stack> --with <fragment> --no-launch --json` succeeds, writes no file outside the project, runs no command (recording shim on `PATH`), and the manifest's steps carry layers; `validate` reports zero warnings.
- For each new fragment, the ledger holds a `pass` record whose `with` includes it (asserted by `tests/registry.test.ts`).
- `release-binary`'s shipped install script, run by its own verify against a fixture archive and a wrong checksums file, exits non-zero and moves nothing.
- `release-go` and `release-binary` together on `go-cli`: `ComposeConflict` reason `conflicts`.
- `new go-cli --scope @acme` renders `{{package_scope}}` as `acme`; `--scope Acme/x` is `BadInput`; `Settings.packageScope: "acme"` with no flag gives the same render; the flag wins over the setting; with neither the value is empty.
- An entry with `schemaVersion: 1` whose template uses `{{package_scope}}`: `validate` error `template-version`. With `schemaVersion: 2`, an older-CLI fixture that only knows v1 skips it with one warning (the existing Schema versions rule).
- `fingerprint` of a composition is the same with and without `Settings.packageScope` set.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- Every fragment in the table has landed under the proof rule, or the ones that didn't are listed in this file's status line with the reason.
- D28 is agreed, or `package_scope` and `release-npm` are left out and the status line says so.

## What this plan may get wrong

- Default-preset bench runs install and build more than sandbox runs. If a release or deploy run hits the bench's time cap, raise `--max-minutes` for that run in its note rather than shrinking the proof rule.
- Using `schemaVersion: 2` for "uses a newer template variable" ties the entry version to the variable set. If more variables follow, a per-variable `minCli` on entries may be cleaner; that is a D18 change.
- macOS signing can't be proved by a bench run without the maintainers' certificates. The fragment proves the unsigned path and the prose; a signed release is the generated project's maintainers' job.
