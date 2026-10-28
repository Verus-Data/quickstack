# Phase 4.5e: Search endpoint and API-first search

Status: AGREED 2026-10-27 (starts after 4.5c; the rate limit can use 4.1b's `RateLimiter` on the Node store, amended D16)

| Field | Value |
|---|---|
| Goal | `GET /v1/search?q=<natural-language request>` in `stacks-api` returns the official stacks and fragments that best fit the request, ranked by the same `rank` function the CLI runs, so the site, MCP clients and any HTTP caller get one search; `stacks search` asks the API first and, when the API doesn't answer within 800 ms, returns its own local ranking instead, saying which ran. "go cli" returns `go-cli` first and strong; "a cli with a good TUI experience" returns the two CLI stacks as the closest fits and says nothing fits strongly, because neither ships a TUI |
| Traces to | Search as a key surface of the hosted API, beside `list` and `show`; the coding agent's "ambiguity" at the first step (4.5c); D36 as amended 2026-10-27 (API-first, local fallback) |
| Depends on | 4.5c (`rank`, `SearchResult`, the gate), 4.5b (`SearchMetadata`, the vocabulary, the signed `v1/search.json`), 4.0a (`packages/format`, where this sub-phase moves the search code), 4.0c (the signed index and its bundles, which the API ranks), 4.0d (the CLI's request rules: deadline, one attempt, backoff state). Soft: 4.2b (`AppConfig.apiUrl`; if 4.2b hasn't landed, this sub-phase adds it the way 4.2b describes), 4.2a (stats in `evidence`; without it, only `lastRun`) |
| Blocks | 4.5d (the semantic leg runs inside this route), 4.3's `stacks_search` tool (it runs `stacks search --json`, which reaches this route) |
| Decisions needed | D36 as amended. Nothing else: the route runs on the Node host and needs no store, so it doesn't wait for 4.0f |
| Settles | The route, its parameters, response and errors; where the search code lives once two repositories run it; how the API loads what it ranks; the CLI's API-first call, deadline, fallback and merge with local entries; what the server keeps |

## Scope

In:

- Moving `SearchMetadata`, `SearchVocabulary`, `SearchResult`, `SearchHit` and `rank` (with its tokenizer, vocabulary matcher, BM25 and tier code) from `packages/cli` to `packages/format` under `src/search/`, additive and published before the API imports them. Under D11 the API is their second reader. `rank` is already pure (4.5c), so the move changes import paths only.
- `GET /v1/search` in `stacks-api`: the contract endpoint, the handler, a `Search` service (`stacks-api/Search`) and an `IndexAssets` service (`stacks-api/IndexAssets`) with a Node layer reading the built static directory. 4.0f adds the Worker layer and 4.1c reuses the service; if 4.1c lands first, this sub-phase reuses its service instead.
- In `packages/cli`: the API-first call in `stacks search`, the merge with local entries, `--local`, and `ranking`, `remote` and `method` in `SearchResult`.
- The site's privacy page gains a "Search" section (below).

Out:

- Embeddings (4.5d, still gated on its start condition). When 4.5d starts, it changes this route's ranking and nothing about its shape.
- A search box on the site. The route makes one cheap to add; 4.2c's catalog doesn't need it yet.
- Searching anything but official index entries on the server. User, project and source entries exist only on the user's machine and are ranked there.
- Rate limiting before 4.1b's `RateLimiter` exists (What this plan may get wrong).
- Any record of request text: no log field, table, cache or counter keyed by it.

## Design

### Where the search code lives

`packages/format/src/search/` holds the schemas and `rank(input: RankInput): RankOutput`. `RankInput` is plain data: the request, the vocabulary, and one record per entry (kind, id, name, description, tags, category, body, `applies_to`, sidecar or none, trusted, evidence). `rank` reads nothing else, so the CLI builds `RankInput` from `Registry` and the API builds it from the index. The Grit boundary that keeps platform imports out of `packages/format` (4.0a) also keeps them out of search, which is what lets `rank` run on Node, in a Worker and in the CLI unchanged.

The CLI's `core/search/` keeps what is the CLI's: building `RankInput` from the registry, the remote call, the merge, and text output per audience.

### The route

```
GET /v1/search?q=go%20cli&kind=stack&limit=5

200 Cache-Control: no-store
{ "method": "lexical",
  "indexGeneratedAt": "2026-11-02T10:00:00Z",
  "understood": { "platforms": ["cli"], "productKinds": [], "languages": ["go"],
                  "capabilities": [], "unmatched": [] },
  "noStrongMatch": false,
  "stacks": [{ "kind": "stack", "id": "go-cli", "name": "Go CLI", "origin": "index", "trusted": true,
               "tier": "strong", "score": 0.84, "summary": "…", "why": [ … ], "penalties": [],
               "evidence": { "lastRun": { "date": "2026-10-27", "result": "pass" } } }],
  "fragments": [] }
```

| Parameter | Rule |
|---|---|
| `q` | Required; 1 to 500 characters after trimming (characters, not bytes), the same limit as the CLI |
| `kind` | Optional; `stack` or `fragment`, limiting the response to one list |
| `limit` | Optional; integer 1 to 20, default 5, applied to each list |

Hits are 4.5c's `SearchHit`, with `origin: "index"` and `trusted: true` for every hit (the server ranks only the signed index). `method` is `"lexical"` until 4.5d makes it `"hybrid"`. The response carries no copy of `q`; the caller has it.

The route follows `.claude/rules/api/http-contract.md`: unknown query keys are `400 BadInput`, as are a missing, empty or over-long `q`, an unknown `kind`, and a `limit` outside 1 to 20. Failing to load or verify the index or `v1/search.json` is `503 Unavailable` and a defect log line naming the file, never a partial ranking, since a ranking without cards would look confident and be wrong. GET with no side effects: the only state the route touches is the in-memory index below. `Cache-Control: no-store`, the API default, so no shared cache keys a response by its request text.

GET was chosen over POST because search is a read and callers expect a linkable URL they can try with curl. The cost is that `q` appears in the request URL. The API's own request records never include query strings (`stacks-api` AGENTS.md, Error handling), but a reverse proxy or the platform's edge can log URLs. The operations runbook says to configure the Node host's proxy without query strings in its access log, and the Workers move (4.0f) checks the same for Cloudflare's request logs; the privacy page states what remains.

### What the API ranks, and when it reloads

`Search` holds one `RankInput` built from the signed `v1/index.json`, each indexed entry's bundle and `v1/search.json`, each read through `IndexAssets` and verified with `INDEX_PUBLIC_KEYS` before use. It is built on the first request and rebuilt only when the index's `generatedAt` changes, once per process on Node and once per isolate on Workers. A few dozen entries make this a few hundred kilobytes and a ranking takes well under a millisecond, so nothing per query is cached.

Bodies are included so the server ranks exactly as the CLI does over the same entries. Every official entry has a reviewed card (4.5b's zero-warning rule), so the body's 0.15 weight rarely decides anything, but parity is what lets the CLI merge server and local hits on one score scale.

Evidence: `lastRun` from the index. Once 4.2a's rollup exists, the route fills `evidence.stats` from it directly, the same values 4.2b's summary publishes.

### In the CLI

`stacks search` runs the local ranking and the API call at the same time:

1. Skip the call, and set `remote: "off"` with its reason, when any of these holds: `--local`; `--offline` or `STACKS_OFFLINE=1` (4.0d); `DO_NOT_TRACK` set to anything but empty, `0` or `false`; or the search backoff is active (below). The CLI otherwise calls `AppConfig.apiUrl`, whether default or not: a user who points the CLI at another API means it.
2. Otherwise send `GET <apiUrl>/v1/search?q=…&limit=<limit>` (and `kind` when given) with an 800 ms deadline and one attempt. A response that arrives in time and decodes as the route's response is used; anything else (timeout, connection error, non-200, a body that doesn't decode) falls back to the local ranking with `remote: "unavailable"` and starts a 10-minute backoff in its own state file, 4.0d's rule for the index.
3. Merge. The API's hits replace the local hits for the same `(kind, id)` when the local entry's origin is `bundled` or `index`. Entries from a project, user or source origin are always ranked locally and kept, and one that shadows an official id replaces the API's hit for it, because that is the entry `new` would use. The merged list is ordered by 4.5c's rules (tier, then trust, then score with the evidence adjustment). Scores are comparable because both sides ran the same `rank` with the same vocabulary; until 4.5d, a merged result is what a local run over the same index would have produced, plus the server's newer cards.

`SearchResult` gains `ranking: "api" | "local"`, `remote: "used" | "off" | "unavailable"`, `remoteReason` when `remote` is `"off"` (`local_flag`, `offline`, `do_not_track`, `backoff`), and `method` (the server's, when `ranking` is `"api"`). Agent text adds one line when the API wasn't used (`ranked locally: API unavailable`), so a fallback is never silent. The command's wall time is at most the local ranking's or 800 ms, whichever is longer.

What the API adds while both sides rank lexically: cards and index entries that reached the server after the user's CLI was released, and one ranking the site, MCP clients and other callers share. After 4.5d it adds the semantic leg, which the CLI then gets without a release.

### What the server keeps

Nothing derived from the request text. The request record logs method, path (without the query string), status, duration and request id. The handler logs no field derived from `q`. No table stores it and no counter is keyed by it. One number may be kept once 4.1d exists: a daily count of `/v1/search` calls in `daily_metrics`. The CLI never writes the text to its log file; its log record carries the request's length, the result counts and the `remote` outcome.

The site's privacy page gets a "Search" section: what `stacks search` sends and when (D36), that the API keeps nothing derived from it, the URL-logging caveat for the edge, and how to turn the call off (`--local`, `--offline`, `DO_NOT_TRACK`).

## Files and areas touched

| Path | Change |
|---|---|
| `packages/format/src/search/` | `SearchMetadata`, `SearchVocabulary`, `SearchResult`, `SearchHit`, `SearchResponse`, `rank` and its helpers, moved from the CLI; exported from the package index |
| `packages/cli/src/core/search/` | `input.ts` (build `RankInput` from `Registry`), `remote.ts` (the call and backoff), `merge.ts`; imports `rank` from `@steamfield/stacks-format` |
| `packages/cli/src/commands/search.ts`, `src/schemas/search.ts` | `--local`; `ranking`, `remote`, `remoteReason`, `method` |
| `packages/cli/src/config.ts`, `src/bin.ts` | `AppConfig.apiUrl`, if 4.2b hasn't added it |
| `packages/cli/scripts/search-eval.ts` | `--remote <url>`: the set through the real route |
| `stacks-api/packages/contract/src/` | `SearchGroup` with `GET /v1/search`; `SearchResponse` reaches the contract from `@steamfield/stacks-format` |
| `stacks-api/apps/api/src/handlers/search.ts`, `services/Search.ts`, `services/IndexAssets.ts` | Handler and services with their layers |
| `stacks-api/apps/api/src/platform/node.ts` | The Node `IndexAssets` layer over the static directory |
| `stacks-api/apps/web/src/pages/` | The privacy page's "Search" section |
| `stacks-api/docs/operations.md` | Proxy access logs without query strings |
| Tests in both repositories | New |

## Acceptance tests

In `stacks-api`, on both `nodeTarget` and `webTarget`, over a fixture index built from the bundled registry and signed with the test key:

1. `GET /v1/search?q=go%20cli` returns `go-cli` first in `stacks`, tier `strong`, `understood.languages: ["go"]` and `understood.platforms: ["cli"]`; `typescript-cli` is not `strong` (`penalties: language`). The response decodes with `SearchResponse` and carries `Cache-Control: no-store`.
2. `GET /v1/search?q=a%20cli%20with%20a%20good%20TUI%20experience` returns `go-cli` and `typescript-cli` as the first two stacks, `noStrongMatch: true`, and `tui` in `understood.unmatched`.
3. Missing `q`, `q=` and whitespace, a 501-character `q`, `kind=app`, `limit=0`, `limit=21` and an unknown key `foo=1` are each `400` with the `BadInput` envelope; a 500-character multi-byte `q` is `200`.
4. A request with a sentinel string in `q` leaves no log record, defect line or response header containing the sentinel.
5. Parity: for every 4.5a query, the route's hits equal `rank` run in process over the same fixture index (ids, tiers, order and scores).
6. A `v1/search.json` with a bad signature, or a missing index, is `503` with the `Unavailable` envelope and one defect line naming the file.
7. Swapping the fixture index for one with a new `generatedAt` rebuilds `RankInput` once (a counter on `IndexAssets` reads); repeated requests on one index read nothing.

In `packages/cli`, against a local server:

8. Server answering in time: one request with `q` in the query string, `ranking: "api"`, `remote: "used"`, `method: "lexical"`; a user-origin stack that matches the request appears in the merged list, ranked locally; a user copy of `go-cli` replaces the API's `go-cli` hit.
9. Server hanging past 800 ms, returning 500, or returning a body that doesn't decode: the local ranking, `remote: "unavailable"`, one agent-text line saying so, and the command finishes within 800 ms of the local run's time; a second search within 10 minutes makes no request and reports `remoteReason: "backoff"`.
10. `--local`, `--offline`, `STACKS_OFFLINE=1` and `DO_NOT_TRACK=1` each make no request and report `remote: "off"` with their reason.
11. The CLI's log file after an API-ranked search contains the request's length, the counts and `remote: "used"`, and not the text.
12. With the local server running the real route over the bundled index, every 4.5a query gives the same stacks and fragments in the same order with `ranking: "api"` as with `--local`.
13. The packed `@steamfield/stacks-format` imports `rank` under Node with no TypeScript transform, and 4.5c's gate passes unchanged after the move.

### Realistic edge cases

14. `q` with `&`, `#`, `+` and non-ASCII characters is percent-encoded by the CLI and decoded by the route to the same text the local ranking saw (the parity check of test 12 includes one such query).
15. The API's index is newer than the CLI's cache and holds a stack the CLI hasn't seen: it appears in the merged result with `origin: "index"`; `show` and `new` for it go through 4.0d's normal index path.
16. The API's index is older than the CLI's bundled registry (a CLI release ahead of a deploy): a bundled entry the API doesn't know is ranked locally and kept.

## Exit criteria

- Acceptance tests pass; the gate green in both repositories.
- The route deployed on the Node host, and a `search:eval --remote` report against it in `plans/runs/`, equal to the local report.
- D36 as amended agreed.

## What this plan may get wrong

- 2026-10-27: 4.1b's `RateLimiter` now runs on the Node store (amended D16), so the route takes it once 4.1b lands; `search` is its own contract group and the one query route in the roadmap's "API route map".
- No rate limit until 4.1b's `RateLimiter`, which needs D1 and so arrives after 4.0f. A ranking over a few dozen entries costs well under a millisecond, so the route is cheaper than the static files beside it; if abuse shows up on the Node host before then, an in-process token bucket per client network in the Node platform layer is the stopgap.
- While both sides rank lexically, the API mostly duplicates the local result, and the 800 ms wait buys only fresher cards. That is the price of having the server in place when 4.5d's semantic leg starts; if 4.5d is never started, the call can be dropped from the CLI (keeping the route for the site and MCP) by making `--local` the default.
- The 800 ms deadline is a guess for an interactive command an agent waits on. Measure the route's p95 from a few regions after deploy and set the deadline to about twice it.
- `q` in a GET URL can be logged by infrastructure outside the API's code. The runbook covers the proxy this repository's maintainers control; a corporate proxy on the user's side is out of reach, which the privacy page says.
- Merging on one score scale assumes the server and the CLI run the same `rank` version. A CLI on an older `@steamfield/stacks-format` sees server scores from a newer ranking; the merge still orders by tier first, so a mismatch shifts order within a tier at worst. `SearchResponse` carries no ranking version until that shows up in practice.
