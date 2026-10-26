# Phase 3.5b: The two-phase brief

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | `new <app> <dir>` composes the app's base stack and the app (3.5a), writes a two-phase brief (phase one takes the stack to green with its own verify; phase two builds the app slice, whose verify steps are appended to the manifest and digested from the start), and `verify` reports each phase. One bundled chat-style app proves it with tests that need no model-provider key |
| Traces to | The developer who starts projects often: "I want it set up the way I'd set it up myself"; assumption 1 (brief size): splitting a brief into two bounded phases is the other tool against brief growth besides the budget; the coding agent's frustration with "ambiguity" |
| Depends on | [3.5a](phase-3.5a-app-entry-kind.md) (the app kind and its composition), [1.2b](phase-1.2b-manifest-state-and-detection.md) (the manifest and `digestSteps`), [1.3a](phase-1.3a-verify-runner-and-probes.md) (the step runner), [1.3b](phase-1.3b-tamper-detection-and-run-records.md) (the tamper check and `RunRecord`), [1.5](phase-1.5-validate-and-brief-budget.md) (budgets), [2.0b](phase-2.0b-bench.md) (the bench run that proves the bundled app), [2.0c](phase-2.0c-run-ledger.md) (the ledger key) |
| Blocks | Nothing. [3.3b](phase-3.3b-bundled-stack-expansion.md) may use it for a stack whose proving slice won't fit D5 |
| Decisions needed | D26 (app entries and the two-phase brief), an amendment to D18. D5 (budgets per phase, below). D14 unchanged: app steps are in the digest |
| Settles | How the two phases are briefed, digested and verified; budgets per phase; the manifest and run-record version consequence; the bundled `chat-app` |

## Scope

In:

- `new <app> <dir>` with every `new` flag; `--with` and `--without` apply to the base stack's fragments.
- The two-phase brief: `.quickstacks/BRIEF.md` (phase one) and `.quickstacks/BRIEF-APP.md` (phase two), both written by `new`.
- Manifest steps with a `stage` (`"stack"` or `"app"`), digested at `new`.
- `verify` per stage: app steps don't run until every stack step passes; green needs both.
- The `app-budget` and `app-layers` checks.
- One bundled app, `chat-app`, on `python-react`.

Out:

- Model-provider credentials in any verify step. The bundled app's real-provider smoke step is tagged `prod`, skipped by default and under `--sandbox`.
- A CLI command that renders phase two later. Both briefs are written at `new`, so the CLI still writes once and runs nothing (D2).
- An app id on telemetry events. Events name the stack only; an `app` field needs a metric that reads it and a telemetry schema version, so it waits until app usage is worth measuring.
- Any CI wiring (D23).

## Design

### Where this fits

3.5a made apps a format the CLI reads and composes. This sub-phase writes an app project. Splitting into two phases keeps each brief within its budget, and the stack phase reaching green first means a broken app slice is never confused with a broken stack.

### The two briefs

| File | Contents | Budget (D5) |
|---|---|---|
| `BRIEF.md` | The stack's brief exactly as `new <stack>` with the same fragments would render it, plus one fixed section at the end: "This project continues as an app. When `verify` reports the `stack` stage green, read `.quickstacks/BRIEF-APP.md` and continue there. Don't start the app before then." | The stack's existing composed cap (5,000; 6,500 with one optional fragment), unchanged |
| `BRIEF-APP.md` | Fixed phase-two ground rules (the same no-weakening rules as phase one, including what to do on `VerifyChanged`), the app body, its decisions and commands, and the app's verify table | App body at most 2,000 words; the composed phase-two brief at most 3,000, fixed text included |

Both are rendered with 1.1's renderer and counted with `countWords`. `new --json` reports `briefWords` and `appBriefWords`, both numbers. Conditional prose in the app body can use `stack=`, `with=` and `mode=` as in fragments.

### Manifest and the digest

Each `ManifestStep` gains `stage: "stack" | "app"`. The manifest gains `app: NullOr(EntryRef)`. Both are new fields, so the manifest's `schemaVersion` becomes 2 for app projects; a CLI that reads version 2 without knowing it fails `InvalidConfig` with the "upgrade quickstacks" message (the existing rule). `digestSteps` covers `stage` with the other step fields ([Trust model](../roadmap.md#trust-model) point 5 lists `stage`), and app steps are digested at `new` like every other step. An agent that edits an app step fails `VerifyChanged` the same way as a stack step.

### Verify by stage

