# PostgreSQL development and test harness

Use the official current-major Alpine Postgres image by default, or one with required extensions, and the current Compose spec. Migrations are the only schema source; tests create schemas by running them, never from models.

## Compose and commands

**`compose.yaml`**:
- `db`: the chosen image, user/password/db from env (dev default `app`/`app`/`app`), host port `${PORT_DB:-5432}`, a named data volume (check the image docs for the mount path; it changed in recent majors), and a `pg_isready -U <user> -d <db>` healthcheck with a start period.
- `db-test`: same image, host port `${PORT_DB_TEST:-5433}`, tmpfs data dir, durability off (`fsync=off`, `synchronous_commit=off`, `full_page_writes=off`), same healthcheck.

**`.env.example`**: `PORT_DB`, `PORT_DB_TEST`, `POSTGRES_USER/PASSWORD/DB`, `DATABASE_URL` (driver URL form, for example `postgresql+asyncpg://...`) on `db`, and `TEST_DATABASE_URL` pointing at the `postgres` maintenance database on `db-test`. A second checkout sets its own ports and matching URLs in `.env`, because host ports are shared. When running verify, also pass the chosen `PORT_DB` and `PORT_DB_TEST` in its environment: verify supplies defaults to its steps, and those override Compose's `.env` values.

**Makefile targets** (verify calls the first three): `db-up` (start both, wait until healthy or fail loudly), `db-migrate`, `db-down` (`docker compose stop db`, keeping dev data; `db-test` may serve another run and its tmpfs data dies if stopped), `db-reset`, `db-new-migration NAME=...`, `db-shell` (psql via `docker compose exec`), `db-check` (fail if models and migrations disagree). `db-test` keeps running until a person runs `docker compose down`.

## Private test databases

Two runs can share `db-test` (two agents, a watch run beside a full one), so each run owns only the databases it names, and nothing is deleted by prefix.

1. **One template per run.** Give each run an id its parallel workers share: the test runner's own run id when it has one (check the installed pytest-xdist), otherwise one generated before workers start and passed through the environment. The run owns `<project>_tpl_<runid>`. On the maintenance DB, take an advisory lock keyed on the run id; while holding it, if the template doesn't exist, create it and run the real migrations on it, dropping it again if either step fails. Close every connection to the template (dispose the migration engine or pool) before releasing the lock: `CREATE DATABASE ... TEMPLATE` fails while anything is connected, and the next worker clones as soon as it gets the lock.
2. **One DB per test file**: `CREATE DATABASE "<project>_<runid>_<label>_<random>" TEMPLATE "<project>_tpl_<runid>"` (a file copy), point the app's URL at it, build the app.
3. **Teardown**: close pools, then `DROP DATABASE ... WITH (FORCE)` on that file's database. The run's template is dropped once, by the session-finish hook in the controlling process. Leftovers from a crashed run are reported, never dropped automatically.
4. **Within a file**, tests share the DB: unique ids per test or a rolled-back transaction per test; never truncate everything.

Expose it as one call per test file (`db = setup_test_database("users")`). Raise the hook timeout if the default is a few seconds; the first file pays for the template. Add a harness test that runs two sessions with different run ids at once and checks that one's teardown leaves the other's databases in place, and one where migration fails and no template is left behind. One API test creates a row through a route and reads it back from its own database. With testcontainers instead of `db-test`, start one container per session and do the same inside it.
