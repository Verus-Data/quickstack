# Phase 4.0a: API foundation and the registry index

Status: DRAFT 2026-10-26 (not agreed). Phase 4.0 is split in two: this file builds the
API package and publishes the index; [4.0b](phase-4.0b.md) teaches the CLI to read it.

| Field | Value |
|---|---|
| Goal | `packages/api` is a working Effect HTTP API with its own gate and CI wiring, the format schemas live in `packages/format` and are shared by the CLI and the API, and every merge to `main` publishes a versioned, content-addressed registry index of official entries with each stack's last canary result |
| Traces to | "Stacks don't rot: A stack that passed last month still passes this month without a prose change." Open question "How does a stack prove it still works?" The evidence line "the remote registry 404s today", which is what this replaces. D11: "an API and an MCP server will each be their own package" |
| Depends on | 2.1 (canary results to publish), 3.2 (the trust fields and source origin the index reuses), D16 (hosting, proposed) |
| Blocks | 4.0b, 4.1b, 4.2, 4.3 |
| Decisions needed | D16 (API hosting, proposed). New open question for the maintainers: does the index serve only entry content whose fingerprint has a green canary run (recommended), or every validated revision? |
| Decisions or questions this settles | The API's program structure; what moves into `packages/format`; the index and entry bundle formats; how the index is versioned and published |

## Scope

In:

- `packages/format`: the entry, manifest, verify step and run-record schemas, plus the pure composition and fingerprint functions, extracted from `packages/cli` with no behavior change.
- `packages/api`: fill in the placeholder package. Effect program, layers, config, logging, error mapping, health route, tests, its own `check` script and CI job.
- An index build step that reads `packages/cli/registry/` and the run ledger and writes static JSON.
- Routes: `GET /healthz`, `GET /v1/index.json`, `GET /v1/entries/:kind/:id/:digest.json`.
- Deployment wiring behind a flag, so nothing deploys until the maintainers provision the host.

Out:

- Telemetry ingest (4.1b) and stats (4.2).
- Third-party or community entries in the index. It serves the official registry only.
- Any write endpoint, auth or accounts.
- The CLI side (4.0b).

## Design

### Hosting (D16, proposed)

| Option | For | Against |
|---|---|---|
| Cloudflare Workers, static assets for the index, D1 for later ingest, R2 for archives | No server to patch; about $5 a month at expected volume; static assets suit an index that changes only on merge; edge caching for free | Workers runtime is not Node: no `node:fs`, request-scoped execution, D1 is SQLite with its own limits; tests need the local Workers runtime |
| A Node server (container on a small VM or a managed platform) with Postgres | Same runtime as the CLI's tests; Postgres is familiar; testcontainers for tests (`ensure-docker` exists on the dev machine) | A server and a database to run, back up and patch; more cost; the index still wants a CDN in front |

Recommendation: Workers. The index is static-first, and ingest in 4.1b is small, append-only and anonymous, which fits D1. To keep the choice reversible, the API's domain code depends only on Effect services (`IndexStore`, later `EventStore`), with the Workers bindings provided by one layer in `src/platform/worker.ts`. A move to Node and Postgres is then a new platform layer, not a rewrite. The maintainers decide; until they do, this sub-phase builds and tests against an in-memory store and the static files, which both options use.

### Program structure

Same conventions as the CLI (`AGENTS.md`): namespaced `Context.Service` classes with static `layer` factories, schemas decoded at the boundary, fixed tagged errors with an exhaustive status table, no globals across requests. The API is built with Effect's HTTP modules. The installed `effect` exposes `effect/http` and `effect/http-api`; confirm the exact export names (API group and endpoint builders, the web-handler conversion) from the installed types before writing code, because they differ from Effect 3.

```ts
// packages/api/src/api.ts (shape, not exact names)
export const RegistryGroup = HttpApiGroup.make("registry")
  .add(HttpApiEndpoint.get("index", "/v1/index.json").addSuccess(RegistryIndex))
  .add(HttpApiEndpoint.get("entry", "/v1/entries/:kind/:id/:digest.json")
    .setPath(EntryPath).addSuccess(EntryBundle).addError(NotFound, { status: 404 }));
export const Api = HttpApi.make("quickstacks").add(RegistryGroup).add(HealthGroup);
```

The handler is exported as a fetch-style web handler so it runs on Workers and in a Node test server unchanged. Tests start a real local HTTP server around that handler (Node `http.createServer` adapting requests) and call it with `fetch`.

Error responses use the CLI's envelope shape, `{ "error": { "tag", "message", "retryable" } }`, so one client decoder works for both.

### `packages/format`

Moves, with re-exports left in `packages/cli/src/schemas/` for one release so imports change in one place: `Entry` (stack and fragment frontmatter), `VerifyStep`, `Manifest`, `RunRecord`, `RegistryIndex`, `EntryBundle`, the pure `compose` and `fingerprint` functions, and the conditional-block evaluator. No Effect platform imports, no Bun, no Node: the package must run on Workers. Its tests are the CLI's existing schema and composition tests, moved.

The CLI's Grit boundaries stay in the CLI. `packages/format` gets its own `biome.json` (`"root": false, "extends": "//"`) and a Grit rule banning `node:*`, `bun` and `@effect/platform-*` imports.

### Index format

