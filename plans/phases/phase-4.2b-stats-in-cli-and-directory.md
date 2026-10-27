# Phase 4.2b: Stats in the CLI and the directory

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Agents see per-stack stats in `list --json`, and the detail for one entry (step failures, per-agent breakdown, daily series with content-change markers) in `show --json`, from cached, bounded fetches that never fail a command, and people see a stats section on each directory page, rendered by the API from `window_metrics`, dated, and cached for an hour, with an explicit "not enough runs yet" state when there is nothing to show |
| Traces to | The coding agent "runs `list --json`, picks a stack" and its frustration is "ambiguity". Success rows 1 and 2 across users |
| Depends on | 4.2a (the stats routes and `window_metrics`), 4.0d (the cached-fetch rules this reuses), 4.0e (the static directory pages and their stats marker), 3.1a (`show` and `ShowReport`) |
| Blocks | 4.2c |
| Decisions needed | D17. If declined, this sub-phase is skipped: the directory already shows ledger results (4.0e) and `list --json` already shows `lastRun` (4.0d) |
| Settles | The `stats` field in `list --json` and `show --json`; the agent guide's rule for using it; how stats reach static pages without client-side JavaScript; what a page says when it has no numbers |

## Scope

In:

- A `Stats` service in the CLI fetching `/v1/stats/summary` and `/v1/stats/{stacks,fragments}/:id` with 4.0d's cache, deadline and backoff rules.
- `stats` on each `list --json` item and one line in human `list`; `stats` on `show --json` from the detail route and a few lines in human `show`.
- One sentence in the no-argument agent guide (1.4).
- An API route that serves a directory stack page with its stats section filled in: the numbers, the per-step failure breakdown, the date they were computed, or a fixed "not enough runs yet" sentence.

Out:

- New metrics or suppression rules (4.2a owns them).
- Any page that needs client-side JavaScript.
- Sorted list pages, tag pages, fragment pages and pages for removed stacks (4.2c).

## Design

### Where this fits

4.2a computes and gates the numbers. This sub-phase shows them in two places. The static directory from 4.0e stays the source of every page; this adds only the stats section.

### CLI

The fetch follows 4.0d's rules exactly (cite, don't copy: 24-hour TTL, 1,500 ms deadline, 10-minute failure backoff, 24-hour backoff on 404, nothing under `--offline`, nothing during `verify`). Each cached resource has its own body file and its own state file, under `$XDG_CACHE_HOME/quickstack/stats/`: the summary is `summary.json` with `summary.state.json`, and each detail is `<kind>-<id>.json` with `<kind>-<id>.state.json`. A state file has 4.0d's `state.json` shape (`{ url, cachedAt, lastAttempt, lastOutcome, backoffUntil }`), so backoff after a failed detail fetch applies to that entry only. The response is decoded with `StatsSummary` from `packages/format`; a decode failure is treated like a network failure.

When `published` is true and the summary has the id, each `list --json` item gains:

```json
"stats": { "window": 28, "projects": 214, "greenRate": 0.91, "greenRateLower": 0.86,
           "noVerifyShare": 0.12, "medianMinutesToGreen": 14 }
```

with suppressed values as `null`. When the summary is unavailable or unpublished, the field is absent, never an error or a warning. Stats are fetched only from `AppConfig.apiUrl`, which `config.ts` takes from a constant `DEFAULT_API_URL` that `bin.ts` passes in, the same way it passes `INDEX_PUBLIC_KEYS` (4.0d). No env variable or setting can change it; only the test helper passes a different value, pointing at a local server. With a non-default `QUICKSTACK_INDEX_URL`, no stats are fetched, since they would describe a different set of entries. 4.2d sends dependency reports to the same `apiUrl`. Human `list` adds `green 91% (n=180)` when unsuppressed.

### `show`

`show <id>` (3.1a) fetches `GET /v1/stats/stacks/:id` or `/v1/stats/fragments/:id` under the same rules, cached per entry as described above, and only for entries whose origin is `bundled` or `index`: a user, project or source copy is not what the numbers describe, the same rule 3.1a uses for `lastRun`. `ShowReport` gains an optional `stats` field (additive, decoded with `StatsDetail` from `packages/format`): the summary numbers, `through`, step failure shares, `byAgent`, `pickRate` and the daily series with its `changes` markers, suppressed values as `null`. Absent when the fetch fails, the summary is unpublished, or the origin doesn't qualify. Human `show` adds the summary line, the three steps that fail most before first green, and, when the latest marker is newer than the window start, `content changed <date>`.

