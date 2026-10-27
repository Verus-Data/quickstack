# Phase 4.0b: API skeleton and hosting spike

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | `packages/api` is a working Effect HTTP program that serves only `GET /healthz`, with its own gate run by the root fan-out, and a time-boxed Cloudflare Workers spike answers open questions 16 and 17 and writes a D16 recommendation |
| Traces to | "no public registry exists yet" (assumption 6, which phase 4 replaces with a real host). D11: "an API and an MCP server will each be their own package". D16 |
| Depends on | 4.0a (the spike proves `@stacks/format` runs inside the Workers runtime), D16 (proposed; this sub-phase produces the evidence for it) |
| Blocks | 4.0c (static hosting config), 4.1b (the platform layer and test harness) |
| Decisions needed | D16. The spike runs first; the maintainers decide D16 from its findings before the skeleton's platform layer is written. If they pick a Node server, `src/platform/node.ts` replaces `src/platform/worker.ts` and the tests run only against the Node adapter |
| Settles | Open questions 16 and 17 (answers recorded here for the maintainers); the API's program structure; how the API is tested; which Effect HTTP exports it uses |

## Scope

In:

- The spike, first, time-boxed to half a session, with findings written into this file.
- Filling in the `packages/api` placeholder: Effect program, config, logging, error mapping, `/healthz`, a 404 envelope for every other dynamic path, tests, and scripts the root fan-out runs.
- Wrangler config for a Worker with a static assets directory (empty in this sub-phase; 4.0c and 4.0e fill it).
- A first manual deploy of `/healthz` by a maintainer, if D16 picks Workers.

Out:

- The registry index and bundles (4.0c), the official-names file and directory pages (4.0e). They are static assets, not routes.
- Ingest, storage and the scheduled entry's real work (4.1b, 4.1c). The spike only proves a scheduled handler can be wired.
- CI changes. The API's tests run in the existing CI job through the root scripts; CI deploys are 5.2.

## Design

### Where this fits

4.0a gave the repo a platform-free format package. This sub-phase gives it a running, tested API that does almost nothing, and the facts needed to choose its host. 4.0c then puts the signed index into the static assets directory configured here, 4.0e adds the official-names file and the directory, and 4.1b adds the first real route on the platform layer and test harness this sub-phase settles.

### The spike

Run before any skeleton code. Each question gets a short answer and the evidence (commands run, versions) in a "Spike findings" section appended to this file.

| Question | How to answer it |
|---|---|
| Open question 17: does the Workers Vitest pool run with the repo's Vitest 5 on Node? | Add `@cloudflare/vitest-pool-workers` and `wrangler` as dev dependencies in a scratch branch; run one test that calls the Worker's fetch handler in workerd. Record the pool version and whether it accepts Vitest 5 |
| If not, what harness? | Fall back to Node tests that start the Worker with Wrangler's local runtime (`wrangler dev`, or its programmatic API) and call it with `fetch`. Record start-up time per test file |
| Does Effect's HTTP stack run in workerd? | Build `/healthz` with `HttpApi`, `HttpApiGroup`, `HttpApiEndpoint` from `effect/http-api` and `HttpApiBuilder`, and turn it into a fetch handler with `HttpRouter.toWebHandler` from `effect/http` (both exports confirmed in the installed `effect` 4.0.6). Record bundle size against the Workers script limit |
| Does `@stacks/format` run there? | Decode a fixture entry and compute a `bundleDigest` inside the Worker |
| Do static assets get cache headers from host config? | Put a `_headers` file in the assets directory; check `Cache-Control` on a fixture `v1/index.json` and `v1/entries/...` file under `wrangler dev`. Confirm assets are served before the Worker runs, so the index never touches Effect code |
| Can a scheduled handler call an Effect program? | A no-op `scheduled` export run with Wrangler's scheduled-test mode |
| Is there an `effect/sql` D1 driver at a version compatible with `effect` 4.0.6? | Check npm. If not, 4.1b writes a small `SqlClient` adapter over the D1 binding, or D16 changes; record which |
| Open question 16: if D17 is declined, is a Worker needed at all? | With no telemetry, phase 4 serves only static files (index, bundles, directory). Answer whether static assets alone (no Worker script, or the Worker serving only `/healthz`) cover it, and what a later move to a plain static host would cost |

The findings end with a D16 recommendation in two or three sentences. The maintainers record the decision in the README log; this file doesn't.

### Program structure

Same conventions as the CLI (`AGENTS.md`, Conventions): namespaced `Context.Service` classes with static layer factories, schemas decoded at the boundary, fixed tagged errors with one exhaustive status table, no state across requests.

