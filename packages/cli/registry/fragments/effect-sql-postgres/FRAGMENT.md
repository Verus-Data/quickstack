---
schema_version: 1
id: effect-sql-postgres
kind: fragment
category: service
name: PostgreSQL with Effect SQL
description: "PostgreSQL for the Effect stacks (typescript-api, react-router, astro-fullstack): Docker Compose dev and test databases, migrations run by an explicit command, a scoped connection pool, a schema-decoding repository behind an Effect service, and tests on a private database per test file."
tags: [database, postgres, effect, service]
applies_to: [typescript-api, astro-fullstack, react-router]
requires_tools: [docker]
tools: [docker]
deps:
  database: ["@effect/sql-pg"]
decisions:
  - "Postgres image: the official postgres image, current major, alpine variant (default), or an image with the extensions the project needs."
  - "Proving resource: a minimal items resource with a unique name (default) when the project has no domain service yet; in an existing project, back its first in-memory service instead."
  - "Run migrations on server start: no (default); db:migrate is an explicit release step."
env:
  PORT_DB: "5432"
  PORT_DB_TEST: "5433"
verify:
  - { name: db-up, phase: setup, layer: install, run: bun run db:up }
  - { name: db-migrate, phase: setup, layer: install, run: bun run db:migrate }
  - { name: test-db, layer: test, run: bun run test:db }
commands:
  db:up: Start the development and test databases and wait until healthy
  db:migrate: Apply migrations to DATABASE_URL
  test:db: Start the test database if needed and run the database tests
---

# PostgreSQL with Effect SQL

Read `docs/guidance/effect-sql-postgres/index.md` before implementation: it has the Compose services, scripts, test harness and this stack's file layout.

Use the Effect release's own PostgreSQL driver at the version matching the installed `effect`. It speaks the wire protocol itself, so don't add `pg`, `@types/pg` or Effect 3's separate SQL package. Find its client, migrator and error APIs in the installed declarations, then the package's bundled docs, then the effect-smol source; Effect 3 pages and memory last.

## Contract

- **Config.** `DATABASE_URL` is a redacted secret read in the config module. Unset, it falls back to the Compose dev database in development and fails startup in production.
- **Pool.** The driver opens sockets, so build the live client layer with the other runtime code and add the driver to the boundary lint and hook patterns that keep Node imports there. The pool connects lazily with bounded connect and acquire timeouts, so the server starts and liveness answers while the database is down, and it closes with the app's layer scope.
- **Repository.** Domain code depends on the SQL client service, never the driver. The repository is the live layer of the existing service interface; the in-memory layer stays for the ordinary tests, which keep passing unchanged. Decode every row with the boundary schemas; a row that fails is a logged defect. Map the driver's classified SQL errors once, here: constraint violations to a `Conflict` tagged error (409), connection failures and timeouts to `Unavailable` (503, retryable), the rest to defects.
- **Readiness.** `/healthz` stays database-free. `/readyz` runs `SELECT 1` under a short timeout and returns the 503 envelope when the database is unreachable.
- **Migrations** are the only schema source: numbered modules loaded from an explicit ordered list, run by the release's migrator. Only `db:migrate` runs them, never startup or a request.

## Tests

`test` stays Docker-free and excludes the database suite. `test:db` runs it against `db-test`: each run migrates a template database named by its run id, each test file clones its own database from it, and each drops only what it created, after closing its pool. Nothing is dropped by prefix. The suite covers the `db:migrate` command on an empty database, a repository round trip, a stored row the schema rejects, a constraint error mapped to `Conflict`, transaction rollback, no sessions left after the pool's scope closes, readiness up and down, and the proving resource over real HTTP. Verify leaves both containers running, since another run may be using them; `db:down` is for a person.

<!-- stacks:when with=ci-github -->
CI runs `bun run test:db` after the tests; GitHub's Ubuntu runners have Docker Compose.
<!-- stacks:end -->

## AGENTS.md

A **Database** section: services and ports, the `db:*` and `test:db` commands, how to add a migration, the per-file test database helper, `/healthz` versus `/readyz`, and that migrations are a release step.
