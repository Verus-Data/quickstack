---
schema_version: 1
id: mobile-expo
kind: stack
name: Expo app + Hono API
description: Bun-workspace monorepo with an Expo Router app (NativeWind, TanStack Query), a Bun + Hono API (zod-openapi, Drizzle on Postgres), and a shared zod schemas package; the app reaches the API through a typed Hono client behind a hooks layer.
tags: [typescript, react, react-native, mobile, api, fullstack, monorepo, scripts, bun, node]
deps:
  api: [hono, "@hono/zod-openapi", "@scalar/hono-api-reference", drizzle-orm, zod]
  api-dev: [drizzle-kit, pg, "@types/bun", typescript]
  schemas: [zod]
  mobile: [expo, expo-router, expo-constants, expo-linking, expo-status-bar, react, react-dom, react-native, react-native-web, react-native-safe-area-context, react-native-screens, react-native-reanimated, react-native-worklets, nativewind, react-native-css, "@tanstack/react-query", hono, zod]
  mobile-dev: [jest, jest-expo, "@testing-library/react-native", "@types/jest", "@types/react", tailwindcss, "@tailwindcss/postcss", postcss, typescript]
  root-dev: ["@biomejs/biome", typescript]
tools: [bun, node, docker, git]
decisions:
  - "Node version for Expo's CLI and jest: current LTS (default), recorded in .node-version."
  - "Postgres image: the official image, current major, alpine variant (default)."
  - "Commit the generated native ios/ and android/ directories: no (default); prebuild regenerates them."
merge: [.claude/settings.json]
fragments:
  default: [agent-ops, git-hooks, ci-github, clerk]
  optional: [ce-plugin, rr]
env:
  PORT_API: "3000"
  PORT_DB: "5432"
verify:
  - { name: install, phase: setup, layer: install, run: bun run setup }
  - { name: db-up, phase: setup, layer: install, run: bun run db:up }
  - { name: db-migrate, phase: setup, layer: install, run: bun run db:migrate }
  - { name: lint, layer: lint, run: bun run lint }
  - { name: typecheck, layer: typecheck, run: bun run typecheck }
  - { name: test, layer: test, run: bun run test }
  - { name: harness-contract, layer: test, run: bun run test:api test/harness-contract.test.ts }
  - { name: auth-provider, layer: test, run: bun run test:mobile --runInBand test/auth-provider.test.tsx }
  - { name: ci-contract, layer: test, run: bun run test:ci }
  - { name: db-check, layer: check, run: bun run db:check }
  - { name: bundle, layer: build, run: bun run bundle }
  - { name: expo-deps, layer: check, run: bun run expo:check }
  - name: api
    phase: serve
    layer: serve
    run: bun run dev:api
    expect: { http: "http://localhost:${PORT_API}/health/ready", within: 60s }
  - { name: db-down, phase: teardown, layer: install, run: bun run db:down }
  - name: readme-filled
    layer: check
    run: "test -s README.md && ! grep -n 'stacks:fill' README.md"
commands:
  setup: Install dependencies, create .env from .env.example, link apps/mobile/.env (idempotent)
  prepare: Install git hooks outside CI (runs after every bun install)
  dev: The whole dev stack (scripts/dev.sh), logged to .logs/dev.log
  dev:api: API with watch on PORT_API
  dev:mobile: Metro
  dev:logs: Follow .logs/dev.log with terminal escape codes stripped
  sim:shot: Screenshot the booted iOS simulator and print its background colours
  lint: biome check .
  format: biome check --write .
  typecheck: tsc --noEmit in every workspace (Expo route types first)
  test: Every workspace's tests (the API suite needs Postgres up)
  test:api: The API suite (bun test)
  test:mobile: The mobile suite (jest)
  test:ci: Test path-filtered workflow contracts locally
  bundle: Expo export for iOS and Android into an ignored directory
  expo:check: Expo's own dependency check against the installed SDK, in apps/mobile
  db:up: Start Postgres and wait until healthy
  db:down: Stop Postgres, keeping data
  db:generate: Generate a migration from the Drizzle schema
  db:migrate: Apply migrations
  db:check: Fail if the migration folder disagrees with the schema
  check: lint, typecheck, test, db:check, bundle, expo:check
