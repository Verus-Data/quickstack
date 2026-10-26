# Phase 4.1a: Usage telemetry, CLI side

Status: DRAFT 2026-10-26 (not agreed). Phase 4.1 is split in two: this file is the
client in the CLI; [4.1b](phase-4.1b-telemetry-ingest-api.md) is ingest in the API. They share the event
schema in `packages/format` and ship in the same CLI release.

| Field | Value |
|---|---|
| Goal | If the maintainers agree to collect usage (D17), the CLI records anonymous `new`, `add` and `verify` events, tells the user before anything is sent, honors every standard off switch, and has no visible effect on any command's stdout, `--json` output, exit code or timing beyond a bounded flush |
| Traces to | "None of these are collected today. The stack directory plan proposes telemetry for the first two." Success rows 1 and 2 across users, and row 5 ("People write their own") as a count of `custom` entries. Assumption 5 ("Watch whether people use `new` from a terminal or ask their agent to run it"), which is D9's instrumentation. The trust job: "the user wants to start work in a project they don't have to audit first" |
| Depends on | 4.0a (event schema home in `packages/format`, an endpoint host), D17 (consent model, proposed), open question 5 in 10 |
| Blocks | 4.1b can be built in parallel; 4.2 needs both |
| Decisions needed | D17. If the maintainers decline telemetry altogether, this sub-phase and 4.1b are dropped and 4.2 shrinks to publishing canary results |
| Decisions or questions this settles | Event contents and the never-sent list; identity; consent order; the spool; failure isolation |

## Scope

In:

- A `Telemetry` service with one non-failing entry point used by `new`, `add` and `verify`.
- Consent resolution and `quickstacks telemetry status|enable|disable|reset [--json]`.
- A first-run notice, and no sending on the run that shows it.
- Random install and per-project ids stored outside the project.
- A spool with caps, a bounded flush, backoff, and a debug mode.
- The brief's one-line instruction to relay the notice.

Out:

- Dependency snapshots or any data read from the project's files (roadmap, Won't have).
- Events from `list`, `show`, `validate` or `doctor`. `show` lookups add little to the success measures and widen what's sent.
- Any project-local fallback when the home directory is read-only. Those runs send nothing (see Identity).

## Design

### Consent (D17, proposed)

| Option | For | Against |
|---|---|---|
| Opt-out with protections: notice first, nothing sent on the notice run, standard switches, off in CI and source builds | Enough projects to compute green rates with the 4.2 minimums (20 attempted projects per stack per window); the standard pattern for developer CLIs; the published schema makes it auditable | A harder trust sell for a tool that hands a repo to an agent; most runs start inside an agent, so the user may never read the notice unless the agent relays it |
| Opt-in (`telemetry enable` or a config key) | No trust cost; easy to explain | Collection rates for opt-in CLI telemetry are typically a small fraction of users, so 4.2's thresholds would likely never be met and the success table stays one-machine |

Recommendation: opt-out with the protections below, and only in a release whose README and schema page describe it. If the maintainers pick opt-in, keep this design (consent order changes one default) and rescope 4.2 to publish canary results only.

Consent is resolved in this order, first match wins, and `telemetry status --json` prints the reason:

| Reason | Cause |
|---|---|
| `flag` | `--no-telemetry` on this command |
| `offline` | `--offline` or `QUICKSTACKS_OFFLINE=1` |
| `do_not_track` | `DO_NOT_TRACK` set to anything but empty, `0` or `false` |
| `environment` | `QUICKSTACKS_TELEMETRY_DISABLED`, same rule |
| `config` | `"telemetry": false` in `config.json` |
| `config_invalid` | `config.json` fails to decode: off, since the user may have been turning it off |
| `ci` | `CI` set to any value |
| `source_build` | Not a release build (the build defines a constant; tests, `bun run dev` and the compiled test binary are never release builds) |
| `home_not_writable` | The state directory can't be written |
| `not_notified` | Enabled, but the notice has not been shown yet: this run shows it and queues nothing |
| `enabled` | None of the above |