```ts
export const RegistryIndex = Schema.Struct({
  formatVersion: Schema.Literal(1),          // index layout; a new major is ignored by old CLIs
  generatedAt: Schema.String,                // ISO time
  commit: CommitSha,                         // registry commit it was built from
  minCli: Schema.String,                     // oldest CLI that may read it
  entries: Schema.Array(Schema.Struct({
    id: EntryId,
    kind: Schema.Literals(["stack", "fragment"]),
    schemaVersion: Schema.Int,               // the entry's own schema_version
    name: Schema.String,
    description: Schema.String,
    tags: Schema.Array(Schema.String),
    category: Schema.optional(Schema.String),
    appliesTo: Schema.optional(Schema.Array(Schema.String)),
    digest: Digest,                          // sha256 of the canonical EntryBundle
    fingerprint: Schema.optional(Digest),    // stacks: composition fingerprint with defaults
    lastRun: Schema.NullOr(Schema.Struct({
      date: Schema.String, result: Schema.Literals(["pass", "fail", "partial"]),
      agent: Schema.String, minutes: Schema.Number,
    })),
  })),
});

export const EntryBundle = Schema.Struct({
  id: EntryId, kind: Schema.Literals(["stack", "fragment"]),
  files: Schema.Array(Schema.Struct({
    path: Schema.String,                     // relative to the entry directory
    encoding: Schema.Literals(["utf8", "base64"]),
    content: Schema.String,
    executable: Schema.Boolean,
  })),
});
```

Bundles are content-addressed: the URL contains the digest, so a bundle never changes once published and can be cached forever. The index is the only mutable file; it is served with a short cache lifetime (five minutes) and `stale-while-revalidate`.

### Publishing

`packages/api/scripts/build-index.ts` reads the bundled registry and the run ledger (2.0), runs the same `validate` the CLI runs, and writes `dist/static/v1/index.json` plus one bundle file per entry. It refuses to build when `validate` reports an error. A CI job on `main` builds it and, when `DEPLOY_ENABLED` is set by the maintainers, deploys. Until then the job uploads the built index as an artifact so its shape is reviewable.

Which revision of a stack the index serves is the new open question above. The recommendation is: for stacks, the newest revision whose fingerprint has a `pass` record in the ledger; for fragments, the newest revision included in some stack's passing composition, or the newest validated revision if no stack uses it. That way the index only moves a stack forward after the canary proved it, and "changed since last green" content stays on `main` until it is proven.

### Failure modes

| Case | Result |
|---|---|
| Registry fails `validate` at build | Build fails; the previous index stays live |
| Unknown entry digest requested | 404 envelope, `NotFound` |
| Bad path segment (not kebab-case, not a digest) | 400 envelope, `BadInput`, decoded by the path schema |
| Store unavailable (later, with D1) | 503 envelope, `retryable: true` |
| A stack with no passing run | Omitted from the index if the recommendation is agreed; included with `lastRun: null` if not |

### Decisions settled here

- Static-first. Everything the CLI needs from the index is a file; the Worker or server adds only dynamic routes later. A CDN outage and an API outage are the same outage, and both fall back to the bundled registry (4.0b).
- Content-addressed bundles. The CLI can verify what it downloaded against the index digest, and a bundle URL is safe to cache forever.
- The index carries `lastRun` per entry. That is the "stacks don't rot" signal made visible to agents through `list --json` without telemetry.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/format/` | New package: `package.json`, `tsconfig.json`, `biome.json`, `src/` (schemas, compose, fingerprint, conditionals), `tests/` |
| `packages/cli/src/schemas/*`, `src/core/compose.ts` | Re-export from `packages/format` |
| `packages/api/` | Fill in the placeholder: `src/api.ts`, `src/handlers/registry.ts`, `src/platform/worker.ts` (or `node.ts` per D16), `src/config.ts`, `src/errors.ts`, `scripts/build-index.ts`, `tests/`, `package.json` scripts (`check`, `test`, `build`) |
| `.github/workflows/ci.yml` | API and format packages join `ci-ok`; index build job on `main` |
| `.claude/rules/api/` | New rules directory scoped to `packages/api/` per `docs/harness.md` |
| `AGENTS.md` | Architecture map entries for `packages/format` and `packages/api`; commands table |

## Acceptance tests

- Moving the schemas changes no CLI behavior: the full CLI suite and binary e2e pass unchanged.
- `packages/format` builds and tests with no Node or Bun types in its tsconfig (proves Workers-safe).
- `build-index` over the fixture registry produces an index that decodes against `RegistryIndex`; every bundle's sha256 matches its digest; a fixture entry that fails `validate` makes the build exit non-zero.
- Real local HTTP server around the handler: `GET /v1/index.json` returns 200 with the cache headers; `GET /v1/entries/stack/go-cli/<digest>.json` returns the bundle; an unknown digest returns the 404 envelope; `GET /v1/entries/stack/../x.json` returns 400.
- With the "proven only" rule: a fixture stack whose ledger record's fingerprint doesn't match its current content is served at its last proven revision.
- `GET /healthz` returns `{ "status": "ok" }`.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root, now including `packages/format` and `packages/api`.
- CI runs both new packages inside `ci-ok`; the index artifact uploads on `main`.
- D16 is decided or explicitly deferred, and the open question on proven-only serving is answered, before 4.0b ships.
- `AGENTS.md` describes the new packages.

## What this plan may get wrong

- Effect's HTTP API modules may not run cleanly on Workers in the installed release. Check that first with a one-route spike; if it fails, the fallback is a plain fetch handler with Schema decoding, keeping the same routes.
- Serving only proven revisions makes the canary a release gate for stack prose. If the canary is flaky, stacks will stall; the canary's own reliability (2.1) has to be good before that rule bites.
- Extracting `packages/format` before the API needs much of it may be early. The index build is the second consumer, which is the trigger D11's layout sets.
