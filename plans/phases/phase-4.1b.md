# Phase 4.1b: Usage telemetry, ingest

Status: DRAFT 2026-10-26 (not agreed). Second half of phase 4.1; [4.1a](phase-4.1a.md)
is the client.

| Field | Value |
|---|---|
| Goal | `POST /v1/events` in `packages/api` accepts anonymous event batches, validates each event on its own, stores each event at most once, rewrites anything unofficial to `custom`, recomputes what the client claims, resists stuffing, keeps no raw IP, and prunes raw events on a schedule |
| Traces to | "None of these are collected today." Success rows 1, 2 and 5. The trust job: "the user wants to start work in a project they don't have to audit first", which here means the server must not hold more than the client promised to send |
| Depends on | 4.0a (the API package, the platform layer per D16), the `TelemetryEvent` schema from 4.1a |
| Blocks | 4.2 |
| Decisions needed | D16 (hosting, proposed) decides the store; D17 (consent, proposed) decides whether this ships at all |
| Decisions or questions this settles | Ingest contract, normalization, idempotency, rate limits and caps, IP handling, retention |

## Scope

In:

- `POST /v1/events`, `GET /v1/schema/telemetry-event.json`, and a privacy page at `/telemetry` describing what is collected, what never is, and how to opt out.
- An `EventStore` service with the platform implementation D16 picks, plus an in-memory one for tests.
- A scheduled maintenance job: expire network hashes, refresh the official-name snapshot from the index, mark projects, prune raw events.

Out:

- Aggregates and public stats (4.2).
- Any read endpoint over raw events. Raw events are never public.
- Alerting beyond structured logs.

## Design

### Contract

```
POST /v1/events
Content-Type: application/json
{ "events": [ <TelemetryEvent>, ... ] }   // 1 to 50 events, body at most 512 KiB
```

| Response | When |
|---|---|
| `202 { "rejected": ["<eventId>", ...] }` | The batch was read. Events that fail validation are listed by id (only UUID-shaped ids are echoed) and never stored; the client deletes them because retrying can't fix them |
| `400` envelope, `BadInput` | Not JSON, no `events` array, empty, or more than 50 |
| `413` envelope | Body over 512 KiB |
| `415` envelope | Not `application/json` |
| `429` envelope with `Retry-After` | Rate limited |
| `503` envelope, `retryable: true` | Store unavailable |

Every non-202 keeps the batch in the client's spool. That matters: a bad deploy or a misrouted request must not make every CLI in the field delete its data.

### Per-event handling

1. Strip unknown properties against the schema for the event's `schemaVersion`, then decode. A decode failure rejects that event only. Validators for released schema versions are never removed.
2. Reject events from source builds (`cliVersion` of `dev`); they are acknowledged as rejected and never stored, which also lets the deploy smoke test post real events safely.
3. Normalize: any `stack`, fragment or step name not in the official-name snapshot becomes `custom`; `fingerprint` is dropped if any entry is `custom`. The snapshot is the set of ids and step names that have ever appeared in the published index, refreshed by the maintenance job, so the server never trusts the client's idea of what's official.
4. Recompute: for `verify`, derive `outcome` from `scope`, `steps` and `stepsChanged` using the rules in `packages/format`, and reject the event if the client's value differs. Clamp implausible values (negative `secondsSinceScaffold`) by rejecting.
5. Store with insert-or-ignore on `eventId`, so a retried batch has no effect. Never upsert.

### Abuse resistance

Telemetry is anonymous and client-generated, so every number it produces can be inflated. The defenses are layered and none relies on the install id, which anyone can rotate:

| Layer | Rule |
|---|---|
| Rate limit | 60 events per minute per network, counted per event including rejected ones |
| Network identity | HMAC-SHA256 of the IPv4 /24 or IPv6 /64 prefix with a secret key and a weekly rotating salt; the raw IP is never stored or logged; hashes are deleted after 30 days |
| Daily caps | At most 20 scaffolds per install and 20 per network per day count toward aggregates; the rest are stored but excluded |
| Diversity | 4.2 refuses to let one install or network supply more than 20% of any published cell |
| Plausibility | A `verify` with step names that don't match any historical composition of its stack is excluded from that stack's numbers |
| Manual exclusion | The maintainers can exclude an install hash, network hash or ASN with a reason; exclusions are recorded, not deletions |

### Storage

Tables (SQLite-shaped for D1; Postgres would be the same columns):