```
packages/api/src/
  api.ts            HttpApi definition: HealthGroup only
  handlers/health.ts
  errors.ts         tagged errors and apiErrorTable (NotFound 404, BadInput 400, Unavailable 503; 4.1b adds more)
  config.ts         the only place that reads env or Worker bindings
  logging.ts        structured logs, no request bodies, no IPs
  app.ts            builds the fetch handler from the api and layers
  platform/worker.ts  the Worker export: fetch (and, from 4.1c, scheduled)
tests/
  helpers/server.ts   real HTTP server around the fetch handler
  health.test.ts
```

Error responses use the CLI's envelope (see roadmap, Contracts: Error envelope) without `details`: `{ "error": { "tag", "message", "retryable" } }`. Any path the Worker sees that isn't a route returns the `NotFound` envelope with status 404.

`src/errors.ts::apiErrorTable` is the one exhaustive table from tag to status and `retryable`, checked by the type system the same way the CLI's `errorTable` is. This sub-phase defines four rows; [4.1b](phase-4.1b-telemetry-ingest-and-storage.md) adds the four the ingest route needs, and no handler picks a status outside the table:

| Tag | Status | Retryable | Added in |
|---|---|---|---|
| `BadInput` | 400 | no | 4.0b |
| `NotFound` | 404 | no | 4.0b |
| `Unavailable` | 503 | yes | 4.0b |
| `Defect` | 500 | no | 4.0b |
| `MethodNotAllowed` | 405, with `Allow` | no | 4.1b |
| `PayloadTooLarge` | 413 | no | 4.1b |
| `UnsupportedMediaType` | 415 | no | 4.1b |
| `RateLimited` | 429, with `Retry-After` | yes | 4.1b |

`/healthz` returns a static `ok` here. Once 4.1b gives the API a store, it checks the store and returns 503 when the store is down.

The API's service keys use the `stacks/api/<Name>` namespace (for example `stacks/api/Config`), so they never collide with the CLI's `stacks/<Name>` keys.

### Package scripts

`build` (Wrangler dry-run bundle into `dist/`), `typecheck`, `test`, `coverage`, `check`, `clean`, and `deploy` (Wrangler deploy, run only by a maintainer by hand). Root `bun run check` reaches it through the `--filter '*'` fan-out, and the existing CI job runs its `typecheck` and `coverage`. Wrangler and the Workers pool go in the root catalog as dev dependencies (roadmap, Other shared facts: New dependencies). No secret is read or needed in this sub-phase.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/api/package.json`, `tsconfig.json`, `biome.json`, `wrangler.jsonc`, `vitest.config.ts` | Fill in the placeholder |
| `packages/api/src/`, `tests/` | As above |
| `packages/api/README.md` | How to run locally, how a maintainer deploys by hand |
| Root `package.json` | Catalog entries for `wrangler` and the Workers Vitest pool (if the spike keeps it) |
| `.claude/rules/api/` | New rules scoped to `packages/api/`: env and bindings only in `config.ts`, no IP in logs, no state across requests |
| `AGENTS.md` | `packages/api` in the Overview and architecture map; its commands |
| This file | "Spike findings" section |

## Acceptance tests

- `GET /healthz` returns 200 `{ "status": "ok" }` through a real local HTTP server around the fetch handler, and through the local Workers runtime.
- `GET /nope`, `GET /v1/entries/stack/Bad_Id/x.json` and `GET /v1/entries/stack/%2e%2e/x.json` return 404 with the `NotFound` envelope. (Tests use invalid ids and percent-encoded dots because `fetch` normalizes a literal `../` before the request is sent.)
- Every tag in `apiErrorTable` maps to exactly one status; a test iterates the table and checks each tag's response status and `retryable`.
- A handler defect returns 500 with a `Defect` envelope, and the log line has the class and stack frames but no message (same rule as the CLI).
- `packages/api` typechecks without `@types/bun`.
- Static asset served from the assets directory carries the `Cache-Control` from `_headers` (spike fixture, kept as a test if the harness allows).

## Exit criteria

- Spike findings written in this file, answering open questions 16 and 17 with evidence, and a D16 recommendation.
- D16 decided by the maintainers, or explicitly deferred with the in-memory and Node test harness as the only target.
- Acceptance tests pass; `bun run check` green from the repo root, including `packages/api`.
- If D16 is Workers: a maintainer has run `deploy` once and `/healthz` answers on the account's Workers subdomain.

## What this plan may get wrong

- Effect's HTTP API modules may be too large or use an API workerd lacks. The fallback is a plain fetch handler with Schema decoding and the same routes and envelope; record it in the findings.
- The Workers pool may lag Vitest majors. If it doesn't support Vitest 5, the Wrangler-runtime harness is slower; keep runtime tests few and put logic tests on the plain Node server.
- Answering open question 16 with "static only" may tempt skipping the Worker. That's fine if D17 is declined; if D17 is agreed later, 4.1b adds the Worker back.