---

# Expo app + Hono API

Three bun workspaces: `apps/api` (Bun + Hono with `@hono/zod-openapi`, Drizzle on Postgres), `apps/mobile` (Expo Router, NativeWind, TanStack Query), and `packages/schemas` (zod schemas both import). Workspace packages are named `@<scope>/api`, `@<scope>/mobile`, `@<scope>/schemas` with the project's package scope (drop a leading `@` from the scope), and ship raw TypeScript with no build step.

## Layout

```
package.json        workspaces apps/*, packages/*; root scripts; bunfig.toml; biome.json; tsconfig.base.json
compose.yaml        postgres for dev and tests
scripts/            dev.sh, dev.ts, dev-logs.sh, sim-shot.sh, prepare.ts (shipped)
docs/               api.md, mobile.md, testing.md (shipped; the conventions in detail)
apps/api/
  src/index.ts      boot checks, Bun server export
  src/app.ts        OpenAPIHono app: error handlers, global middleware, /openapi.json, /docs
  src/env.ts        Hono context types only (no runtime imports)
  src/client.ts     types-only entry (`@<scope>/api/client`) re-exporting AppType
  src/routes/       one OpenAPIHono group per domain, composed in routes/index.ts (exports AppType)
  src/services/     business logic and queries; the only Drizzle users
  src/db/           index.ts (lazy connection, the one `bun` import), schema.ts
  drizzle/          generated migrations, never hand-edited
  test/             setup.ts harness, *.test.ts
packages/schemas/src/  one file per domain, re-exported from index.ts
apps/mobile/
  src/app/          Expo Router routes (_layout.tsx mounts providers)
  src/components/   UI, styled.ts (the one place `styled` is called)
  src/lib/          api.ts (hc client), api-url.ts, query-client.ts, cn.ts, queries/
  src/global.css    Tailwind theme tokens
  test/             render.tsx, router-mock.ts, setup.ts, *.test.tsx
```

## Setup

1. Root `package.json` with workspaces and the scripts in Commands, and `packageManager` set by hand to `bun@<bun --version>` (`bun install` doesn't write it; CI reads it). `bunfig.toml`: hoisted linker, and test root `apps/api` so a bare `bun test` never runs jest files.
2. `compose.yaml`: one `postgres` service from the image decision, credentials from env (dev default `app`/`app`/`app`), host port `${PORT_DB:-5432}`, a named volume at the data path the image's docs give for the chosen major, a top-level compose `name:` from the project slug so two checkouts don't share containers, `pg_isready` healthcheck. `db:up` is `docker compose up -d --wait postgres`; `db:down` is `docker compose stop postgres`.
3. `packages/schemas`: zod, `HealthResponse` and `ReadyResponse` first, plus the schemas for the first table's route.
4. `apps/api`: `bun init` non-interactively in that directory, keeping only its `package.json` and `tsconfig.json`, then the API deps. `package.json` exports `./client` as `./src/client.ts`. `drizzle.config.ts` reads `DATABASE_URL`, schema `src/db/schema.ts`, out `drizzle/`, strict; drizzle-kit runs on Node and needs `pg` even though the app uses bun's SQL client. Confirm `DATABASE_URL` reaches drizzle-kit (it runs as a Node child, so load the env file into the process that launches it) by running `db:migrate` once against an empty database. Start the schema with one minimal table and one route over it that takes a validated query parameter, so the error-envelope test has a real 400 to hit. Build the Conventions below with `GET /health` (process only) and `GET /health/ready` (`select 1`, 503 when the database doesn't answer). The server listens on `PORT_API` (default 3000). Scripts load the root `.env` with bun's env-file flag.
5. `apps/mobile`: the official Expo app generator non-interactively into a temp directory, merged into `apps/mobile` keeping only the app itself: discard its git, lint, README, LICENSE, agent instruction files (`AGENTS.md`, `CLAUDE.md`, `.claude/`, `.cursor/`), reset script, and demo screens and assets. Move routes under `src/app`. Install with Expo's own install command (`expo` itself first, then the rest) so versions come from the SDK's ranges, never `latest`; when a peer demands something else, pin it and record the pin and its removal condition under Build workarounds. Depend on `@<scope>/api` and `@<scope>/schemas` as `workspace:*`. Add NativeWind on the release line that supports Tailwind's CSS-first theme, from its prerelease channel if that line isn't stable yet, with Tailwind through PostCSS and the NativeWind Metro wrapper, per that line's docs (docs describing a `tailwind.config.js` and a Babel preset are for the older line).
6. The proving slice: `useHealth` in `src/lib/queries/` calls `api.health.$get()`, and the home screen renders the API's status, or an error state when it can't reach it. One real app-to-API round trip, typed end to end from `packages/schemas`.
7. Tests from Testing, `scripts/` wired to Commands, `.env.example` adapted, README and AGENTS.md filled.
8. `stacks verify` until green.

