---
schema_version: 1
id: astro-fullstack
kind: stack
name: Astro site + Effect API
description: A Bun workspace with a static Astro site (React islands, Tailwind), a Node API on Effect's HttpApi and a shared contract package, so islands call the API through a typed client. The API can also serve the built site.
tags: [typescript, api, effect, node, astro, react, web, fullstack, monorepo, bun, scripts]
deps:
  contract: [effect]
  api: [effect, "@effect/platform-node"]
  web: [astro, "@astrojs/react", react, react-dom, tailwindcss, "@tailwindcss/vite", effect]
  web-dev: ["@astrojs/check", "@types/react", "@types/react-dom", happy-dom, "@testing-library/react", "@testing-library/dom", "@testing-library/jest-dom"]
  root-dev: [typescript, "@biomejs/biome", vitest, "@vitest/coverage-v8", "@types/node", "@types/bun"]
tools: [bun, node, git]
decisions:
  - "Node version: current LTS (default), recorded in .node-version and engines.node; Node runs the API and Vitest, Bun installs and runs scripts."
  - "Serve the built site from the API process (default: yes, through STATIC_DIR, one origin for pages and API); or host apps/web/dist separately behind the same origin."
  - "Production site URL for canonical links (default: https://example.com)."
merge: [.claude/settings.json, .codex/hooks.json]
fragments:
  required: [claude-harness]
  default: [git-hooks, ci-github, effect, rest-api]
  optional: [rr, ce-plugin, effect-sql-postgres, effect-otlp]
env:
  PORT_API: "3000"
  PORT_WEB: "4321"
verify:
  - { name: install, phase: setup, layer: install, run: bun install }
  - { name: lint, layer: lint, run: bun run lint }
  - { name: typecheck, layer: typecheck, run: bun run typecheck }
  - { name: test, layer: test, run: bun run test }
  - { name: http-contract, layer: test, run: bun run test --project api apps/api/tests/http-contract.test.ts }
  - { name: build, layer: build, run: bun run build }
  - name: api
    phase: serve
    layer: serve
    run: "bun run dev:api"
    expect: { http: "http://localhost:${PORT_API}/healthz", within: 60s }
  - name: web
    phase: serve
    layer: serve
    run: "bun run dev:web"
    expect: { http: "http://localhost:${PORT_WEB}/", within: 60s }
  - name: readme-filled
    layer: check
    run: "test -s README.md && ! grep -n 'stacks:fill' README.md"
commands:
  dev: Run the API and the site in the foreground and preserve logs
  dev:api: Run the API from source on Node, restarting on change
  dev:web: Run the Astro dev server, proxying API paths to the API
  dev:bg: Start or reuse this checkout's background API and site
  logs: Query development records with filters or JSON output
  dev:status: Report checkout server health and log problems
  dev:stop: Stop this checkout's background API and site
  build: Bundle the API into apps/api/dist and build the site into apps/web/dist
  start: Run the built API, serving the built site when STATIC_DIR is set
  typecheck: Type-check the contract, the API, the tooling and the site (astro check)
  lint: Run Biome checks
  format: Apply Biome formatting and safe fixes
  test: Run every Vitest project
  test:watch: Watch Vitest tests
  coverage: Run Vitest with coverage
  check: Run lint, typecheck, tests and the build
  clean: Remove build, test and log output in every workspace
  prepare: Install project hooks outside CI
---

# Astro site + Effect API

Read `docs/guidance/astro-fullstack/index.md` before implementation; it supplies the shared guidance for every selected agent.

Three Bun workspaces: `packages/contract` defines the `HttpApi`, `apps/api` implements it on Node, and `apps/web` builds a static Astro site whose React islands use the contract's typed client. Name packages `@<slug>/contract`, `@<slug>/api` and `@<slug>/web`; ship TypeScript source without separate workspace builds.

Pages are HTML built ahead of time. An island fetches data that must be fresher than the build. Add server rendering only for a page that needs per-request data, after asking. The base proving slice is `GET /healthz` end to end: contract, handler, the API's error table, and a home page island showing whether the API answers.

## Layout

```
package.json         workspaces apps/*, packages/*; root scripts; biome.json; tsconfig.base.json
tsconfig.tools.json  scripts/, .claude/hooks/, tests/hooks/, tests/helpers/hooks.ts (bundler resolution)
vitest.config.ts     projects named api (apps/api), web (apps/web) and hooks (tests/)
scripts/             dev.ts, dev-bg.ts, dev-pid.ts, dev-logs.ts, logs.ts, dev-status.ts, prepare.ts
packages/contract/src/   api.ts, groups/<resource>.ts, schemas/, errors.ts, index.ts
apps/api/src/        handlers/<resource>.ts, services/, config.ts, logging.ts, app.ts, platform/node.ts
apps/api/tests/      helpers/, *.test.ts
apps/web/src/        pages/, layouts/BaseLayout.astro, components/*.tsx (+ .test.tsx), islands/*.tsx, lib/api.ts, styles/global.css
```

