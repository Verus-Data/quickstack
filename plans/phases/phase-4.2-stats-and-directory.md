# Phase 4.2: Stats and directory

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Turn stored events into per-stack numbers that answer "does this stack work for other people", publish them only once the sample is big enough to mean something, show them to agents in `list --json`, and give people a static directory page per stack |
| Traces to | Success table: "Fraction of `new --sandbox` runs that reach a green `verify` with no user intervention", "Median time from `new` to green `verify`", "Stacks and fragments in `~/.stacks` and third-party sources". The agent user: it "runs `list --json`, picks a stack" and its frustration is "ambiguity" |
| Depends on | 4.1a and 4.1b (events exist), 4.0a (index, canary results), 4.0b (the CLI's cached fetch pattern) |
| Blocks | Nothing |
| Decisions needed | D17 (proposed). If collection is opt-in or declined, this sub-phase publishes canary results only and the stats parts wait |
| Decisions or questions this settles | Metric definitions, suppression thresholds, the publishing gate, the stats routes and the `stats` field in `list --json` |

## Scope

In:

- A scheduled rollup that computes per-entry metrics over trailing windows.
- `GET /v1/stats/summary`, `GET /v1/stats/stacks/:id`, `GET /v1/stats/fragments/:id`.
- A `stats` field in `list --json` and a line in `show`, from a cached fetch, omitted when unavailable.
- A static directory: an index page of stacks and one page per stack, generated from the index and the stats, with a copyable `npx quickstacks new <id>` command.

Out:

- Ratings, reviews, comments, accounts, author profiles (roadmap, Won't have).
- Dependency or ecosystem trends (roadmap, Won't have).
- Per-user or per-project views. They contradict the anonymity promise.
- Ranking agents against each other across stacks; their users pick different stacks and machines, so the comparison is confounded.

## Design

### Definitions

| Term | Meaning |
|---|---|
| Project | A distinct (install, telemetry project) pair with a `new` or first `add` event |
| Attempted | A project with at least one verify event that isn't env blocked (a `failed` run whose failing steps are all `failureKind: "env"`, derived at ingest) |
| Green project | A project with at least one `green` verify: full scope, every non-skipped step passed, steps unchanged. `changed` and partial runs never count |
| Time to green | `secondsSinceScaffold` on a project's first green verify |
| No-verify share | Projects with no verify event at all, over all projects |
| Window | Trailing 7, 28 and 90 UTC days by receive day, always counted as distinct projects, never as a sum of daily counts or of events (an agent can run verify twenty times in one project) |

Population label: every response and page says the numbers describe "quickstacks projects", not the ecosystem.

### Metrics per stack

| Question | Metric |
|---|---|
| Is anyone using it | Projects per window |
| Does it work | Green rate: green projects over attempted projects, with a 95% Wilson interval |
| How hard is it for the agent | Median and p75 time to green; median verify runs before first green |
| Where does it break | Share of failed runs before first green in which each step failed |
| Is it the stack or the machine | `env_blocked` share, shown separately |
| How many give up before verifying | No-verify share, always shown beside the green rate |
| Do people change the defaults | `--without` rate per default fragment; attach rate per optional fragment |
| Entry point (D9) | Share of `new` events by `handoff` kind |

Fragments get projects per window, attach rate per stack, and the green rate of compositions that include them.

### Suppression and the publishing gate

| Rule | Value |
|---|---|
| Any count | Hidden below 5 projects |
| Any rate | Hidden unless at least 20 attempted projects, at least 5 green and at least 5 not green |
| Ranking | By the Wilson lower bound, so 3 of 3 never outranks 180 of 200 |
| Concentration | A cell where one install or network contributes over 20% is suppressed |
| Public pages at all | Not published until at least 3 stacks each have 20 attempted projects in a 28-day window. Before then, the API serves canary results and counts are internal |

Suppressed values come back as `null` with `suppressed: true`, so clients don't need to know the thresholds.

### Routes

```
GET /v1/stats/summary
200 {
  "generatedAt": "...", "population": "quickstacks projects", "window": 28,
  "entries": [{
    "id": "go-cli", "kind": "stack",
    "projects": { "value": 214, "suppressed": false },
    "greenRate": { "value": 0.91, "lower": 0.86, "sample": 180, "suppressed": false },
    "noVerifyShare": { "value": 0.12, "suppressed": false },
    "medianMinutesToGreen": { "value": 14, "suppressed": false },
    "canary": { "date": "2026-12-01", "result": "pass" }
  }]
}
GET /v1/stats/stacks/:id     -> the summary row plus all windows, daily series, step failure shares, fragment attach and without rates
GET /v1/stats/fragments/:id  -> projects, attach rate per stack, green rate of compositions including it
```

Cached at the edge for an hour with `stale-while-revalidate`. Errors use the shared envelope.

### Rollup

A scheduled job (hourly) recomputes window rows from `projects` and recent `events`, writing `window_metrics(day, window, dimension, name, payload)`. It is idempotent: rerunning for a day replaces that day's rows. Exclusions from 4.1b apply before counting, and a new exclusion triggers recomputation of affected windows.

### CLI: `stats` in `list --json`

The CLI fetches `/v1/stats/summary` with the 4.0b pattern: cache under `$XDG_CACHE_HOME/quickstacks/stats.json`, 24-hour TTL, 1,500 ms deadline, failure backoff, never under `--offline`, never during `verify`. When present, each `list --json` item gains:

```json
"stats": { "window": 28, "projects": 214, "greenRate": 0.91, "greenRateLower": 0.86,
           "noVerifyShare": 0.12, "medianMinutesToGreen": 14 }
```

with suppressed values as `null`. When the summary is unavailable, the field is absent, never an error or a warning. The no-argument agent guide from 1.4 gains one sentence: when two stacks fit equally well, prefer the higher `greenRateLower`, and say why.

### Directory

A static site generated by the same build that writes the index (4.0a), served by the API host:

- `/`: stacks with name, description, tags, last canary result, and the stats summary when unsuppressed; sort by usage or by green rate lower bound.
- `/stacks/<id>`: deps by role, default and optional fragments, verify steps, the guidance body rendered, the stats detail, and the copy command.
- `/telemetry`: from 4.1b.

No client-side JavaScript is needed; pages are rebuilt when the index or the hourly rollup changes.

### Failure modes

| Case | Effect |
|---|---|
| Rollup fails | Previous rows stay; `generatedAt` shows their age |
| Stats endpoint down | `list --json` omits `stats`; directory shows canary results only |
| A stack withdrawn from the index | Page kept with a removed notice; historical stats kept |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/api/src/stats/` | `rollup.ts`, `wilson.ts`, `suppress.ts` |
| `packages/api/src/handlers/stats.ts` | Routes |
| `packages/api/scripts/build-site.ts` | Directory pages |
| `packages/format/src/stats.ts` | `StatsSummary` schema shared with the CLI |
| `packages/cli/src/core/stats.ts` | Cached fetch |
| `packages/cli/src/commands/list.ts`, `show.ts`, `src/core/guide.ts` | `stats` field, show line, guide sentence |
| Tests in both packages | New |

## Acceptance tests

- Rollup over a seeded store: green rate, Wilson bounds, median and p75 match hand-computed values; twenty verify events in one project count as one project.
- Suppression: a stack with 19 attempted projects has `greenRate: null, suppressed: true`; one with 4 not-green has its rate suppressed; a cell 25% from one network is suppressed.
- The publishing gate: with two qualifying stacks the summary returns canary data only.
- A `changed` verify never makes a project green.
- CLI against a real local stats server: `list --json` gains `stats`; with the server down or `--offline`, stdout equals the output without the stats feature except for the absent field.
- Site build produces a page per indexed stack; each page's copy command is the exact `npx quickstacks new <id>` string.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- Public pages go live only after the gate is met, checked by the build, not by hand.
- `AGENTS.md`, the CLI README and the directory's about page define every metric in the words above.

## What this plan may get wrong

- The gate may take a long time to meet. That is information: it says how many people use quickstacks, and the canary results still give the directory something true to show.
- Agents may ignore `stats`. Test it with a bench run (2.0) where two stacks fit and see whether the pick and explanation change before promoting it further.
- The no-verify share mixes people who gave up with sandboxes that blocked telemetry. It is shown so the green rate isn't read as covering everyone; it can't separate the two.