All env reads happen in `config.ts`. `Settings` gains `telemetry: Schema.optional(Schema.Boolean)`.

### Notice

On the first run where consent would be `enabled`, the CLI writes the notice to stderr (human mode) or into the result as `notice` (JSON mode, as an additive field) and records `notice.json` with an exclusive create, so two concurrent first runs can't both treat themselves as notified. That run queues nothing. The notice names what's collected, links the schema page, and gives the off switch in one command. The brief built by 1.1 gains one ground rule: "If quickstacks printed a telemetry notice, tell the user once, in one sentence, including how to turn it off."

### Identity

| File (under `$XDG_STATE_HOME/quickstacks/telemetry/`) | Holds |
|---|---|
| `install.json` | `{ installId }`, a random UUID |
| `notice.json` | When the notice was shown |
| `projects/<projectKey>.json` | `{ telemetryProjectId, scaffoldedAt, stack, fragments, steps }`, where `projectKey` is the manifest's project id from 1.3 and `telemetryProjectId` is a separate random UUID |
| `spool/` | Queued events |
| `flush.json` | Backoff and `Retry-After` state |

Nothing is written into the project for telemetry, so a public repo's manifest can't be linked to events: its project id appears nowhere in what's sent. A fresh clone on another machine has no project file, so its verify events carry no project link and count only toward step totals. If the state directory can't be written, nothing is sent at all. Sandboxed agents often block writes outside the project; sending with an id that can't be persisted would turn every verify into a new project and corrupt the per-project counts. Those runs are lost by design, and 4.2 shows the no-verify share so the loss is visible.

### Events

