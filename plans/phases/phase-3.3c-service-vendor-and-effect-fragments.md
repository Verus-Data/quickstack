# Phase 3.3c: Service, vendor and Effect fragments

Status: DRAFT 2026-10-26 (not agreed). Re-scoped 2026-10-26: 1.6a ports the service,
vendor, Effect and tooling fragments into the catalog, so this file gives each a bench
proof under 3.3a's rule instead of authoring them; the fragment table below needs
reconciling with the catalog list in the roadmap's Feature gaps section

| Field | Value |
|---|---|
| Goal | The bundled registry gains the service, vendor and Effect fragments a stranger would expect from a curated catalog (D6), each landing only with a green bench run of a composition that includes it, under the proof rule in 3.3a |
| Traces to | Job 4: "add a known-good piece (CI, agent hooks, Postgres) without it overwriting what's there"; Job 1: "I want a project set up the way I'd set it up myself, with tests, lint, CI and agent config"; open question "Who is the bundled registry for?" |
| Depends on | [3.3a](phase-3.3a-release-and-deploy-fragments.md#the-proof-rule-for-a-new-bundled-entry) (the proof rule this file cites), [2.0b](phase-2.0b-bench.md) (bench runs; these fragments are proved under `--sandbox`), [2.0c](phase-2.0c-run-ledger.md) (the ledger), [2.2](phase-2.2-deterministic-rot-checks.md) (reference, import and dated-phrase checks on the new content), [1.6c](phase-1.6c-first-release.md) (the shipped format and stacks the fragments compose onto) |
| Blocks | [3.3b](phase-3.3b-bundled-stack-expansion.md) soft (where a new stack defaults to one of these fragments, such as `service-edge-sql` for `react-edge`) |
| Decisions needed | D6 (curated catalog) assumed; if the bundled set is the maintainers' own stack instead, these go to a user directory or a source. D5 and D7 apply unchanged. No format change: nothing here uses `{{package_scope}}` |
| Settles | Which service, vendor and tooling fragments join the bundled set, and in what order |

## Scope

In:

- Fragments, in landing order (each one a separate change with its own bench run):

| Fragment | `category` | `appliesTo` | What it gives the project |
|---|---|---|---|
| `service-postgres` | `service` | tags `api` | A local Postgres via a compose file, a migration tool chosen by the stack's runtime, a `db` layer of test that runs against the real database, never a mock |
| `service-edge-sql` | `service` | tags `api`, `web` | An edge SQL database with a local emulator for dev and tests, migrations, and the same real-database test rule |
| `vendor-analytics` | `vendor` | tags `web` | Product analytics behind a single wrapper module, off unless a key is set, never in tests |
| `vendor-auth` | `vendor` | tags `web`, `api` | A hosted auth provider behind one module, a test mode that needs no account, and a protected-route test |
| `effect` | `tooling` | tags `node`, `bun` | Effect services, layers and typed errors as the program structure, with the discovery step "read the installed package's exports before writing imports" instead of any API listing |
| `effect-schema` | `tooling` | tags `node`, `bun`; `requires: [effect]` | Schema at every boundary, decode unknown input, encode output, branded ids |

- A composition test per fragment against every bundled stack it applies to.
- The package README's fragment table rows for these fragments.

Out:

- Release and deploy fragments and `package_scope` (3.3a), new stacks (3.3b) and the agent harness fragment (3.4a).
- Any fragment that needs a paid account for `verify` to pass. A vendor or service fragment's verify uses the provider's local emulator or test mode; one with neither is not bundled.
- CI changes in this repo (D23).
- Dependency versions anywhere (D1, D3). Fragments name tools; agents choose versions.

## Design

### Where this fits

3.3a adds release and deploy fragments and defines the proof rule. This sub-phase adds the service, vendor and tooling pieces: Postgres is the one job 4 names, and the rest are what a stranger expects next. None of their categories is dropped by `--sandbox`, so each is proved with a sandbox bench run.

### Proof rule

[3.3a's proof rule](phase-3.3a-release-and-deploy-fragments.md#the-proof-rule-for-a-new-bundled-entry) applies unchanged. A fragment that can't meet it within the session stays on a branch; the next agent picks it up. Landing order is the table above.

### Content rules

1.6a's entry content rules apply unchanged: no versions, numbered Setup, configuration as intent, a default for every decision, verify steps that call project commands. Additional rules for these categories:

- A service fragment's tests run against the real service started locally; the prose says why a mock would make the green meaningless. The local service is started the way 1.3a allows long-lived processes to start, never from a setup step.
- A vendor fragment's code lives behind one module, so removing the fragment later is one deletion. Its verify runs in the provider's test mode or emulator and needs no account.
- The Effect fragments carry a discovery step instead of an API listing, so their prose doesn't age with Effect releases.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/registry/fragments/{service-postgres,service-edge-sql,vendor-analytics,vendor-auth,effect,effect-schema}/` | `FRAGMENT.md`, `files/`, `adapters/claude/` where needed |
| `packages/cli/tests/registry.test.ts` | Composition tests |
| `packages/cli/registry/runs.json`, `plans/runs/` | One bench record and note per fragment |
| `packages/cli/README.md` | Fragment table |

## Acceptance tests

- For each new fragment and each bundled stack it applies to: `new <stack> --with <fragment> --no-launch --json` succeeds, writes no file outside the project, runs no command (recording shim on `PATH`), and the manifest's steps carry layers; `validate` reports zero warnings.
- For each new fragment, the ledger holds a `pass` record whose `with` includes it (asserted by `tests/registry.test.ts`).
- `effect-schema` without `effect`: `effect` is pulled in by `requires`.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- Every fragment in the table has landed under the proof rule, or the ones that didn't are listed in this file's status line with the reason.

## What this plan may get wrong

- Six fragments is still a lot of bench time. If runs take longer than expected, land `service-postgres` first (job 4 names it) and leave the vendor fragments on a branch rather than shrinking the proof rule.
- Vendor and edge-database emulators change faster than the rest of a stack. Their prose has to stay at the level of "start the provider's local emulator", and 2.2's dated-phrase check is the tripwire.
