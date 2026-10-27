# Phase 4.1e: Telemetry launch and runbook

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | A maintainer can take telemetry from an empty account to live collection in one written procedure, with a check at every step, and a CLI that turns collection on is published only after the server has accepted, stored and maintained real events; the same document is the runbook for alerts, exclusions and rollback |
| Traces to | The trust job: "the user wants to start work in a project they don't have to audit first", which here means the privacy promise is live and checked before the first event is sent. "None of these are collected today" |
| Depends on | [4.1b](phase-4.1b-telemetry-ingest-and-storage.md), [4.1c](phase-4.1c-telemetry-maintenance-and-retention.md), [4.1d](phase-4.1d-telemetry-integrity-and-alerts.md) (everything the procedure deploys and checks), [4.0e](phase-4.0e-official-names-and-directory.md) (the signed `names.json` it deploys, and `build:index --check`), [1.6c](phase-1.6c-first-release.md) (the manual release procedure the enabling release follows until 5.0's workflow exists), D16, D17 |
| Blocks | The CLI release that ships 4.1a with collection enabled; [4.2a](phase-4.2a-stats-rollup-and-routes.md) has nothing to publish before it |
| Decisions needed | D17 (if declined, this file is dropped). D16 decides the provisioning commands; this file assumes Workers, D1 and R2. The alert destination (a choice for the maintainers, listed in the procedure) |
| Settles | The launch order, the reserved smoke install id, the production acceptance check, where alerts go, the read-only queries for the internal tables, and what a rollback does to clients |

## Scope

In:

- The procedure and runbook in `packages/api/README.md` ("Telemetry launch" and "Telemetry runbook").
- A migration adding the reserved smoke install id to `exclusions`.
- `packages/api/scripts/smoke.ts`: posts the fixed smoke event and checks it, used by hand here and by 5.2's post-deploy step.
- `packages/api/scripts/queries/`: the read-only SQL files the runbook names.
- The production acceptance check, run once by a maintainer and recorded in a run note.

Out:

- CI deploys and CI smoke checks (5.2 runs `smoke.ts` after a CI deploy).
- Any new route, table column or client behaviour. A gap found here goes back to the sub-phase that owns it.
- Publishing stats (4.2a, which waits for its own gate).

## Design

### Where this fits

4.1a to 4.1d build and test every part locally. Nothing has yet been deployed against a real database, a real archive bucket and a real secret, and the client release that enables collection is the one step that can't be taken back for the copies already installed. This sub-phase is the order of operations and the checks between them, written so a maintainer runs it once at launch and again after any rebuild of the account.

### The order rule

Collection is live on the server before any release enables it on clients. A release that enables collection against a server that isn't accepting yet doesn't lose data (4.1a keeps the spool on any non-202), but its users' first events then sit for up to 7 days and are dropped by the spool cap, and the notice has promised a page that may not exist. So the server goes first, is proven with a released CLI build, and only then is the enabling release published.

### Launch procedure

Each step has a check; a failed check stops the procedure.

| # | Step | Check |
|---|---|---|
| 1 | Create the D1 database and the private R2 bucket; bind both in `wrangler.jsonc` | `wrangler d1 list` and `wrangler r2 bucket list` show them; the bucket has no public access and no custom domain |
| 2 | Apply remote migrations (`wrangler d1 migrations apply --remote`), including this sub-phase's smoke-id migration | `scripts/queries/tables.sql` lists every table from 4.1b, 4.1c and 4.1d; `exclusions` holds the smoke id |
| 3 | Deploy the API to its `workers.dev` address, with the index from [4.0c](phase-4.0c-registry-index.md) and `names.json` from [4.0e](phase-4.0e-official-names-and-directory.md), before the secret exists | `GET /v1/names.json` verifies with `build:index --check` (which checks `index.json` and `names.json`, 4.0e); `GET /healthz` returns 200 with `maintenanceFresh: false` (no run yet); `bun run --cwd packages/api smoke -- --host https://<worker>.workers.dev` gets 503 from `/v1/events` (secret missing, 4.1b) |
| 4 | Set `NETWORK_HASH_KEY` with `wrangler secret put` from a freshly generated 32-byte random value, stored in the maintainers' password manager | The same smoke run now gets 202 with `rejected: []`, and both events are stored `excluded_install` |
| 5 | Attach the API domain chosen under D16 | `GET /healthz` on the domain returns 200 |
| 6 | Confirm anonymous JSON POSTs reach the Worker on the domain: no bot challenge, WAF rule or "under attack" mode on `/v1/events` | `curl -X POST -H 'content-type: application/json' --data '{"events":[]}' https://<host>/v1/events` returns the 400 `BadInput` envelope from the Worker, not an HTML challenge page |
| 7 | Wait for one scheduled run (or trigger it once from the dashboard) | `scripts/queries/state.sql`: `official_names` and `released_versions` non-empty, one `registry_snapshots` row, `last_success` set; `/healthz` reports `maintenanceFresh: true` |
| 8 | Ingest smoke on the domain: `bun run --cwd packages/api smoke -- --host https://<host>` | 202 with `rejected: []`; both events stored with `excluded = 'excluded_install'`; no `projects` row for the smoke id |
| 9 | Production acceptance (below) | All of its checks pass; a run note is written |
| 10 | Route alerts (below) | A `test` flag raised with `scripts/queries/test-flag.sql` reaches the destination within an hour |
| 11 | Publish the CLI release that enables collection, by the current release procedure ([1.6c](phase-1.6c-first-release.md), or [5.0](phase-5.0-ci-release-and-checks.md)'s workflow once it exists) | `npx quickstack@<version> telemetry status --json` on a clean machine reports `not_notified`, then `enabled` after one run |

The secret is set after the first deploy on purpose: the 503 before it and the 202 after it prove that ingest refuses to store unhashed networks and that the secret is the one the Worker reads. The domain and its security settings come last, once the Worker itself is known to work.

### Reserved smoke install id

`00000000-0000-4000-8000-000000000001`. A migration inserts it into `exclusions` as kind `install` with reason `smoke`, so 4.1b stores every event from it excluded and it never builds a project or reaches a metric. `smoke.ts` posts one fixed `new` event and one fixed `verify` event from it with fresh event ids and a `cliVersion` that is a published version of `quickstack` (the latest, read from the npm registry), so it is in `released_versions` once 4.1c has run and the stored reason is `excluded_install` by the exclusions rule alone; 4.1b's precedence puts `excluded_install` first in any case, then reads them back through `scripts/queries/smoke.sql` (run with `wrangler d1 execute --remote`, not through any route) and checks they were stored excluded. 5.2 runs the same script after every CI deploy. A real client can't produce this id: 4.1a generates random v4 UUIDs, and the id's random bits are all zero.

### Production acceptance

Run once by a maintainer with the release build that will enable collection, before it is published (step 9), from a throwaway home (`HOME`, every `XDG_*` pointed into a temp directory) on a machine that isn't a CI runner and with `DO_NOT_TRACK` unset:

1. `telemetry status --json` reports `not_notified`.
2. `new go-cli <dir> --sandbox --no-launch --json`: the notice appears in the result; `telemetry status --json` reports no `installId` and `spooled: 0`, so nothing was queued and nothing can have been sent.
3. `verify --json` in that directory. Its own flush sends the verify event, so nothing is left to flush by hand: `telemetry status --json` reports an `installId` and `spooled: 0`, and `scripts/queries/recent.sql` filtered to that install id and the last 5 minutes shows exactly one `verify` event and no `new` event.
4. With `QUICKSTACK_TELEMETRY_DEBUG=1`, one more `verify`: the printed event equals the row step 3's query shows, field for field, apart from the server-side columns and the event id.
5. The next scheduled run's archive object for that day (once it is older than 7 days, or with the archive step run by hand against a test day) contains no `network_hash` key.
6. `telemetry disable`: the local spool and ids are gone; one more `verify` sends nothing.
7. The acceptance install id is added to `exclusions` with reason `acceptance`, so the run never counts.

The note goes in `plans/runs/<date>-telemetry-acceptance.md` with the CLI version, the API commit and each check's result.

### Alert routing

4.1d writes one log line with an `alert` field per run that raised a flag. The maintainers pick one destination: the platform's log push to a log service with an alert rule on `alert` being present, or a log-tail consumer that opens a GitHub issue in this repo. Either way the rule is "any line with `alert`", not a parse of its contents. A separate external uptime check polls `/healthz` every 5 minutes and alerts on non-200 or `maintenanceFresh: false`, which catches a dead cron that can't log anything. Both are host configuration, written down here with the exact settings once chosen.

### Runbook

| Situation | What to do |
|---|---|
| `concentrated_contributor` or `sequence_spike` | Run `scripts/queries/contributors.sql` for the cell; if one install, network hash or ASN is clearly not real use, insert it into `exclusions` with a reason. The next scheduled run marks its rows and rebuilds `projects` (4.1d) |
| `error_spike` | Compare with the CLI release log; a broken release is fixed by a CLI patch, not by excluding data |
| `stale_success` or `lease_held_streak` | Check the scheduled handler's logs; trigger one run by hand. Nothing is deleted while it's down; it catches up (4.1c) |
| `names_refresh_failed` | Check `v1/names.json` with `build:index --check`; redeploy the index if it is missing or its signature fails |
| `recheck_backlog` | Usually a large exclusion; it drains at 500 pairs per run. If it doesn't shrink over three runs, investigate before adding more exclusions |
| Hash key leaked | Generate a new key, `wrangler secret put`, deploy. Hashes before and after can't be joined, which is the point; 4.2a's network counts are low for 30 days |

Read-only queries in `scripts/queries/` (each a single `SELECT`, run with `wrangler d1 execute --remote --file`): `tables.sql`, `state.sql`, `smoke.sql`, `recent.sql`, `contributors.sql`, `daily-metrics.sql` (last 14 days by metric), `flags.sql` (last 30 days), `origins.sql` (scaffolds by `origin` and `nonOfficial` kind, the "people write their own" count), `platforms.sql` (failures by `os` and `nodeMajor`, for D12 and D22), `target-agents.sql` (for 3.4b), and `test-flag.sql`, the one file that writes: it inserts 4.1d's `test` flag for today, which the next run reports. No route exposes any of this.

### Rollback

If the API must be rolled back or taken down after the enabling release: deploy the previous Worker version, or remove the route so `/v1/events` returns 404 or 503. Clients keep their spools (4.1a deletes only on a 202), so nothing is lost for up to 7 days, and flushes back off. Collection is never turned off by changing the server's answer; that's a CLI release with collection disabled, published the normal way, and a line on `/telemetry`.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/api/README.md` | "Telemetry launch" and "Telemetry runbook" sections |
| `packages/api/migrations/` | Smoke install id in `exclusions` |
| `packages/api/scripts/smoke.ts`, `package.json` (`smoke`) | New |
| `packages/api/scripts/queries/` | The read-only queries and `test-flag.sql` |
| `packages/api/tests/smoke.test.ts` | New |
| `plans/runs/` | The acceptance run note |
| `AGENTS.md` | Pending user actions: the launch steps not yet done |

## Acceptance tests

Locally, under the Wrangler local runtime with local D1 and R2:

- `smoke.ts --host http://localhost:<port>` against a migrated local database: 202, both events stored `excluded_install` with a `cliVersion` listed in `released_versions`, no `projects` row, exit 0. Against a database without the smoke-id migration: exit non-zero naming the missing exclusion. Against a Worker with no `NETWORK_HASH_KEY`: exit non-zero reporting the 503.
- Every file in `scripts/queries/` except `test-flag.sql` parses as one `SELECT` statement (a test runs each against the local database inside a read-only check that fails on any write).
- `test-flag.sql` followed by a scheduled run under the local runtime produces one `alert` line with a `test` flag.
- The launch steps run in order against the local runtime by a script in the test (minus the domain and bot-challenge steps 5 and 6): every check in the table passes, including the 503 before the secret and the 202 after it.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- The maintainers have run the procedure against production through step 10, with the acceptance run note in `plans/runs/`.
- The alert destination and uptime check are configured and written into the README.
- Only then is the enabling release published (step 11).

## What this plan may get wrong

- Step 6 depends on the host's default security settings, which change. The check is the point: an HTML challenge on `/v1/events` would silently drop every client batch into backoff.
- The acceptance run's install sends real events from a maintainer's network. Excluding its install id covers it; the network is also excluded for 30 days if the maintainer wants to be thorough.
- A maintainer reading the internal tables with `wrangler d1 execute` sees network hashes under 30 days old. That's within the privacy page's promise (hashes, never IPs) but it should be stated in the README's access note: only the maintainers hold the account.
