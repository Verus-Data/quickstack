# PostgreSQL with Effect SQL

The fragment's brief section states the contract. This file holds the detail: the Compose services, the scripts, the test harness and the layout on each stack. Look up every driver, migrator and SQL client name in the installed declarations first, then the driver package's bundled docs, then the effect-smol source. Pages written for Effect 3 describe a different package layout.

## Compose services

One `compose.yaml` at the repository root, current Compose spec:

- A top-level `name` from `COMPOSE_PROJECT_NAME`, defaulting to the project slug, so two projects never share containers. A second checkout of the same project sets its own `COMPOSE_PROJECT_NAME`, `PORT_DB` and `PORT_DB_TEST` in `.env`, because host ports are shared.
- `db`: the chosen image, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` from env with the local default `app` for each, host port `${PORT_DB:-5432}` bound to `127.0.0.1`, a named data volume (check the image docs for the mount path; it changed in recent majors), and a `pg_isready -U <user> -d <db>` healthcheck with a start period.
- `db-test`: the same image and credentials, host port `${PORT_DB_TEST:-5433}` on `127.0.0.1`, a tmpfs data directory, durability off (`fsync=off`, `synchronous_commit=off`, `full_page_writes=off`) and the same healthcheck.

`.env.example` gets `COMPOSE_PROJECT_NAME`, `PORT_DB`, `PORT_DB_TEST`, the three `POSTGRES_*` values, `DATABASE_URL` pointing at `db`, and `TEST_DATABASE_URL` pointing at the `postgres` maintenance database on `db-test`. These are local development credentials; production supplies its own `DATABASE_URL`.

Docker Compose reads `.env` itself. Vitest and the Node server don't, so the test harness builds its default URL from `PORT_DB_TEST` (which verify sets) when `TEST_DATABASE_URL` is absent, and config builds the development fallback from `PORT_DB`.

For verify, pass non-default ports in the shell as well, for example `PORT_DB=15432 PORT_DB_TEST=15433 stacks verify`. Verify supplies its manifest defaults in the step environment, which takes precedence over Compose's `.env`. If `.env` sets database URLs, make their ports match.

## Scripts

Package scripts, each a short command line:

| Script | Does |
| --- | --- |
| `db:up` | `docker compose up` both services detached, waiting for their healthchecks; fails loudly if either never becomes healthy |
| `db:migrate` | Runs the migrate entry on Node, with the same optional env-file loading `start` uses |
| `db:down` | `docker compose stop`; the named volume keeps development data, and `db-test`'s tmpfs data goes |
| `test:db` | Starts `db-test` detached and waits for its healthcheck (a no-op when it already runs), then runs Vitest with the database config |

Verify runs `db:up`, `db:migrate` (against the development database, through the same config fallback the server uses, since verify doesn't load `.env`) and `test:db`. It starts whichever service isn't running and stops neither, because a dev server, another agent or a watch run may be using them. A person stops them with `db:down`.

## Migrations

Each migration is a module whose default export is an Effect that gets the SQL client service and runs its statements, named `<4-digit id>_<snake_name>.ts`. One index module imports them in order and builds the migrator's record loader, so tsc checks every migration and the bundler can include them. Prefer one statement per call: prepared statements can't hold several. Migrations are append-only once applied anywhere shared.

The migrate entry builds the live client from `DATABASE_URL`, runs the release's migrator with that loader and the default migrations table, logs each applied id and name, closes the pool and exits non-zero on failure. Use the generic migrator rather than the driver's schema-dump variant, so no `pg_dump` binary is needed.

## Test harness

The harness has three parts, all in the test helpers directory.

1. **Global setup, once per `test:db` run.** Generate a run id (8 random hex characters). On the maintenance database, create `<prefix>_tpl_<runid>` and run the real migrations on it, dropping it again if either step fails. Close that pool before handing over: `CREATE DATABASE ... TEMPLATE` fails while anything is connected to the template. Pass the template name to the test files through Vitest's provide/inject. Global teardown drops the template `WITH (FORCE)`.
2. **One database per test file.** Call the helper at module scope during Vitest's test collection (for example `const db = testDatabase("items")`); it registers `beforeAll` and `afterAll` there. Setup creates `<prefix>_<runid>_<label>_<random>` from the template and builds the live client layer over its URL with `application_name` set to that database name. Teardown closes the layer's scope first, then drops the database `WITH (FORCE)` from the maintenance connection. Registering `afterAll` from inside a running test does not reliably clean up that file's database.
3. **Within a file**, tests share the database. Use unique values per test; never truncate tables.

Postgres truncates identifiers at 63 bytes, so `<prefix>` is the project slug with dashes turned into underscores, cut to 20 characters. Names are always quoted. Databases left by a crashed run are listed for a person (`\l` in psql); the harness never drops by prefix.

Raise Vitest's hook timeout for the global setup. Run the suite with file parallelism on; each file owns its database, so files don't interfere.

### What the suite proves

| Test | How |
| --- | --- |
| Explicit migrate command | Create an empty run-owned database, run `bun run db:migrate` as a child process with `DATABASE_URL` pointing at it, check the table exists, run it again and check nothing new applied, then drop the database |
| Round trip | Create through the repository, read it back, compare decoded values |
| Invalid stored row | Insert a row with raw SQL that the database accepts and the schema rejects (for example a name longer than the schema's maximum when the column is plain text); the repository read fails as a defect, and over HTTP the response is the generic 500 envelope with no row data |
| Constraint error | Create two items with the same name; the second fails with `Conflict`, and over HTTP returns 409 with the envelope |
| Rollback | Inside a transaction, insert and then fail; the row is absent afterwards |
| Scope cleanup | After closing a client scope, `pg_stat_activity` on the maintenance connection shows no session with that file's `application_name` |
| Readiness | `/readyz` is 200 on the test database and 503 with the envelope when the URL points at a closed local port, within the timeout; `/healthz` is 200 in both |
| HTTP through the service | Build the app with the repository layer on the file's database and call the proving routes over real HTTP |

## Layout by stack

### typescript-api

- `src/config.ts` reads `DATABASE_URL`. Proving resource: `src/api/items.ts`, `src/handlers/items.ts`, `src/schemas/items.ts`, `src/services/items.ts` (service with `layerMemory` for ordinary tests, and the repository-backed live layer that needs only the SQL client service).
- `src/migrations/` holds the migrations and their index, so the main tsconfig checks them.
- `src/platform/database.ts` builds the live client layer from config; `src/platform/node.ts` provides it to `AppLayer`. `src/platform/migrate.ts` is the migrate entry.
- Add `Conflict` (409) to `apiErrorTable`. `/readyz` lives in the Health group beside `/healthz`, outside `/v1`.
- `vitest.db.config.ts` includes `tests/db/**/*.test.ts` with the global setup; the main config excludes `tests/db/`. Helpers live in `tests/helpers/`.

### astro-fullstack

- The contract gets the `Items` group, its schemas and the `Conflict` error with its status annotation in `packages/contract`; `/readyz` joins the Health group. The site doesn't change, and Astro's dev proxy forwards `/readyz` like `/healthz`.
- Everything else lives in `apps/api`: `src/config.ts`, `src/services/items.ts`, `src/migrations/`, `src/platform/database.ts` and `src/platform/migrate.ts`. The driver goes in `apps/api`'s dependencies only.
- `apps/api/vitest.db.config.ts` includes `apps/api/tests/db/**`; the root workspace's `api` project excludes that directory. Root scripts run `db:migrate` and `test:db` with `bun run --cwd apps/api`, and `compose.yaml` stays at the root.
- `DATABASE_URL` comes through the root `.env`, which `dev:api` and `start` already load.

### react-router

- `app/.server/config.ts` reads `DATABASE_URL`. `app/.server/database.ts` builds the live client layer, and `runtime.ts` adds it to the AppLayer, so the ManagedRuntime owns the pool. Disposing the runtime on hot reload closes the old pool before the new one opens.
- Proving resource: `app/.server/services/items.ts`, shared schemas in `app/schemas/items.ts`, and resource routes `app/routes/api.items.ts` (POST creates, GET lists) through `runRoute`. Add `/readyz` beside `/healthz` as a resource route. Add the conflict error to `statusFor` and `retryableFor`.
- Migrations live in `app/.server/migrations/`. `scripts/db-migrate.ts` is the migrate entry, run with Node; it imports the migrations and the database module through relative paths with explicit TypeScript extensions, since Node doesn't resolve the `~/*` alias. Enable `allowImportingTsExtensions` in the no-emit TypeScript configuration. Keep those modules free of alias imports; if that isn't possible, run the entry through the framework's Vite module runner instead and record the choice under Build workarounds.
- `vitest.db.config.ts` reuses the main config's resolve settings, includes `tests/db/**`, and the main config excludes it. Components never import the database module; the server-import hook already enforces it.
