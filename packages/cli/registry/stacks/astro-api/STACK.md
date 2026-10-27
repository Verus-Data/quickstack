---
schema_version: 1
id: astro-api
kind: stack
name: Astro site + Effect API
description: A bun workspace with a Node HTTP API on Effect's HttpApi, a static Astro site with React islands and Tailwind, and a shared contract package holding the HttpApi definition, so islands call the API through a typed HttpApiClient; the API can also serve the built site.
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
  optional: [rr, ce-plugin]
env:
  PORT_API: "3000"
  PORT_WEB: "4321"
verify:
  - { name: install, phase: setup, layer: install, run: bun install }
  - { name: lint, layer: lint, run: bun run lint }
  - { name: typecheck, layer: typecheck, run: bun run typecheck }
  - { name: test, layer: test, run: bun run test }
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

Three bun workspaces. `packages/contract` is the `HttpApi` definition: groups, endpoints, schemas and tagged errors, depending only on `effect`. `apps/api` implements it on Node with Effect and is the only server. `apps/web` is a static Astro site whose React islands call the API through Effect's typed client built from the same contract, so a renamed field or a new error is a type error on both sides. Packages are `@<slug>/contract`, `@<slug>/api` and `@<slug>/web`, using the project slug, and ship TypeScript source with no build step of their own.

Pages are HTML built ahead of time. Anything that must be fresher than the last build comes from an island fetching the API at view time. Add server rendering only for a page that needs per-request data, after asking. The base proving slice is `GET /healthz` end to end: contract, handler, the API's error table, and a home page island showing whether the API answers.

## Layout

```
package.json         workspaces apps/*, packages/*; root scripts; biome.json; tsconfig.base.json
tsconfig.tools.json  scripts/, .claude/hooks/, tests/hooks/, tests/helpers/hooks.ts (bundler resolution)
vitest.config.ts     projects named api (apps/api), web (apps/web) and hooks (tests/)
scripts/             dev.ts, dev-bg.ts, dev-pid.ts, prepare.ts (shipped)
packages/contract/src/   api.ts, groups/<resource>.ts, schemas/, errors.ts, index.ts
apps/api/src/        handlers/<resource>.ts, services/, config.ts, logging.ts, app.ts, platform/node.ts
apps/api/tests/      helpers/, *.test.ts
apps/web/src/        pages/, layouts/BaseLayout.astro, components/*.tsx (+ .test.tsx), islands/*.tsx, lib/api.ts, styles/global.css
```

## Setup

1. Write the root `package.json` (`private`, `"type": "module"`, workspaces, the current Bun `packageManager`, the declared scripts) and one per workspace. Node LTS goes in `.node-version` and `engines.node`. Install compatible versions together, checking peer ranges. Pin `@types/node` to the `.node-version` major. The `dev` and `typescript` roles name no workspace: `@effect/vitest` goes in root devDependencies, `effect` in each workspace importing it.
2. Create the site with create-astro (`bunx create-astro@latest`, minimal template, no install, git or agent files) in a temp directory, move it into `apps/web` without overwriting, then add React and Tailwind the way `astro add` currently does.
3. Generate the TypeScript, Biome, Astro and Vitest config described below, checked against the installed versions. Confirm Node runs `apps/api/src/platform/node.ts` with type stripping, including its imports of the contract's `.ts` source through the workspace link. If it doesn't, record the fix under Build workarounds.
4. Implement the proving slice: the `Health` group with `GET /healthz` returning `{"status":"ok"}` in the contract, then its handler, config, logging, `app.ts` and the Node entry in the API. On the site, a `BaseLayout`, an `index.astro` and an `ApiStatus` island.
5. Write the tests below, then fill the README and AGENTS for this base before adding any resource.

## Contract

`.claude/rules/api/effect-api.md` covers the definition and its helpers, and the `rest-api` rule covers naming. Errors are `Schema.TaggedError` classes in `errors.ts`, each carrying its status annotation. `apiErrorTable` maps every tag exhaustively to one status and one `retryable`. Every error body is `{ "error": { "tag", "message", "retryable" } }`. The base rows are `BadInput` (400), `NotFound` (404), `Unavailable` (503, retryable) and `Defect` (generic 500); add `UnsupportedMediaType` (415) with the first endpoint that takes a body, and other rows when an endpoint needs them. Resources live under `/v1`; `/healthz` and `/openapi.json` stay outside it. The contract imports nothing but `effect`, never the API or the site.

## API

`.claude/rules/api/effect-api.md` holds the conventions. Services compose into one `AppLayer` built once at startup. `config.ts` reads environment through Effect Config over the provider the platform entry supplies. Only `src/platform/` imports Node, Bun or `@effect/platform-node` or touches `process`, so `app.ts` also runs as a web fetch handler. One server-level request middleware owns the request id, the `request` log line, the defect log and the envelope, including for misses, static files and the framework's own error responses. A wrong method gets the 404 envelope. Serve `/openapi.json` from the definition.