| Table | Columns |
|---|---|
| `events` | `event_id` PK, `type`, `install_id`, `project_id`, `received_day`, `sent_at`, `network_hash` (nullable, expires), `payload` JSON, `excluded` reason |
| `projects` | (`install_id`, `project_id`) PK, `stack`, `fragments`, `scaffold_day`, `first_verify_at`, `first_green_at`, `seconds_to_green`, `agent`, `handoff` |
| `official_names` | `kind` (stack, fragment, step), `name`, `first_seen`, `last_seen` |
| `exclusions` | `kind`, `value`, `reason`, `created_at` |

`projects` is keyed by install and project together, because project ids are client-chosen and two installs could collide. It is updated in the same transaction as the event insert, so a retried event can't double-count.

Retention: raw `events` rows are deleted after 90 days. If D16 picks Workers, they are first archived to private object storage as gzipped NDJSON per day without network hashes; with Postgres, a nightly dump to private storage does the same. `projects` and later aggregates are kept.

### Interfaces

```ts
export class EventStore extends Context.Service<EventStore, {
  readonly insert: (events: ReadonlyArray<NormalizedEvent>, network: NetworkHash | null) =>
    Effect.Effect<void, StoreUnavailable>;
  readonly officialNames: Effect.Effect<OfficialNames, StoreUnavailable>;
  readonly maintain: (now: Date) => Effect.Effect<MaintenanceReport, StoreUnavailable>;
}>()("quickstacks-api/EventStore") {
  static memory: () => Layer.Layer<EventStore>;
}
```

The route handler depends on `EventStore`, `RateLimiter` and `NetworkHasher` services; the platform layer supplies their real implementations. Secrets (`NETWORK_HASH_KEY`) are read only in the API's `config.ts` and never logged.

### Failure modes

| Case | Response |
|---|---|
| One bad event in a batch of 50 | 202 with that id in `rejected`; the other 49 stored |
| Same batch posted twice | 202 both times; stored once |
| Store down | 503, client keeps the batch |
| Snapshot refresh fails | Keep the previous snapshot; log; names not yet in it become `custom` until the next success |
| Secret missing at startup | The API refuses to serve ingest (503) rather than store unhashed networks |

### Decisions settled here

- Per-event rejection, never whole-batch, and only schema rejections let the client drop data.
- The server is the source of truth for what's official and for verify outcomes. A modified client can lie about its own runs but can't make a custom stack count as official or a changed verify count as green.
- No free-text field exists anywhere in the schema, so nothing a user typed can reach the store.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/api/src/handlers/events.ts` | Route, batch handling |
| `packages/api/src/ingest/` | `normalize.ts`, `recompute.ts`, `ratelimit.ts`, `network.ts` |
| `packages/api/src/store/` | `EventStore` memory implementation and the D16 platform implementation; migrations |
| `packages/api/src/maintenance.ts` | Scheduled job |
| `packages/api/src/pages/telemetry.ts` | Privacy page |
| `packages/api/src/config.ts` | Secret and limits |
| `packages/api/tests/ingest.test.ts`, `maintenance.test.ts` | New |
| `.claude/rules/api/` | Add the never-store-raw-IP and no-free-text rules |

## Acceptance tests

Through a real local HTTP server around the API handler, with the in-memory store and, if D16 picks Workers, a second run against the local Workers runtime and local D1.

- A batch of 50 valid events returns 202 with `rejected: []`; each is stored once; posting it again changes nothing.
- A batch with one malformed event returns that id in `rejected` and stores the rest.
- Unknown stack and fragment ids are stored as `custom`; the fingerprint is dropped.
- A verify event claiming `green` with a failed step is rejected.
- `cliVersion: "dev"` events are rejected and not stored.
- The 61st event from one network inside a minute gets 429 with `Retry-After`.
- No stored row or log line contains the request IP (scan everything written during the test).
- Maintenance with TestClock: network hashes gone after 30 days; raw events gone after 90 days, archive present first.
- The 4.1a client against this server: queued events arrive, the spool empties, debug output matches stored payloads.

## Exit criteria

- D16 and D17 decided. Acceptance tests pass; `bun run check` green from the repo root.
- The privacy page and schema route are live before any CLI release that sends events.
- `AGENTS.md` documents the API's ingest invariants and how to run it locally.

## What this plan may get wrong

- The caps and plausibility rules are guesses until real data exists. They should be tunable config, and changing them should recompute exclusions rather than require a migration.
- Weekly salt rotation breaks exact long-window network caps; a hash that expired counts as one contributor. Acceptable at this scale; note it on the stats page.