## Conventions

Read `docs/api.md` before changing routes, services, or schemas, and `docs/mobile.md` before changing screens. In short:

- **Schemas** live in `packages/schemas`, named for OpenAPI with zod's own `.meta({ id })`, exporting the inferred type under the schema's name.
- **Routes** are `createRoute` objects mounted with `.openapi(route, handler)` on per-domain `OpenAPIHono<AppEnv>` groups. Route objects stay literal (no wrapping factory) so `hc` keeps per-route types. `/openapi.json` and a Scalar reference at `/docs` come from the app.
- **AppType stays free of middleware; runtime imports are confined.** `routes/index.ts` and everything it imports are what the mobile typecheck sees, so middleware is mounted in `app.ts`, never in route modules. `bun` is imported by `db/index.ts` alone and Drizzle only by services and `db/`; both are reachable through `routes -> services -> db`, which is expected.
- **One error shape**: `{ "message": string }` as JSON, owned by `app.ts` in `onError`, `notFound`, and the zod `defaultHook` (issues joined as `path: message`). An `HTTPException` passes through at its status; anything else is logged with the request and answered as a bare 500. Services throw `HTTPException`; a service another service composes returns a discriminated result and exports its status mapping with `satisfies`.
- **Config**: `index.ts` exits with a fix-it message when `DATABASE_URL` is missing. `db()` is lazy and cached per connection string, so importing never connects.
- **Mobile data access** goes through hooks in `src/lib/queries/` only. `lib/api.ts` (the `hc` client) is imported by nothing else. Hooks own query keys (from one `keys.ts`), `staleTime`, and error mapping; failed responses become an `ApiError` carrying the server's message. One `QueryClient`: one query retry, no mutation retries, no refetch on focus.
- **API URL**: `EXPO_PUBLIC_API_URL` when set, otherwise the Metro host from Expo's `hostUri` on port 3000 (the bundle can't read `PORT_API`; set the URL when the port moves), so simulators, emulators, and devices all reach the dev API. A release build throws when the URL is unset or still the `https://api.example.com` placeholder EAS profiles start with.
- **Styling**: follow `docs/mobile.md`'s NativeWind tokens and `components/styled.ts` boundary; never `StyleSheet.create`.

## Tool configuration

