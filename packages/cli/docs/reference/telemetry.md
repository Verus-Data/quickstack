# Telemetry

There is no official telemetry endpoint configured in this release. Source builds never collect, even if a URL is configured. A release build with a configured endpoint uses opt-out consent: the first enabled invocation shows a notice and queues nothing. It creates an install id only when a later invocation records an event. Collection must remain off until the privacy page and launch checks in phase 4.1e are complete.

Turn it off with `stacks telemetry disable`. This works in scripts and under agents. It saves `"telemetry": false` and removes pending events, install identity, project links and backoff, retaining the notice. `telemetry enable` requires a person with terminal stdin. `telemetry reset` rotates the identity and clears pending events and project links without changing consent. `telemetry status --json` reports the consent reason, notice time, persisted identity when present and queued event count. `telemetry flush --json` attempts one batch with a five-second deadline; `stacks schema telemetry` describes all telemetry command results.

Every command accepts `--no-telemetry` to skip one invocation while retaining queued events. `--offline` and `STACKS_OFFLINE=1` also retain them without recording or sending anything. Set `DO_NOT_TRACK` or `STACKS_TELEMETRY_DISABLED` to any value except empty, `0` or `false` to disable collection; any set `CI` disables it too. Standing opt-outs delete pending events at flush. Invalid settings preserve pending events without sending them. `STACKS_TELEMETRY_DEBUG=1` prints validated events to stderr instead of queuing or sending, subject to the same consent checks. `STACKS_TELEMETRY_URL` overrides the endpoint for development; the sender posts its own batch to `<url>/v1/events` and executes nothing it reads.

The client records `new`, `add`, `show`, scaffold errors and verify outcomes. Entry names are sent only for trusted bundled or official index content; other names become `custom`. Non-official use is counted by origin. The fingerprint is included only for entirely official compositions. Verify reports the whole run outcome, five duration buckets and names allowlisted when official entry steps were added. Fresh clones have no telemetry project link. Install and telemetry project ids are separate random UUIDs; the manifest project id is never transmitted.

Never sent: paths, directory or project names, git remotes, usernames, hostnames, environment variable values, decision answers, brief or NOTES text, file contents, command lines, output tails, custom entry ids, or anything from offline runs. The client has no dependency telemetry in schema v1.

State lives under `<stacks state directory>/telemetry/` (`STACKS_STATE_DIR`, otherwise `$XDG_STATE_HOME/stacks`). Directories are created with mode `0700` and files with `0600`: `notice.json`, `install.json`, `projects/<manifest-id>.json`, `spool/<event-id>.json` and `flush.json`. Project links expire after 365 days; queued events after seven days. The spool retains the newest 500 events. Flush claims at most 50 by atomic rename into `claims/<uuid>/`; interrupted attempts return their claims, and later attempts recover claims older than ten minutes. Only a valid 202 response whose rejected ids belong to the batch removes events. Failure retains events with ten-minute backoff, or the server's `Retry-After`. Automatic flushes before handoff and after verify use an 800 ms HTTP deadline. Spool and network failures never change command output or exit status.

The human and agent notice appears on stderr. JSON results gain one optional `notice` field. A pending marker counts as notified only after output is delivered; abandoned markers recover after ten minutes. When stacks prints a notice, tell the user once, in one sentence, including how to disable telemetry. Do not enable it for a user from an agent.

The whole automatic flush has an 800 ms budget, with interrupted claims returned before completion. Backoff is checked before maintenance; project expiry advances through 50 records per eligible flush using a cursor in `flush.json`. A known expired project is excluded from verify events immediately. Reset reports `reset: false` if cleanup or rotation cannot finish. Disable saves the opt-out even if cleanup fails, and then reports `cleared: false`; neither control command claims successful deletion when state is unwritable.

## Schema v1 field readers

| Field | Reader |
| --- | --- |
| `schemaVersion` | Ingest schema selection (4.1b) |
| `eventId` | Ingest idempotency (4.1b) |
| `type` | Event routing (4.1b) |
| `installId` | Distinct installs and per-install caps (4.1b, 4.2a) |
| `projectId` | Distinct projects (4.2a) |
| `cliVersion` | Released-version check and release counts (4.1b, 4.1d) |
| `os` | Platform failure counts (4.1d) |
| `nodeMajor` | Node line failure counts (4.1d) |
| `agent` | Per-agent green rate (4.2a) |
| `sentAt` | Event retention windows (4.1b, 4.2a) |
| `stack` | Stack projects and green rate (4.2a) |
| `fragments` | Fragment attach rate (4.2a) |
| `without` | Without rate (4.2a) |
| `preset` | Per-preset green rate (4.2a) |
| `targetAgents` | Adapter target share (4.1d) |
| `handoff` | Entry-point share (4.2a) |
| `source` | Entry-point share (4.2a) |
| `origin` | Index reach (4.1d) |
| `nonOfficial` | Non-official use counts (4.1d) |
| `fingerprint` | Per-composition green rate (4.2a) |
| `kind` | Show pick rate (4.2a) |
| `id` | Show pick rate (4.2a) |
| `command` | Failed scaffold share (4.2a) |
| `code` | Failure spikes per release (4.1d) |
| `scope` | Verify scope (4.2a) |
| `outcome` | Green rate (4.2a) |
| `tamperCheck` | Verify trust coverage (4.2a) |
| `steps` | Step failures and environment blockage (4.2a) |
| `stepsChanged` | Changed-step share (4.2a) |
| `secondsSinceScaffold` | Time to green (4.2a) |
| `secondsToFirstTestPass` | Time to first test (4.2a) |