Read `docs/api-foundation.md` for lint, testing and development requirements.

## Setup

1. Write the root `package.json` (`private`, `"type": "module"`, workspaces, the current Bun `packageManager`, the declared scripts) and one per workspace. Node LTS goes in `.node-version` and `engines.node`. Install compatible versions together, checking peer ranges. Pin `@types/node` to the `.node-version` major. The `dev` and `typescript` roles name no workspace: `@effect/vitest` goes in root devDependencies, `effect` in each workspace importing it.
2. Create the site with create-astro (`bunx create-astro@latest`, minimal template, no install, git or agent files) in a temp directory, move it into `apps/web` without overwriting, then add React and Tailwind the way `astro add` currently does.
3. Generate the TypeScript, Biome, Astro and Vitest config described below, checked against the installed versions. Confirm Node runs `apps/api/src/platform/node.ts` with type stripping, including its imports of the contract's `.ts` source through the workspace link. If it doesn't, record the fix under Build workarounds.
4. Implement the proving slice: the `Health` group with `GET /healthz` returning `{"status":"ok"}` in the contract, then its handler, config, logging, `app.ts` and the Node entry in the API. On the site, a `BaseLayout`, an `index.astro` and an `ApiStatus` island.
5. Write the tests below, then fill the README and AGENTS for this base before adding any resource.

## Contract

Follow `docs/guidance/astro-fullstack/effect-api.md` and the `rest-api` rule. Every error body is `{ "error": { "tag", "message", "retryable" } }`. Base rows are `BadInput` (400), `NotFound` (404), `Unavailable` (503, retryable) and `Defect` (generic 500); add `UnsupportedMediaType` (415) with the first body endpoint. Resources live under `/v1`; `/healthz` and `/openapi.json` stay outside it.

## API

Follow the API guidance for services, config, platform boundaries and request middleware. The same `app.ts` must run as a web fetch handler; a wrong method gets the 404 envelope. Serve `/openapi.json` from the definition.

When `STATIC_DIR` is set (a relative one resolves against the repository root), `platform/node.ts` mounts Effect's static file server over it, resolving directory `index.html` files. API routes always win. A miss on an API path (`/v1/*`, `/healthz`, `/openapi.json`, any method) gets the 404 envelope, and any other miss gets the site's `404.html` with status 404.

The custom Effect logger writes JSON with UTC `time`, lowercase `level`, `msg`, annotations and an allowlisted `error`. The Node entry writes terminal lines and JSONL to `LOG_FILE` (default `logs/server.jsonl`) in development, JSON to stdout in production. Respect `NO_COLOR` and `LOG_LEVEL`.

## Site

Follow `docs/guidance/astro-fullstack/astro.md`. Build static pages without a running API; islands fetch changing data through the contract client at relative URLs. Proxy `/v1`, `/healthz` and `/openapi.json` to `PORT_API` in development. Only `PUBLIC_` vars reach islands. The site never imports `@<slug>/api`.

## Tool configuration and tests

Follow `docs/guidance/astro-fullstack/tooling.md` for Biome, TypeScript and Vitest configuration. Implement `docs/acceptance/astro-fullstack.md`; verify independently runs its HTTP contract test. Use real layers per `docs/guidance/astro-fullstack/testing.md`. `bun run build` integrates the site.

<!-- stacks:when with=ci-github -->
CI sets up Bun from packageManager and Node from .node-version, installs frozen dependencies, then runs lint, typecheck, coverage and the build. No credentials are needed.
<!-- stacks:end -->

## Commands and gotchas

Follow `docs/guidance/astro-fullstack/development.md` for script wiring, process ownership, logs and runtime gotchas. Document the commands in AGENTS.md.

<!-- stacks:when with=git-hooks -->
The shipped `scripts/prepare.ts` already runs `lefthook install` after every `bun install` (skipped in CI or without lefthook), so don't add another install step. pre-push runs `bun run typecheck` alongside `bun run test`.
<!-- stacks:end -->

<!-- stacks:when with=effect -->
The generated Effect skill also records, under the installed release's names, every HTTP mechanism `effect-api.md` and `astro.md` describe by behavior: the API declaration, server-level middleware, the typed client and its fetch, test clients, serving and static files.
<!-- stacks:end -->
