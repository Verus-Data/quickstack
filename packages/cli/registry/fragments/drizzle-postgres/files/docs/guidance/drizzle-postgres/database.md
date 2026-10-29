# Database

PostgreSQL runs in Docker Compose for development and tests. The app talks to it through Drizzle ORM on the `pg` (node-postgres) driver. Migrations are checked-in SQL under `drizzle/` and are the only source of schema: tests build their databases by running them, never by pushing the schema.

## Services and ports

`compose.yaml` at the repo root has two services from the same official `postgres` image (current major, alpine variant, unless the image decision chose another):

| Service   | Host port               | Data                                                                                                | Used by                                      |
| --------- | ----------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `db`      | `${PORT_DB:-5432}`      | a named volume, mounted where the image docs say for that major (the path changed in recent majors) | the dev and production servers, `db:migrate` |
| `db-test` | `${PORT_DB_TEST:-5433}` | tmpfs, with `fsync`, `synchronous_commit` and `full_page_writes` off                                | `test:db`, `e2e`                             |

Both read `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` from the environment with `app` defaults, publish on `127.0.0.1` only, and have a `pg_isready -U <user> -d <db>` healthcheck with a start period. Set the top-level Compose `name` to the project slug.

Host ports and the Compose project name are shared by every checkout on the machine. A second checkout or worktree sets its own `COMPOSE_PROJECT_NAME`, `PORT_DB` and `PORT_DB_TEST` in `.env`, and its URLs to match, so it never reuses another checkout's containers. `stacks verify` passes `PORT_DB` and `PORT_DB_TEST` defaults to its steps, and those override Compose's `.env` values, so run verify with the chosen ports in its environment too.

## Environment

| Variable            | Default when unset                                                                   | Read by                               |
| ------------------- | ------------------------------------------------------------------------------------ | ------------------------------------- |
| `DATABASE_URL`      | none at runtime; tooling falls back to `postgres://app:app@localhost:${PORT_DB}/app` | the database module, `drizzle.config` |
| `TEST_DATABASE_URL` | `postgres://app:app@localhost:${PORT_DB_TEST}/postgres` (the maintenance database)   | the test harness, Playwright setup    |

Add both, the ports and the `POSTGRES_*` values to `.env.example` beside the lines already there; never replace the file. The running app has no fallback: a missing `DATABASE_URL` fails the first query with an error that names the variable, so production never connects to a local default by accident. Only the developer tooling (`drizzle.config`, the test harness) builds a local default from the port.

drizzle-kit and the test runners run on Node, outside the framework's env loading, and Bun doesn't hand its loaded `.env` to a Node child. `drizzle.config` loads `.env.local` and `.env` itself when they exist (Node's built-in env-file loader), before reading `DATABASE_URL`.

## Migrations

- `db:generate` runs drizzle-kit's generate against the schema file and writes a new migration under `drizzle/`. Review the SQL before committing it, and never edit a migration after it's committed; add a new one.
- `db:migrate` applies the committed migrations to `DATABASE_URL`. It's an explicit step for development and release, never part of app start.
- `db:check` fails when the migration history is inconsistent or when the schema has changes no migration covers. It never writes to `drizzle/`: it runs drizzle-kit's consistency check, then copies `drizzle/` to a temporary directory under the project, generates into the copy (point `drizzle.config`'s output directory at a relative-path env override for this) and fails if the copy gained a file. Check the generator output as well as its exit status: some releases report errors while exiting successfully. Fail unless generation confirms it completed. Remove the temporary copy even on failure. It needs no database. If the installed drizzle-kit's own `check --help` says it compares the schema with the migrations, use that alone.
- `db:up` is `docker compose up -d --wait db db-test`, so it fails loudly when a service never turns healthy. `db:down` is `docker compose stop db`: it keeps the dev data and leaves `db-test` running, because another test run may be using it and its tmpfs data dies when it stops. Nothing in the project runs `docker compose down -v`; a person removes volumes.

`drizzle.config` sets the PostgreSQL dialect, the schema file, `drizzle/` as output and strict mode. The schema file must load under plain Node: no `server-only` import, no path aliases, no imports from app code.

## The database module

One module owns the pool and the Drizzle instance. It creates both on first use, not at import, so the production build and code that never queries don't need a database. The dev server reloads modules, so the module keeps the pool on `globalThis` in development and reuses it. Give the pool a short connection timeout so a down database fails a request in seconds rather than hanging. The app's pool closes when the server process exits; tests and scripts end the pools they create.

Export a factory that builds a repository from any Drizzle instance, and a default repository on the shared one. The app uses the default; tests build one on their own database. Repositories return typed rows and map expected database errors to results the caller can show: a unique violation (Postgres error code `23505`) becomes a field error, never a thrown error that reaches the error boundary. Other errors are thrown.

Readiness runs `select 1` through the same pool with a bounded wait. It answers 200 `{"status":"ready"}` or 503 `{"status":"unavailable"}`, and never includes the error text. Liveness never touches the database.
