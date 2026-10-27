---
schema_version: 1
id: cloudflare-d1
kind: fragment
category: service
name: Cloudflare D1 with Drizzle
description: Typed D1 bindings, Drizzle's D1 driver, checked-in SQL migrations, and isolated local database tests without a Cloudflare account.
tags: [database, sqlite, cloudflare, workers, drizzle]
applies_to: [cloudflare-react-router]
deps:
  database: [drizzle-orm]
  database-dev: [drizzle-kit]
decisions:
  - "D1 binding name (default: DB)."
  - "Database name (default: project slug)."
verify:
  - { name: db-migrate, phase: setup, layer: install, run: bun run db:migrate }
commands:
  db:generate: Generate SQL migrations from the Drizzle schema
  db:migrate: Apply checked-in migrations to local D1
---

# Cloudflare D1 with Drizzle

Add a local D1 binding and a small schema to prove database access through the framework. No account or cloud database is needed for development, tests, or verify. Provisioning the production database is a later explicit user action.

## Setup

1. Read the current D1 local-development and Drizzle D1 guides. Add a `DB` D1 binding to Wrangler, with a database name and a clearly documented local-only identifier where required. Keep remote binding access disabled. Record creating the production database and replacing the identifier under Pending user actions.
2. Add `drizzle-orm` and `drizzle-kit`, a schema under `app/.server/db/`, and a database factory accepting the request's typed D1 binding. Use Drizzle's D1 driver; don't open a filesystem SQLite database in Worker code. Regenerate binding types after adding DB.
3. Generate a checked-in SQL migration under `drizzle/` using Drizzle's SQLite dialect. Point Wrangler's migrations directory there. `db:generate` generates SQL; `db:migrate` runs local Wrangler migrations explicitly with `--local`. A remote migration command must be separately named and never run by install, tests, verify, or local dev.
4. For the proving slice, create a tiny health-probe table and have `/healthz` issue a real Drizzle query before returning its normal healthy response. Do not add product features. Cover insert/read behavior and the route's dependency on the binding.

## Tests and migrations

Apply the checked-in migrations to an isolated D1 database in the Workers test environment using the integration's migration helpers. Use the installed integration's documented isolation/reset mechanism so tests cannot share rows accidentally or modify the developer's local database. Test a clean migration, query round-trip, constraint failure, and repeated migration application through the local project command. Failures must be visible; never report healthy after a database error. The framework HTTP integration test uses a fresh local persistence directory and applies migrations before starting its server, then stops the server and removes that directory.

Keep SQL migrations append-only once deployed. Review generated destructive SQL before any remote apply. Document local persistence, reset procedure, schema location, migration commands, and the production provisioning boundary in README and AGENTS.md. Deploy CI must apply reviewed remote migrations before the compatible Worker deployment; credentials and the production database id are prerequisites, never fabricated values.
