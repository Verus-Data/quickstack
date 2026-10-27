# Phase 4.5d: Semantic retrieval

Status: DRAFT 2026-10-27 (not agreed; gated on 4.5c's evaluation)

| Field | Value |
|---|---|
| Goal | For people who opt in, `stacks search` adds a semantic leg: the API embeds the request, compares it with embeddings of each official entry's search card and example requests, and returns similarities that the CLI fuses with its local lexical ranking, so paraphrases with none of an entry's words still find it; the request is never logged, stored or counted, and the result always says which ranking ran |
| Traces to | 4.5a's `paraphrase` pool, where lexical ranking has nothing to match. The trust job: a user's product idea is theirs, so it leaves the machine only when a person chose that |
| Depends on | 4.5c (the local ranking, `SearchResult`, the gate, the `search:eval --embeddings` report) and its evidence (below), 4.5b (`SearchMetadata`, `v1/search.json`), 4.0a (`packages/format`, where this sub-phase moves the search schemas), 4.0f (the Worker, D1, scheduled entry), 4.1b (`RateLimiter` and `rate_counts`, for the route's own counter), 4.1c (`maintain` and its lease), 4.1d (`daily_metrics`, which holds the one call count), 4.0c (the index the API reads), D36 |
| Blocks | Nothing |
| Decisions needed | D36 (query privacy and opt-in). The start condition below. [Open question 36](../risks-and-open-questions.md#open-questions-for-the-maintainers) (the embedding provider, including a local query model) |
| Settles | When this is built at all; what text is embedded; the model and where it runs; where vectors live and how they are rebuilt; `POST /v1/search`; fusion in the CLI; `Settings.search` and the `stacks search-hybrid` consent command; what the server may and may not keep |

## Start condition

This sub-phase starts only if 4.5c's numbers show it is needed and an offline experiment shows it helps:

1. 4.5c's ranking, on the holdout `paraphrase` queries of 4.5a's set, has recall@3 under 0.8 or MRR under 0.7.
2. 4.5c's `bun run search:eval --embeddings` report (a maintainer-only flag that embeds the entries' cards and the golden queries through the maintainer's own provider key, outside the CLI, exactly as the server would) shows the fused ranking raises MRR on the holdout paraphrase queries by at least 0.1 without failing any first-result or no-match case.

Both conditions read the holdout split only. The maintainers write both the paraphrase queries and the sidecars' `requests`, so the tune split can be met by writing cards that echo it; 4.5b forbids golden queries in the drafting prompt and keeps holdout queries out of sidecars, and this condition doesn't count numbers that could have been tuned on.

If either fails, this file moves to `DEFERRED` with the numbers, and the vocabulary and sidecars (4.5b) take the paraphrase gap instead. A catalog of dozens of entries with reviewed example requests may never need vectors.

## Scope

In:

- `POST /v1/search` in `stacks-api`, the `Embedder` and `SearchVectorStore` services, the `search_vectors` table, and a step in `maintain` that refreshes vectors after an index deploy.
- `Settings.search: "local" | "hybrid"` (default `"local"`) in this repository, set by `stacks search-hybrid enable | disable | status`, the remote call and fusion in `core/search/`, and `ranking` and `remote` in `SearchResult`.
- Moving `SearchMetadata` and `SearchVocabulary` from `packages/cli/src/schemas/search.ts` to `packages/format` (additive, published before the API uses them), now that the API is their second reader (D11).
- `search:eval --remote <url>` (`--embeddings` is 4.5c's).

Out:

- Vectors in the signed index for the CLI to use offline. Ranking offline by vector needs the request embedded on the machine, which means a model in the CLI (too large for an `npx` bundle) or a model call from it (D2's line). Without that, entry vectors on the machine are useless. [Open question 36](../risks-and-open-questions.md#open-questions-for-the-maintainers) records the one variant that might fit: a small WASM model downloaded on demand into the cache.
- A vector database. Dozens of entries with a handful of vectors each fit in one Worker's memory.
- Query rewriting, expansion or reranking by a model. Nothing calls a language model on the query path; semantics live in the reviewed cards (4.5b) and the embeddings. The embedding model is the one model this sub-phase calls, and D37 names it as the exception: it reads reviewed sidecars in `maintain` and the request in `POST /v1/search`, and writes nothing but vectors.
- User, project and source entries in the semantic leg. The server knows only official entries; local entries keep their lexical rank.
- Any record of requests: no log, table, cache or count by text.

## Design

### What is embedded

Per official entry, from its reviewed sidecar:

- One card vector over `name. summary. description. Platforms: …. Kinds: …. Use cases: …. Good for: ….` (not the body: bodies are tool instructions, and embedding them pulls requests toward whatever technical words they share, the same trap 4.5a's `trap` pool tests).
- One vector per example request in `requests`.

An entry's semantic similarity to a request is the larger of its card similarity and its best request similarity, so five near-identical requests count once.

Each vector is keyed by `(kind, id, docDigest, model)`, where `docDigest` is sha256 of the exact embedded text. Changing the model or the text makes a new key; an entry whose key exists is not embedded again.

### The model and where it runs

Decided here, pending open question 36: Workers AI's embedding model through the Worker's AI binding, named once in the API's config (`SEARCH_EMBEDDING_MODEL`). The request then never leaves the platform that already terminates the API's TLS, no third party sees it, and no new secret exists. The alternative, an embedding model through OpenRouter, may embed better but sends each request to two more parties and needs an API key on the Worker; it stays behind the same `Embedder` service if the experiment says it wins by enough to be worth that.

`Embedder` (`stacks-api/Embedder`) has a Workers AI layer, a deterministic fake for tests (hashed character n-grams, so similar strings are near), and nothing else. The Node entry has only the fake, so `bun run dev` can serve the route without an account.

### Where vectors live and how they are rebuilt

`search_vectors(kind, id, doc_digest, model, dims, vector BLOB, created_at)` in D1, through `services/SearchVectorStore.ts` (the Store row of `stacks-api/.claude/rules/api/effect-api.md`: an in-memory layer and a SQL layer over `SqlClient`). A step in 4.1c's `maintain` (at the path 4.1c gives it, `maintenance/maintain.ts`, which predates that rule; [open question 37](../risks-and-open-questions.md#open-questions-for-the-maintainers)), under its lease, reads `v1/search.json` through `IndexAssets` (signature verified), embeds every card and request whose key is missing, and deletes rows for entries no longer in the index. An index deploy is therefore picked up on the next scheduled run; `bun run search:vectors` runs the same step by hand after a deploy.

At request time the Worker loads every row for the current model (dozens to a few hundred vectors) into isolate memory once per index `generatedAt` and compares by cosine similarity over all of them. Cloudflare Vectorize was considered and rejected: another binding, eventual consistency after writes, and approximate search, for a set a loop covers in microseconds.

### The route

```
POST /v1/search
Content-Type: application/json
{ "request": "something people install on their phone to log workouts" }   // 1 to 500 characters

200 { "model": "<id>", "indexGeneratedAt": "…",
      "items": [{ "kind": "stack", "id": "mobile-expo", "similarity": 0.61,
                  "matched": "request" }] }                                   // top 20, similarity ≥ 0.2
```

POST, so the request is never in a URL, a proxy log or a CDN cache key. `Cache-Control: no-store` (the API default). `400 BadInput` for a missing, empty or over-long request; `429 RateLimited` at 30 requests per minute per network hash (4.1b's `RateLimiter`, own counter); `503 Unavailable` when the embedder or the store fails. The route has no extension, and errors use `ApiErrorEnvelope`.

What the server keeps, decided here: nothing derived from the text. The request body is held for the length of the call. The request logger records the route, status and duration for `/v1/search` and never the body; the handler logs no field derived from the text; no table stores it; no counter is keyed by it. One internal number is kept: a daily count of `/v1/search` calls in 4.1d's `daily_metrics`, read by the maintainers to decide whether the leg is worth keeping. The `/telemetry` privacy page gets a "Search" section saying all of this, and that Workers AI processes the text.

### In the CLI

The remote leg runs only when all of these hold: `Settings.search` is `"hybrid"`; the run isn't offline (`--offline` or `STACKS_OFFLINE=1`, 4.0d); `STACKS_INDEX_URL` is the default (so the server's entries are the ones the CLI shows); `AppConfig.apiUrl` is the default (or a source build's local URL, 4.2g); and none of `DO_NOT_TRACK`, `STACKS_TELEMETRY_DISABLED` (each set to anything but empty, `0` or `false`) or `CI` (any value) is set. The environment rules are 4.1a's consent rules, reused so one switch a person already set keeps meaning "send nothing".

The setting is turned on and off by a command shaped like 4.1a's `telemetry` commands:

| Command | Effect |
|---|---|
| `stacks search-hybrid enable` | Writes `"search": "hybrid"` to `config.json`. Refuses with `PermissionDenied` (reasons `agent` and `no-tty`) when `AppConfig.agent` is not `"none"` or `Host.stdinIsTTY` is false (Trust model, point 4), so an agent can't decide on the user's behalf to send their idea away |
| `stacks search-hybrid disable` | Writes `"search": "local"`. Works under an agent and without a TTY: turning it off must always be easy |
| `stacks search-hybrid status [--json]` | The setting and, when it is hybrid but the leg wouldn't run, the first reason from the list above (`offline`, `index_url`, `api_url`, `do_not_track`, `environment`, `ci`) |

No flag or environment variable sets `Settings.search`. The trust model's stated limit applies: the refusal stops an agent from turning the leg on through the CLI, not an agent with write access to the user's files from editing `config.json` directly; that is the same account-level limit the trust model already names (open question 9). `doctor` reports the setting.

The call uses 4.0d's rules: a 1,500 ms deadline, one attempt, a 10-minute backoff after a failure in its own state file. Results are not cached on disk (that would store request text).

Fusion, in `core/search/fuse.ts`: for each official entry, `fused = 0.6 × lexical + 0.4 × semantic`, where `lexical` is 4.5c's absolute score and `semantic` maps similarity to [0, 1] linearly between 0.2 and 0.6. Weights are tuned on the `tune` split. Rank-only fusion (reciprocal rank fusion) was the other option and is rejected here: it throws away how strong a match is, so a weak semantic rank-1 counts nearly as much as a strong one, and with a few dozen candidates the rank positions carry little information. Entries the server didn't return (local entries, or under the floor) keep `semantic = 0`.

Tiers use the fused score, with one more rule: an entry matched only semantically (no lexical field matched) is `strong` only when its similarity is at least 0.35, so a vague concept match can't present itself as a confident fit.

`SearchResult` gains `ranking: "local" | "hybrid"` (4.5c always wrote `"local"`) and `remote: "used" | "off" | "unavailable"`. When the setting asks for hybrid and the call fails, the result is the local ranking with `remote: "unavailable"`, and agent text says so on one line. A hybrid setting never silently returns local results: every fallback is in the result. Each hit's `why` gains `{ field: "semantic", matched: "request" | "card", similarity }` when the leg contributed.

### Evaluation

The CI gate stays 4.5c's, local and deterministic. `bun run search:eval --remote <url>` runs the set against a local or deployed API through the real route with a hybrid setting and prints local and hybrid metrics side by side; a maintainer runs it before changing the model, the weights or the floor, and after each index deploy that changes cards, and records the report in `plans/runs/`. A model change that lowers hybrid MRR below local MRR on the holdout split is not shipped.

## Files and areas touched

| Path | Change |
|---|---|
| `stacks-api/apps/api/src/handlers/search.ts`, `packages/contract/src/api.ts` | The route |
| `stacks-api/apps/api/src/services/Embedder.ts`, `services/SearchVectorStore.ts` | Services with their layers |
| `stacks-api/apps/api/src/maintenance/maintain.ts` (4.1c's path; open question 37) | The vector refresh step |
| `stacks-api/apps/api/migrations/` | `search_vectors` |
| `stacks-api/apps/api/wrangler.jsonc`, `src/config.ts` | The AI binding, `SEARCH_EMBEDDING_MODEL` |
| `stacks-api/apps/api/src/platform/` | The request logger's body rule for `/v1/search` |
| `stacks-api/apps/web/src/pages/telemetry.astro` | The "Search" section |
| `packages/cli/src/schemas/config.ts` | `Settings.search` |
| `packages/cli/src/commands/search-hybrid.ts`, `src/cli.ts` | `enable`, `disable`, `status` |
| `packages/format/src/search.ts`, `packages/cli/src/schemas/search.ts` | `SearchMetadata` and `SearchVocabulary` move to `packages/format`; the CLI imports them from there |
| `packages/cli/src/core/search/remote.ts`, `fuse.ts`, `src/schemas/search.ts` | The call, fusion, `ranking` and `remote` |
| `packages/cli/src/commands/doctor.ts` | Report the setting |
| `packages/cli/scripts/search-eval.ts` | `--remote` |
| Tests in both repositories | New |

## Acceptance tests

1. The start condition's numbers are recorded in this file before any code lands.
2. `POST /v1/search` with the fake embedder returns items with similarity at or above 0.2, at most 20, sorted by similarity, and decodes with the contract schema; a body over 500 characters is `400 BadInput`; the 31st call in a minute from one network is `429` with `Retry-After`.
3. After a request with a sentinel string, no log line, table row or `daily_metrics` field contains the sentinel; `daily_metrics` has the call counted.
4. The vector refresh step embeds each card and request once; a second run embeds nothing; an edited sidecar re-embeds only that entry; a changed `SEARCH_EMBEDDING_MODEL` re-embeds everything under the new key; an entry removed from the index loses its rows.
5. Vectors are loaded once per index `generatedAt` per isolate (a counter in the in-memory store).
6. CLI with `Settings.search: "local"`: no request to `/v1/search` (a recording server), `ranking: "local"`, `remote: "off"`.
7. CLI with `"hybrid"`: one request with the text in the body only, `ranking: "hybrid"`, `remote: "used"`; with `--offline`, `STACKS_OFFLINE=1`, `DO_NOT_TRACK=1`, `STACKS_TELEMETRY_DISABLED=1`, `CI=1`, or a non-default `STACKS_INDEX_URL`, no request and `remote: "off"`, and `search-hybrid status --json` names that reason.
8. CLI with `"hybrid"` and the server down, hanging past 1,500 ms, or returning bad JSON: the local ranking, `remote: "unavailable"`, one agent-text line saying so, and the command finishes within 1.5 s of the local run; a second run within 10 minutes makes no request.
9. Fusion over fixture scores matches hand computation; a concept-only match at similarity 0.3 is not `strong`, at 0.4 it can be.
10. A user entry in the local registry keeps its lexical rank in a hybrid search and carries no `semantic` in `why`.
11. `search:eval --remote` against a local API with the fake embedder prints local and hybrid metrics for both splits.
12. No flag or environment variable sets `Settings.search`; `doctor --json` reports it. `search-hybrid enable` with an agent marker set exits 6 (`PermissionDenied`, reason `agent`), and with no agent but stdin not a TTY exits 6 (reason `no-tty`), leaving `config.json` unchanged in both cases; with no agent and a TTY it writes `"search": "hybrid"`. `search-hybrid disable` under an agent marker and without a TTY succeeds and writes `"local"`.
12a. `SearchMetadata` and `SearchVocabulary` decode from `@stacks/format`; the CLI's bundled sidecars still decode and every 4.5b and 4.5c test passes unchanged after the move.

### Realistic edge cases

13. A request in another language returns whatever similarities the model gives without error; the CLI still applies the platform rule from aliases.
14. The index deployed with a new entry before the scheduled step ran: the route returns similarities for the entries it has, and the new entry ranks lexically only until the step runs.
15. A request of 500 multi-byte characters is accepted (the limit counts characters, not bytes); 501 is refused.
16. The AI binding returns a vector of the wrong length: the step logs the model and entry, stores nothing for it, and the route skips that entry.

## Exit criteria

- Start condition met and recorded; acceptance tests pass; the gate green in both repositories.
- A `search:eval --remote` report against the deployed API in `plans/runs/`, with hybrid at or above local on every metric.
- D36 agreed.

## What this plan may get wrong

- The start condition may never be met. That is a fine outcome: it means reviewed cards were enough at this scale.
- A linear similarity map between 0.2 and 0.6 assumes the model's similarity range; another model has another range. The floor and the map are config tuned with the model.
- Opt-in by a person-only command means few people will turn it on. That is the price of not sending product ideas by default; if the maintainers want it on by default, D36 is where that is argued, with the privacy page changed first. Open question 36's local query model is the one route to semantic search on by default without sending anything.
- 2026-10-27: the first draft made `Settings.search` a file-only setting "so an agent can't turn it on", but an agent writes `config.json` as easily as a person. It now follows 4.1a's `telemetry enable`: a command that refuses under an agent or without a TTY, with the file-editing limit stated rather than claimed away. The start condition also read both splits, which the people who write the cards could meet by echoing the tune queries; it now reads the holdout paraphrases only.
- Holding vectors in isolate memory assumes the set stays small. Past a few thousand vectors, revisit the store, not the route.