The detail route is what makes `show` useful to a stack author: which step breaks, and whether the break started when the content changed.

The agent guide gains one sentence: "When two stacks fit equally well, prefer the higher `stats.greenRateLower` and say why; if neither has stats, prefer the more recent `lastRun`."

### Directory stats

The pages stay static files built by 4.0e. The Worker serves `/stacks/<id>/` itself instead of letting the static assets layer answer (a route registered for that path, with the asset fetched through the assets binding):

1. Read the static page from the assets binding.
2. Read that stack's rows from `window_metrics` and apply 4.2a's suppression and gate.
3. Replace the `<!-- quickstack:stats -->` marker with a server-rendered HTML section (projects, green rate with interval, median time to green, no-verify share, the per-step failure shares before first green, the population label, and "computed <generatedAt>, through <through>"), escaping every value. Unpublished, or every value suppressed: the marker is replaced with one fixed sentence, "Not enough runs yet to publish numbers for this stack.", followed by the last ledger run line the static page already has, so a page with no numbers doesn't look broken.
4. Respond with `Cache-Control: public, max-age=3600`.

The replacement is a plain string operation on the marker, not a Workers-specific HTML rewriter, so the code stays platform-free and testable on the Node harness. If the stats query fails, the static page is served unchanged with the same cache header shortened to five minutes. The index page `/` gets the same treatment with one cell per stack, using the same fixed sentence (shortened to "not enough runs yet") for a stack with nothing to show.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/core/stats.ts` | `Stats` service |
| `packages/cli/src/config.ts`, `src/bin.ts`, `tests/helpers/cli.ts` | `AppConfig.apiUrl` from `DEFAULT_API_URL`, passed by `bin.ts`; the test helper passes the local server's URL |
| `packages/cli/src/commands/list.ts`, `show.ts`, `src/core/guide.ts` | `stats` fields, show lines, guide sentence |
| `packages/cli/src/schemas/` | `list --json` item and `ShowReport` gain optional `stats` |
| `packages/api/src/handlers/directory.ts`, `src/stats/render.ts` | Page route and section renderer |
| `packages/api/wrangler.jsonc` | Route `/stacks/*` and `/` to the Worker before assets |
| Tests in both packages | New |
| `packages/cli/README.md` | The `stats` field |

## Acceptance tests

- CLI against a real local stats server: `list --json` items gain `stats`; with the server down, hanging, returning bad JSON, or under `--offline`, stdout equals the output without the feature except the absent field, and the command finishes within 1.5 s of the offline run.
- `published: false`: no `stats` field.
- A second `list` within 10 minutes of a failure makes no request. A failed detail fetch for one entry backs off only that entry's state file.
- No env variable changes the stats host: with only `QUICKSTACK_API_URL` or similar set, requests still go to `AppConfig.apiUrl`.
- With `QUICKSTACK_INDEX_URL` set to a non-default host: no stats request.
- `verify` makes no stats request.
- `show go-cli --json` against the local server has `stats` that decodes with `StatsDetail`, including `byAgent` and the series with a seeded change marker; with the server down, `show --json` equals the output without the feature minus the field. A user-directory copy of `go-cli` makes no detail request and has no `stats`.
- Human `show` prints the three most-failing steps and `content changed <date>` for a seeded marker inside the window.
- API: `/stacks/go-cli/` with seeded metrics contains the stats section, the per-step failure shares and the computed and through dates, and the static page's other content byte-for-byte; with the gate unmet, the marker is replaced by the fixed "Not enough runs yet" sentence and nothing else changes; a stack name or step name containing `<` in a fixture is escaped.
- The page response has `Cache-Control: public, max-age=3600`.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- `AGENTS.md`, the CLI README and the directory's about text define every metric in 4.2a's words.

## What this plan may get wrong

- A stack author may want the daily series as a chart. That needs client-side JavaScript or an image renderer; the series is in `show --json` for anyone who wants to plot it.
- Agents may ignore `stats`. Test with a bench run (2.0b) where two stacks fit and see whether the pick and its explanation change before promoting it.
- Routing the stack pages through the Worker means a Worker outage takes the directory down with it, where pure static pages wouldn't. Workers and static assets share the same host, so the practical difference is small; if not, serve stats as a separate fragment URL instead.