`verify` runs the `stack` stage in the usual phases. If any stack step fails, app steps are `skipped` and the outcome is `failed` as usual. If the stack stage passes, the `app` stage runs (its own setup, check, serve and teardown phases, after the stack's teardown). The result gains `stages: { stack: Outcome, app: Outcome | null }`. `green` needs both stages green; a run where the stack stage is green and the app stage hasn't been started by the agent yet is `failed` with the app steps' failures, and the human `Next:` line for that case points at `BRIEF-APP.md`. `RunRecord` gains the optional `stages` field (no version bump under the run-record rule). `firstGreenAt` means the whole project; the record also keeps `firstStackGreenAt`.

The ledger keys app runs by app id: `LedgerKey` gains an optional `app`, and 2.0b's bench takes an app id wherever it takes a stack.

### `validate` rules

| Check | Severity | Rule |
|---|---|---|
| `app-budget` | error | App body over 2,000 words, or the phase-two brief over 3,000 |
| `app-layers` | warning | The app's own steps include at least one `test`-layer step, and a `serve` step with a probe when the app adds a server (D7 applied to the app slice) |

### The bundled `chat-app`

On `python-react`: a chat UI and an API route that streams a reply from a model provider behind one provider interface. The interface has a stub implementation selected by environment, which the app's tests and its `serve` probe use, so verify needs no key and makes no network call. A `prod`-tagged smoke step calls the real provider when a key is present and is skipped by default and under `--sandbox`. Proving slice: send a message, see a streamed reply from the stub, one API test, one component test, one end-to-end test against both dev servers.

### Trust

Nothing changes in the trust model beyond `stage` in the digest. The CLI still runs nothing it reads (point 1): both briefs are written by `new`; `verify` runs only manifest steps. An untrusted app gets the stop-and-confirm section at the top of both briefs.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/core/brief/render.ts`, `text.ts` | `BRIEF-APP.md`, the phase-one handover section |
| `packages/cli/src/schemas/manifest.ts`, `src/core/manifest.ts` | `stage`, `app`, `schemaVersion: 2`, `digestSteps` covers `stage` |
| `packages/cli/src/core/verify/` | Stage ordering, `stages` in the result |
| `packages/cli/src/schemas/verify.ts`, `src/schemas/ledger.ts` | Optional `stages`, `firstStackGreenAt`; optional `app` on `LedgerKey` |
| `packages/cli/src/core/validate/` | `app-budget`, `app-layers` |
| `packages/cli/src/commands/new.ts`, `src/schemas/new.ts` | `new <app>`; `appBriefWords` |
| `packages/cli/registry/applications/chat-app/` | `APP.md`, `files/` |
| `packages/cli/tests/apps.test.ts`, fixtures | Extended |
| `packages/cli/registry/runs.json`, `plans/runs/` | The `chat-app` bench record and note |
| `packages/cli/README.md`, repo `AGENTS.md` | The two briefs, stages |

## Acceptance tests

- `new chat-app <tmp> --sandbox --no-launch --json`: writes the stack's and the app's files, both briefs, a manifest at `schemaVersion: 2` with `app` set and every step staged; runs no command (recording shim); `briefWords` equals what `new python-react --sandbox` reports plus the fixed handover section; `appBriefWords` is under 3,000.
- Editing an app step's `run` makes `verify` exit 5 `VerifyChanged` naming that step.
- A fixture where stack steps fail: app steps are `skipped`, `stages.app` is `null`. Stack green and app failing: outcome `failed`, `stages.stack: "green"`, the human `Next:` line names `BRIEF-APP.md`. Both green: `green`, and `firstGreenAt` and `firstStackGreenAt` both set.
- An older-CLI fixture that knows only manifest v1 fails `InvalidConfig` with the upgrade message on a v2 manifest.
- `validate` fixtures for `app-budget` and `app-layers`, each giving exactly its finding.
- `chat-app`'s tests, run in its own verify, pass with no provider key in the environment and no outbound network (the test layer blocks non-local hosts).
- The ledger holds a `pass` record keyed by `app: "chat-app"` from a 2.0b bench run.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- D26 agreed; the roadmap's trust model point 5 lists `stage`, and the Schema versions table records manifest v2 for app projects and app entries at v3.
- One green bench run of `chat-app` recorded with its note.

## What this plan may get wrong

- Writing phase two at `new` means the app brief can't react to what the agent built in phase one. That is the point (the CLI writes once), but if agents routinely need stack-specific facts the app brief lacks, the fix is better app prose, not a second render.
- A manifest version bump this early means every project from an app needs a CLI with this sub-phase. Projects from plain stacks stay at version 1, so this only affects app users.
- Agents may start the app before phase one is green despite the handover line. Verify's stage ordering keeps the result honest; the bench notes show whether the wording needs work.
- The stub-provider rule proves the app's plumbing, not the provider integration. The `prod` smoke step is where that lives, and it runs only by hand.