Envelope on every event: `schemaVersion`, `eventId` (UUID, the server's idempotency key), `type`, `installId`, `projectId` (the telemetry project id, absent when unknown), `cliVersion`, `os` (`darwin`, `linux`, `win32`, `other`), `nodeMajor`, `agent` (the detected calling agent from 1.4, or `none`), `sentAt`.

| Type | Adds |
|---|---|
| `new` | `stack` (id, or `custom` for anything not from the official index or bundled set), `fragments` (same rule), `without` (removed default fragments), `preset`, `targetAgents`, `yes`, `handoff` (`inside_agent`, `launch`, `print`), and `fingerprint` only when every entry is official |
| `add` | Same as `new`, plus `existingRepo` (no manifest before this run) |
| `verify` | `scope` (`full`, `partial`), `outcome` (1.3's values: `green`, `partial`, `failed`, `changed`, `interrupted`; "env blocked" is not sent, the server derives it from a `failed` run whose failing steps all have `failureKind: "env"`), `steps` (each `{ name, phase, status, failureKind?, duration }`, names sent only if they were in the steps recorded at scaffold time, otherwise `custom`; duration bucketed to 5s, 30s, 2m, 10m, longer), `stepsChanged` (count), `secondsSinceScaffold` |

`outcome` uses the 1.3 vocabulary. Only `green` (a full run, every non-skipped step passed, steps unchanged) counts as green anywhere downstream.

Never sent: paths, directory or project names, git remotes, usernames, hostnames, environment variable values, decision answers, brief or NOTES text, file contents, command lines, output tails, custom entry ids, and anything from `--offline` runs. This list goes in the README and on the schema page, and it is a promise: adding a field that breaks it is a new consent question, not a code change.

### Spool and flush

Each event is one JSON file in `spool/`, written by temp file and rename. Caps: 500 files and 7 days, oldest dropped first. At the end of `new`, `add` and `verify` (for `new` and `add`, after the scaffold is written and before handoff, because a launched agent session can last hours), the CLI claims up to 50 events by renaming them into a per-process directory, posts them with an 800 ms deadline, and deletes them only on a `202` whose rejected ids are a subset of those sent. Everything else returns them to the spool and records backoff (10 minutes, or the server's `Retry-After`). A claimed directory older than 10 minutes is returned by the next flush.

`QUICKSTACKS_TELEMETRY_DEBUG=1` prints each event as JSON to stderr instead of queuing it. `QUICKSTACKS_TELEMETRY_URL` points sending at another server, for tests and local runs.

### Interfaces

```ts
// packages/cli/src/telemetry/index.ts
export class Telemetry extends Context.Service<Telemetry, {
  readonly consent: Effect.Effect<Consent>;
  readonly recordScaffold: (input: ScaffoldFacts) => Effect.Effect<void>; // never fails
  readonly recordVerify: (report: VerifyReport) => Effect.Effect<void>;   // never fails
  readonly flush: Effect.Effect<void>;                                    // never fails, bounded
}>()("quickstacks/Telemetry") {
  static layer: Layer.Layer<Telemetry, never, FileSystem.FileSystem | Path.Path | HttpClient | AppConfig | Clock.Clock>;
  static recording: () => { events: TelemetryEvent[]; layer: Layer.Layer<Telemetry> }; // tests
}
```

Every method is wrapped in `Effect.catchCause` at this boundary and logs only at debug level. This is the one documented place where an error is deliberately swallowed, because a telemetry failure is never the user's problem. The file says so at the top.

### Failure isolation

| Fault | Visible effect |
|---|---|
| Server down, slow, 500, 403, 400 | None beyond at most 800 ms once per backoff window |
| Spool directory unwritable | None; event dropped |
| Bug inside event building | None; logged at debug |
| Interrupt during verify | The partial verify event is spooled synchronously before teardown; flushed only if time allows |

Telemetry never writes to stdout, never changes an exit code, and never adds warnings to `--json` output. The one additive JSON field is `notice` on the notice run.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/format/src/telemetry.ts` | `TelemetryEvent` schema (shared with 4.1b) and its JSON Schema export |
| `packages/cli/src/telemetry/` | `index.ts`, `consent.ts`, `ids.ts`, `events.ts`, `spool.ts`, `client.ts` |
| `packages/cli/src/commands/telemetry.ts` | `status`, `enable`, `disable`, `reset` |
| `packages/cli/src/commands/new.ts`, `add.ts`, `verify.ts` | Hook points |
| `packages/cli/src/config.ts`, `schemas/config.ts` | Switches and `telemetry` setting; `XDG_STATE_HOME` path if 1.3 hasn't added it |
| `packages/cli/scripts/build.ts` | Release-build define |
| `packages/cli/src/core/brief.ts` | Notice-relay rule |
| `packages/cli/README.md` | What's sent, what's never sent, how to turn it off |

## Acceptance tests

Against a real local HTTP server that records requests and can be told to hang, 500 or reject ids.

- Consent table: one test per row, driven by env and config in the test helper; `telemetry status --json` reports the expected reason.
- First enabled run prints the notice and the server receives nothing; the second run's flush delivers the queued events.
- With the server hanging, `new --json` stdout and exit code are byte-identical to a run with telemetry disabled, and the command finishes within 1 second of the disabled run.
- A recording sink that throws: every command's output and exit code are unchanged.
- An event never contains the project directory name, the manifest project id or any custom entry id (property test over random project names and custom ids, scanning the serialized event).
- A step added by hand to the manifest is sent as `custom`.
- Spool caps: 600 queued events become 500, oldest gone; events older than 7 days are dropped.
- Two processes flushing at once never send the same event twice (server sees each `eventId` once).
- `CI=1`, `DO_NOT_TRACK=1` and a source build each send nothing and create no telemetry files.

## Exit criteria

- D17 decided. Acceptance tests pass; `bun run check` green from the repo root.
- `QUICKSTACKS_TELEMETRY_DEBUG=1` output for a real `new` and `verify` matches what 4.1b stores.
- The README section and the schema page exist before the release that enables collection, and that release is the first to collect (no version collects silently).

## What this plan may get wrong

- Losing every run from a read-only home may lose most agent-sandboxed runs, and those skew toward failures. If the no-verify share is high, revisit a project-local queue, accepting the complexity it brings.
- `handoff` alone may not answer D9: a user who asks their agent to run quickstacks and one who runs `new` in a terminal inside an agent session look the same. The `agent` field plus `handoff` is the best cheap signal.