- **Biome** at the root: recommended rules plus `useImportType`, `useExportType`, `noUnusedImports`, `useConst`, `noParameterAssign`; two spaces, single quotes, semicolons, trailing commas, width 100; organized imports; VCS ignore file; Tailwind directives in the CSS parser. Ignore `drizzle/`, `.expo/`, `ios/`, `android/`, `dist/`, and generated assets (Expo's route types).
- **TypeScript**: `tsconfig.base.json` strict with `noUncheckedIndexedAccess`, `noImplicitOverride`, unused locals/parameters, `verbatimModuleSyntax`, `isolatedModules`, bundler resolution, `noEmit`, `skipLibCheck`. The API adds bun types; mobile extends Expo's base too, adds jest types, an `@/*` alias to `src/`, and Expo's generated route types.
- **jest** (mobile): the `jest-expo` preset, `setupFilesAfterEnv` `test/setup.ts`, `testMatch` under `test/`, `TZ=UTC` set in the config, `testTimeout` raised well above the default (the API suite shares the cores), and `transformIgnorePatterns` built from the preset's own list, extended with the workspace scope and bun's package store rather than replaced.

## Testing

Read `docs/testing.md`; use real integration tests, never own-code mocks.

Implement `docs/acceptance/mobile-expo.md`: verify separately checks database isolation/import graphs, offline auth integration and CI filters. Real accounts, devices and hosted CI remain Pending user actions.

- **API** (bun:test): use `setupApiTest(label)` from `test/setup.ts`, exactly as `docs/testing.md` prescribes (template migrations, per-file database, dynamic app import, cleanup). Dispatch with `t.app.request(...)`. Cover health/readiness with real Postgres, 404/zod-400 envelopes, and the transitive client import graph.
- **Mobile** (jest-expo, Testing Library): use `renderScreen` from the documented harness with real providers/hooks/hc, a fresh QueryClient, no retries and no lingering GC timer. Stub only fetch/native boundaries through shared factories. Cover home success/error and the auth-provider matrix.
- The bundle checks Metro/Babel/NativeWind compilation; simulator E2E remains external.

## Commands

Root scripts call workspace scripts with `bun run --filter`. `setup` is idempotent: install, copy `.env.example` to `.env` if missing, symlink `apps/mobile/.env` to the root one (Expo only reads env from its project directory; skip the link while `apps/mobile` doesn't exist yet). `dev.sh` records output and runs `scripts/dev.ts`, which starts the API workspace's `dev` and mobile's `dev` (`expo start`) or `ios` (`expo run:ios`). Keep those names and include scripts in typechecking. It refuses busy ports and stops only its owned process groups on failure, signal or either app's exit. Postgres stays up; `db:down` stops it without deleting data. Set `PORT_API` and `PORT_METRO` (default 8081) to move dev ports; also update `EXPO_PUBLIC_API_URL` when the API moves. `prepare` runs `scripts/prepare.ts`; `bundle` writes `dist/`. `typecheck` in mobile generates Expo's route types first, with the installed CLI's headless command. Mirror Commands and scoped tests from `docs/testing.md` in AGENTS.md. `PORT_DB` and `DATABASE_URL` move together; verify teardown stops Postgres.
<!-- stacks:when with=git-hooks -->

pre-push runs `bun run db:up` before the tests, since the API suite needs Postgres; say so in the Git hooks section.
<!-- stacks:end -->

<!-- stacks:when with=ci-github -->
**CI.** Jobs for lint, typecheck, mobile tests, API tests, and the bundle. The stack declares no coverage command, so CI runs `test:api` and `test:mobile`; take the coverage decision as no. Mobile tests and the bundle also set up Node from `.node-version`. API tests run against a Postgres service container with `DATABASE_URL` set, and run `db:check` first. The bundle job runs `bundle` and Expo's doctor in `apps/mobile`.
<!-- stacks:end -->

## Gotchas

- jest-expo and Expo's CLI run on Node, not bun's runtime. Never run mobile tests with `bun test`.
- Expo reads `.env` only from `apps/mobile`; without the symlink, `EXPO_PUBLIC_*` values are silently missing. They're inlined at build time, so per-environment values belong in EAS build profiles, and changing one needs Metro's cache cleared.
- `@hono/zod-openapi` adds `.openapi()` to zod schemas when it loads, and the mobile app never loads it, so `.openapi()` in `packages/schemas` passes typecheck and throws at runtime in the app. Use zod's own `.meta({ id })`.
- bun:test shares the module cache across files: read env per call (connections, keys), never at import.
- `CREATE DATABASE ... TEMPLATE` fails while anything is connected to the template; close it before cloning.
- Await every `render` and `fireEvent` from Testing Library for React Native (awaiting a synchronous one is harmless); a floating one lets assertions run before React flushes.
- `className` on a component NativeWind doesn't know is dropped silently. A blank screen is usually a styling failure or a `return null` gate, not a crash; `docs/mobile.md` has the triage.- An Expo config plugin can add an entitlement (Apple sign-in, associated domains) that makes `expo run:ios` demand a signing certificate for a simulator build. Gate such entitlements to EAS builds and record it under Build workarounds.
