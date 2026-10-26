# Phase 4.2a: Stats rollup and routes

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | A scheduled rollup turns stored telemetry into per-stack and per-fragment window metrics over finalized UTC days, caps each contributor's share, suppresses small cells, holds public numbers back until enough stacks have enough projects, and serves them from `GET /v1/stats/...` with the last ledger run beside them |
| Traces to | Success table: "Fraction of `new --sandbox` runs that reach a green `verify` with no user intervention", "Median time from `new` to green `verify`", "Stacks and fragments in `~/.stacks` and third-party sources". The coding agent "runs `list --json`, picks a stack"; its frustration is "ambiguity". Assumption 5 ("Watch whether people use `new` from a terminal or ask their agent to run it"), D9 |
| Depends on | 4.1c (the scheduled entry, `maintenance_lease`, `maintenance_state`, `registry_snapshots`), 4.0c (each index entry's `lastRun`), 4.1d (exclusions applied and `projects` rechecked before counting; `installs` for install maturity), D17 |
| Blocks | 4.2b, 4.2c, 4.2e |
| Decisions needed | D17. If collection is opt-in or declined, this sub-phase is skipped and 4.2b shows ledger results only. New for the maintainers: the publishing gate thresholds and the cap values below (proposed values); [open question 30](../risks-and-open-questions.md#open-questions-for-the-maintainers) (capping instead of suppressing concentrated cells) and [open question 31](../risks-and-open-questions.md#open-questions-for-the-maintainers) (per-agent green rate as a breakdown) |
| Settles | Metric definitions, windows, capping and suppression, the publishing gate, the `StatsSummary` and `StatsDetail` schemas, the routes and who reads each |

## Scope

In:

- An hourly and a daily rollup step in the Worker's scheduled entry writing `window_metrics`, both under 4.1c's `maintenance_lease`.
- Wilson intervals, per-contributor caps, suppression and the publishing gate.
- `StatsSummary` and `StatsDetail` schemas in `packages/format` (additive).
- `GET /v1/stats/summary`, `GET /v1/stats/stacks/:id`, `GET /v1/stats/fragments/:id`.

Out:

- `stats` in the CLI, in `show` and on the directory pages (4.2b).
- Sorted directory views, trending, tag and fragment pages, co-installed fragment lift (4.2c).
- Dependency metrics (4.2e).
- Internal counts by event type, error code, os or Node major (4.1d's `daily_metrics`, never on a public route).
- Ratings, reviews, accounts, per-user or per-project views, ranking agents against each other.

## Design

### Where this fits

4.1b and 4.1c store and maintain events, and 4.1d applies exclusions, rechecks `projects` and tracks install maturity. This sub-phase turns the cleaned rows into numbers and decides which numbers are fit to publish. Every route has a named reader:

| Route or table | Read by |
|---|---|
| `GET /v1/stats/summary` | `list --json` and human `list` (4.2b) |
| `GET /v1/stats/stacks/:id` | `show <stack> --json` and human `show` (4.2b) |
| `GET /v1/stats/fragments/:id` | `show <fragment> --json` and human `show` (4.2b) |
| `window_metrics` | The directory stats sections (4.2b) and sorted pages (4.2c), read in the Worker |

A route or metric with no reader in this table is not built.

### Definitions

| Term | Meaning |
|---|---|
| Project | A distinct (install, telemetry project) row in `projects` whose install is mature: `installs.first_seen_at <= projects.scaffold_at - 24h` (4.1d). 4.1b never writes `projects` from an excluded event, and 4.1d's recheck removes rows that later exclusions cover, so no exclusion check is repeated here |
| Attempted | A project with at least one verify that isn't env blocked (a `failed` run whose failing steps all have `failureKind: "env"`) |
| Green project | At least one verify with outcome `green` (the `RunRecord` rule from 1.3b: full scope, `tamperCheck: "full"`, steps unchanged). `changed` and `partial` never count |
| Time to green | `seconds_to_green` on the project row |
| Time to first passing test | `seconds_to_first_test_pass` (the problem statement's measure for the time-pressure user) |
| No-verify share | Projects with no verify event, over all projects |
| Finalized day | A UTC receive day that has ended. The current day is never published |
| Window | Trailing 7 and 28 finalized UTC days, ending at the last finalized day, counted as distinct projects, never as a sum of events |
| Contributor | An install id, or a network hash (from the project's scaffold event in `events`) |

Every response and page says the numbers describe "quickstacks projects", not the ecosystem.

### Windows

Decided here: only 7- and 28-day windows exist, and nothing longer is computed. A 90-day window would have no reader in the table above, and network hashes expire after 30 days (4.1c), so a longer cell couldn't apply the network cap below. Long-run trends come from the daily series of 28-day values in `StatsDetail`, which keeps every point fully checkable.

Windows end at the last finalized day so a spike has at least the rest of a day to be caught by 4.1d's anomaly flags before any number based on it is public.

### Metrics per stack

| Question | Metric | Where |
|---|---|---|
| Is anyone using it | Projects per window | Summary, detail |
| Does it work | Green rate: green over attempted, with a 95% Wilson interval | Summary, detail |
| How hard is it for the agent | Median and p75 time to green; median time to first passing test; median verify runs before first green | Summary (median to green), detail |
| Where does it break | Share of failed runs before first green in which each step failed | Detail |
| Is it the stack or the machine | Env-blocked share, separately | Detail |
| How many stop before verifying | No-verify share, always beside the green rate | Summary, detail |
| How many scaffolds fail outright | Scaffold failure share: 4.1a `error` events with `command: "new"` over `new` events plus those `error` events, by error `code`. Shown beside the no-verify share so a failed `new` isn't read as a user who stopped | Detail, per stack and in the global row (see below) |
| Do people change the defaults | `--without` rate per default fragment; attach rate per optional fragment | Detail |
| Does the preset matter | Green rate and median time to green per `preset` value (from `projects.preset`), as a breakdown inside one stack under the same caps and suppression; this is the `--sandbox` measure | Detail (`byPreset`) |
| Which composition broke | Green rate per composition `fingerprint` (from the `new` event's payload; custom entries carry none), shown next to the registry-change markers so a drop can be tied to one composition | Detail (`byComposition`) |
| Does it work with my agent | Green rate per `agent` value (from `projects.agent`), as a breakdown inside one stack, under the same caps and suppression. Never sorted or compared across stacks, and no route lists agents in order of green rate ([open question 31](../risks-and-open-questions.md#open-questions-for-the-maintainers)) | Detail |
| How do people arrive (D9) | Share of `new` events by `handoff` kind, and by `source` attribution (absent counts as `unknown`) | Detail; the global row also in the summary's `entryPoints` |
| Does looking lead to using | Pick rate: distinct mature installs that sent a `new` for the stack within 7 days after a `show` event for it, over distinct mature installs that sent that `show` | Detail |

Fragments get projects per window, attach rate per stack, and the green rate of compositions that include them.

The scaffold failure share is computed per stack from 4.1a's `error` events, which carry `stack` when the stack resolved to an official id; failures that happened before a stack resolved (an unknown id, a usage error) are counted globally. Global rows use the reserved id `_all` in `window_metrics` and appear in `StatsDetail` for every stack under `global`.

### Caps, suppression and the publishing gate

Concentration is handled by capping each contributor's share of a cell rather than suppressing the cell ([open question 30](../risks-and-open-questions.md#open-questions-for-the-maintainers)). Suppressing a cell that one install dominates means one heavy user, or a maintainer's own traffic, can blank out a stack's stats; capping keeps the cell and stops that one contributor from moving it.

| Rule | Value |
|---|---|
| Install cap | In each cell, at most 3 projects per install count, the earliest by `scaffold_day` and then by project id, so the choice is deterministic |
| Effective sample | `min(capped projects, 3 × distinct networks)` among the cell's projects. Every threshold below, and the Wilson interval's `n`, use the effective sample; the rate itself is computed over the capped projects |
| Any count | Hidden below an effective sample of 5 projects |
| Any rate | Hidden unless the effective attempted sample is at least 20, with at least 5 green and at least 5 not green |
| Ordering | `summary.entries` is ordered by the green rate's Wilson lower bound, highest first, then entries with a suppressed rate, then by id. Other orderings are 4.2c's pages |
| Publishing gate | No public stats until at least 3 stacks each have an effective attempted sample of 20 in one 28-day window. Before then, `summary` returns `published: false` with ledger results only |

Suppressed values come back as `null` with `suppressed: true`, so clients don't need the thresholds.

Maintainer and automated traffic is kept out before capping: bench and canary runs send nothing (2.0b and 5.1 set `DO_NOT_TRACK=1`), and 4.1e's smoke install id is in `exclusions`. The cap is the backstop for anything that still gets through.

### Rollup

Two steps in the scheduled entry, both run only while holding 4.1c's `maintenance_lease`. A run that can't take the lease logs `lease_held` and exits; the next trigger retries. Neither step reads a day that hasn't ended.

| Step | When | Recomputes |
|---|---|---|
| Hourly | Every hour (a cron added to 4.1c's daily one) | The 7- and 28-day windows ending at the last finalized day, so events that clients flushed late still land in it |
| Daily | In 4.1c's daily run, after 4.1d's exclusion and recheck steps | Every window ending in the last 28 finalized days, so exclusions, rechecks and released-version changes reach every number still being shown. Older series points are kept as computed |

Distinct networks for a window are counted when that window is first computed by the hourly step. At that point every day in it is at most 28 days old, inside the 30-day hash life (4.1c), so every scaffold event still has its hash. The count is stored in the row's payload, and later recomputes by the daily step reuse it (capped at the new project count) instead of recounting hashes that may have expired since.

Each step reads `projects` and `events` through `effect/sql` and writes `window_metrics(day, window, dimension, name, payload)`, where `day` is the window's last day; rerunning a day replaces its rows. It also writes the gate result. After a successful run the hourly step writes `maintenance_state.last_rollup` (the time it finished). 4.1d's daily alert reads it and raises a stale-rollup flag when it is more than 3 hours old.

`projects` holds what every project has (stack, fragments, handoff, agent, `preset`, `scaffold_at`, the verify timings and `verify_runs_to_green`, 4.1b). The breakdowns that need more come from the scaffold event itself: `without`, `source` and the composition `fingerprint` are read from the project's `new` event's `events.payload` within the 28-day window, where raw events always still exist (90-day retention, 4.1c). This sub-phase adds no `projects` column.

Registry-change markers come from 4.1c's `registry_snapshots`: for each stack, every snapshot in which that stack's recorded entry (its fragment set, its verify step names, and its bundle digest when the snapshot records one) differs from the previous snapshot is a marker `{ day, digest }`. The daily series in `StatsDetail` carries them, so a drop in green rate can be tied to a content change.

### Routes

```
GET /v1/stats/summary
200 {
  "generatedAt": "...", "through": "2026-10-25", "population": "quickstacks projects",
  "window": 28, "published": true,
  "entryPoints": { "handoff": { "launch": 0.41, ... }, "source": { "skill": 0.22, ... } },
  "entries": [{
    "id": "go-cli", "kind": "stack",
    "projects": { "value": 214, "suppressed": false },
    "greenRate": { "value": 0.91, "lower": 0.86, "sample": 180, "suppressed": false },
    "noVerifyShare": { "value": 0.12, "suppressed": false },
    "medianMinutesToGreen": { "value": 14, "suppressed": false },
    "lastRun": { ... }          // the index entry's lastRun (4.0c), unchanged
  }]
}
GET /v1/stats/stacks/:id     -> StatsDetail
GET /v1/stats/fragments/:id  -> StatsDetail (fragment fields)
```

`StatsDetail` for a stack: the summary row; both windows; a daily series of the 28-day projects and green rate for every computed end day, with `changes` markers; step failure shares; env-blocked share; fragment `--without` and attach rates; `byAgent` (green rate and sample per agent); `byPreset` and `byComposition` when their fields are sent; `entryPoints` for the stack; `pickRate`; the stack's scaffold failure share by code; and `global` (scaffold failure share by code, the global entry-point shares). For a fragment: projects, attach rate per stack, and the green rate of compositions including it. Every value uses the `{ value, suppressed }` shape.

`lastRun` is read from the static index through the assets binding, so the summary never disagrees with the index. Responses carry `Cache-Control: public, max-age=3600, stale-while-revalidate=3600`. Unknown or malformed ids return the `NotFound` envelope. Errors use the shared envelope.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/api/src/stats/` | `rollup.ts`, `wilson.ts`, `cap.ts`, `suppress.ts`, `gate.ts`, `markers.ts` |
| `packages/api/src/handlers/stats.ts`, `src/api.ts` | Routes |
| `packages/api/migrations/` | `window_metrics` table |
| `packages/api/src/platform/worker.ts`, `wrangler.jsonc` | Hourly cron; daily step added after 4.1d's steps |
| `packages/format/src/stats.ts` | `StatsSummary`, `StatsDetail` |
| `packages/api/tests/stats.test.ts` | New |
| `AGENTS.md` | Metric definitions in the words above |

## Acceptance tests

- Over a seeded store: green rate, Wilson bounds, median and p75 match hand-computed values; twenty verify events in one project count once.
- An effective attempted sample of 19: `greenRate: null, suppressed: true`. 4 not-green: rate suppressed.
- One install with 30 projects in a cell of 100: it counts 3, and the cell is published, not suppressed. One network holding 40 of 50 projects across 3 networks: effective sample 9, so the rate is suppressed but the count is shown.
- A project from an install first seen 2 hours before its scaffold is not counted; the same install's later project, scaffolded 25 hours after it was first seen, is.
- Two qualifying stacks: `published: false`, ledger results only. Three: `published: true`.
- A `changed` or `partial` verify never makes a project green.
- Events received today change no `window_metrics` row; the summary's `through` is yesterday.
- No `window_metrics` row has a window other than 7 or 28.
- `summary.entries` order: highest Wilson lower bound first, suppressed rates after, ties by id.
- `byPreset` for a stack scaffolded with `default` and `sandbox` presets returns both under suppression rules; `without` and `source` shares match seeded `new` event payloads; the median verify runs before first green matches seeded `verify` events.
- A successful hourly run sets `maintenance_state.last_rollup`; a run that fails or can't take the lease leaves it unchanged.
- `byAgent` for a stack with two agents returns both under suppression rules; no route returns agents sorted by green rate.
- Seeded `error` events give the scaffold failure share by code for their stack, and events with no stack only under `global`; seeded `show` and `new` events give the expected pick rate, and a `new` 8 days after the `show` doesn't count.
- `entryPoints` matches seeded `handoff` and `source` values, with absent `source` as `unknown`.
- Two `registry_snapshots` rows where `go-cli` gained a step: one marker on the snapshot's day in `go-cli`'s series; none in another stack's.
- A rollup started while a fixture holds `maintenance_lease` writes nothing and logs `lease_held`.
- With `TestClock` moved 10 days on and hashes for the oldest days nulled, the daily step's recompute of an earlier window keeps the stored distinct-network count and its effective sample.
- Rerunning the rollup for a day gives identical rows; after 4.1d excludes an install and rechecks, the daily step changes only the windows that install's projects fall in.
- Under the local Workers runtime, the hourly trigger writes `window_metrics` and `GET /v1/stats/summary` and `GET /v1/stats/stacks/:id` return them with the cache header.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- The maintainers agree the gate thresholds and cap values, and answer open questions 30 and 31.
- The publishing gate is computed by the rollup, never set by hand.

## What this plan may get wrong

- The gate may take a long time to meet. That is information about adoption, and the ledger results still give clients something true.
- The no-verify share still mixes people who stopped with sandboxes that blocked telemetry (4.1a). The scaffold failure share separates failed `new` runs per stack only when the failure happened after the stack resolved; earlier failures stay global.
- Capping at 3 projects per install and `3 × networks` are guesses. They are config: changing them recomputes windows on the next daily step.
- Registry-change markers are only as fine as `registry_snapshots`: a prose-only edit shows up only if the snapshot records bundle digests.
- Recomputing 28 end days of 28-day windows daily may get slow on D1. If it does, compute daily partials and sum distinct project ids per window from them.