When `STATIC_DIR` is set (a relative one resolves against the repository root), `platform/node.ts` mounts Effect's static file server over it, resolving directory `index.html` files. API routes always win. A miss on an API path (`/v1/*`, `/healthz`, `/openapi.json`, any method) gets the 404 envelope, and any other miss gets the site's `404.html` with status 404.

Logging: a custom Effect logger writes JSON records with UTC `time`, lowercase `level`, `msg`, annotations and an allowlisted `error`. `platform/node.ts` picks its sink by `NODE_ENV`: unset or `development` writes terminal lines plus JSONL to `LOG_FILE` (default `logs/server.jsonl`), `production` JSON to stdout only. Respect `NO_COLOR` and `LOG_LEVEL`.

## Site

`.claude/rules/web/astro.md` holds the conventions. `output: "static"`, with Tailwind through its Vite plugin. `lib/api.ts` is the only module that builds the typed client over the contract, on Effect's fetch-based HTTP client, at relative URLs. In dev, Astro's Vite `server.proxy` forwards `/v1`, `/healthz` and `/openapi.json` to `PORT_API`, so the browser always talks to one origin and the API needs no CORS. Build-time page data comes from files or the contract's schemas, never a running API, so `build` needs no server. Only `PUBLIC_` env vars reach islands. Build-time switches are server-context Astro env fields read in `src/site-config.ts`; a page behind a switch that is off has no static paths, so it isn't built. The site never imports `@<slug>/api`.

## Tool configuration and tests

Biome covers TypeScript, TSX and JSON in every workspace: recommended rules, type-import discipline, organized imports, two spaces, double quotes, width 100 and the shipped `biome-plugins/boundaries.grit`, ignoring `dist/`, `.astro/` and `coverage/`. A hooks-project test lints one real fixture file per Grit rule (stdin hides plugin diagnostics) and expects one diagnostic each, and none for a `platform/` import or `lib/api.ts` fetching. `.astro` files are checked by `astro check`. TypeScript is strict in every project, with unchecked index access, verbatim module syntax, erasable syntax only and no emit:

- contract and API: `nodenext` with `.ts` relative imports and no path aliases
- site: Astro's strict preset with `jsx: "react-jsx"` and `allowImportingTsExtensions`, since it type-checks the contract's source
- `tsconfig.tools.json`: `bundler` resolution with Bun's types, because the shipped scripts and hooks import without extensions

`typecheck` runs all four checks.

Vitest runs on Node with no `.env`, network or credentials. The API project goes through HTTP with real in-memory layers (`.claude/rules/api/testing.md`): `/healthz`, invalid config failing startup, the 404 envelope (undeclared path, wrong method), every `apiErrorTable` row, a decode failure as 400, a defect as a 500 logged once without its message, request ids, one request line per call (misses too), `/healthz` through the web handler, and with `STATIC_DIR` a page, a directory index, the site 404 and `/healthz`. The site project uses `getViteConfig()` with happy-dom and Testing Library; `ApiStatus` is tested loading, ok, with an error envelope and on a network failure, over a fake fetch. `bun run build` is the site's integration test.

<!-- stacks:when with=ci-github -->
CI sets up Bun from packageManager and Node from .node-version, installs frozen dependencies, then runs lint, typecheck, coverage and the build. No credentials are needed.
<!-- stacks:end -->

## Commands and gotchas

`dev:api` and `dev:web` run `bun run --cwd` into their workspace; `dev:bg` and `dev:stop` invoke `scripts/dev-bg.ts start` and `stop`. `dev:api` runs `apps/api/src/platform/node.ts` on Node with watch mode on `PORT_API` and `--env-file-if-exists` pointing at the root `.env`. `dev:web` passes `--ignore-lock`, because Astro backgrounds itself when it detects an agent; `astro.config.mjs` sets `server.port` from `PORT_WEB`, falling back to 4321. `build` bundles the API with Bun targeting Node, without inlining env, then runs `astro build`; `start` runs the bundle with the same env-file flag. The shipped dev wrapper runs both servers with prefixed lines, copies them to `logs/dev.log`, points `LOG_FILE` at the root `logs/server.jsonl`, and owns `logs/dev.pid`. Agents use `dev:bg` and `dev:stop`, never broad process killing. AGENTS documents commands, logs, hooks, API conventions and `jq` debugging queries over `logs/server.jsonl`.

<!-- stacks:when with=git-hooks -->
The shipped `scripts/prepare.ts` already runs `lefthook install` after every `bun install` (skipped in CI or without lefthook), so don't add another install step. pre-push runs `bun run typecheck` alongside `bun run test`.
<!-- stacks:end -->

<!-- stacks:when with=effect -->
The generated Effect skill also records, under the installed release's names, every HTTP mechanism `effect-api.md` and `astro.md` describe by behavior: the API declaration, server-level middleware, the typed client and its fetch, test clients, serving and static files.
<!-- stacks:end -->

The API and Vitest run on Node. Never `bun test` and never `--bun`. Bun doesn't pass its loaded `.env` to a Node child. `@astrojs/check` can lag the newest TypeScript major: if it rejects the installed TypeScript, install the previous major and record it under Build workarounds. If content types or route types look stale, delete `apps/web/.astro/`.
