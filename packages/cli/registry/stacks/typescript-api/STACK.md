---
schema_version: 1
id: typescript-api
kind: stack
name: TypeScript HTTP API with Effect
description: A Node HTTP API on Effect's HttpApi, with schema-first REST resources, tagged errors mapped through one status table, structured request logs, a platform-free core that also runs as a web fetch handler, Vitest through real HTTP, and a health-route proving slice.
tags: [typescript, api, effect, node, bun, scripts]
deps:
  app: [effect, "@effect/platform-node"]
  dev: [typescript, "@biomejs/biome", vitest, "@vitest/coverage-v8", "@types/node"]
tools: [bun, node, git]
decisions:
  - "Node version: current LTS (default), recorded in .node-version and engines.node; Node runs the server and Vitest, Bun installs and runs scripts."
merge: [.claude/settings.json]
fragments:
  required: [claude-harness]
  default: [git-hooks, ci-github, effect, rest-api]
  optional: [rr, ce-plugin, docker-deploy, openrouter-ai]
env:
  PORT_API: "3000"
verify:
  - { name: install, phase: setup, layer: install, run: bun install }
  - { name: lint, layer: lint, run: bun run lint }
  - { name: typecheck, layer: typecheck, run: bun run typecheck }
  - { name: test, layer: test, run: bun run test }
  - { name: build, layer: build, run: bun run build }
  - name: api
    phase: serve
    layer: serve
    run: "bun run dev:server"
    expect: { http: "http://localhost:${PORT_API}/healthz", within: 60s }
  - name: readme-filled
    layer: check
    run: "test -s README.md && ! grep -n 'stacks:fill' README.md"
commands:
  install: Install dependencies with bun
  dev: Run the foreground server and preserve logs
  dev:server: Run the server from source on Node, restarting on change
  dev:bg: Start or reuse this checkout's background server
  dev:stop: Stop this checkout's background server
  build: Bundle the Node server into dist/
  start: Run the built server with optional .env loading
  typecheck: Run tsc without emitting
  lint: Run Biome checks
  format: Apply Biome formatting and safe fixes
  test: Run Vitest
  test:watch: Watch Vitest tests
  coverage: Run Vitest with coverage
  check: Run lint, typecheck, tests and the build
  clean: Remove project build, test and log output
  prepare: Install project hooks outside CI
---

# TypeScript HTTP API with Effect

One HTTP API served by Node. Effect owns the API definition, handlers, services, errors, configuration and logging: endpoints are declared once with Effect's `HttpApi` modules, and that declaration is the router, the request decoder, the response encoder and the OpenAPI document. The base proving slice is `GET /healthz` through config, logging, a service and the error table. No database, vendor account, auth scheme or deploy target is assumed; fragments add them.

The core never knows its runtime. Only `src/platform/` imports Node, so the same app also runs as a web fetch handler (Effect's web-handler adapter for the router) for a serverless or edge host later, by adding one platform entry.

## Layout

`src/api.ts` is the `HttpApi` definition, composed from one group per resource in `src/api/<resource>.ts`. `src/handlers/<resource>.ts` implements each group. Domain programs and services live in `src/services/`; boundary schemas in `src/schemas/`, one dependency-free file per domain re-exported from `index.ts`. `config.ts`, `errors.ts` and `logging.ts` own those boundaries. `app.ts` builds the platform-free app from the api, its handlers and `AppLayer`. `src/platform/node.ts` is the only entry: it serves `app.ts` with Effect's Node HTTP server, owns the port and graceful shutdown, and is the only module importing `@effect/platform-node` or `node:*`. Tests live in `tests/`, helpers in `tests/helpers/`. Shipped `scripts/dev.ts`, `dev-bg.ts`, `dev-pid.ts` and `prepare.ts` own development process management. Logs live in ignored `logs/`.

## Setup

1. Write `package.json` with the project name, `"type": "module"`, the current Bun `packageManager`, Node LTS in `.node-version` and `engines.node`, and the declared scripts. Install compatible dependencies together, checking peer ranges; pin `@types/node` to the `.node-version` major (a bare add picks the newest).
2. Generate TypeScript and Biome config from the requirements below, checked against the installed versions.
3. Confirm Node runs TypeScript source directly: `node src/platform/node.ts` with type stripping. If the installed Node still needs a flag for it, put the flag in the scripts and record it under Build workarounds.
4. Implement the proving slice: a `Health` service, a `HealthGroup` (identifier `Health`, in `src/api/health.ts`) with `GET /healthz` returning `{"status":"ok"}`, its handler, the error table, config, logging, `app.ts` and the Node entry. The route touches no external service, and invalid config fails startup visibly.
5. Write the integration tests below, then the build: one Node ESM bundle in `dist/` that `start` runs without `node_modules`.
6. Fill README and AGENTS for this base before adding any resource.

## Runtime and boundaries

Services are namespaced `Context` service classes with static layers (`layer`, plus `layerMemory` with fresh state where tests need it), composed into one `AppLayer`. The server builds that layer once at startup; handlers get services with `yield*`, never by providing a layer per request. A layer build never reads configuration that can fail outside a scoped startup that reports it.

Read environment only in `config.ts` through Effect Config, over the `ConfigProvider` the platform entry supplies; empty strings count as absent. Secrets are `Redacted`. New settings go in config, `.env.example` and README. The Grit plugin and the boundary hook enforce: `@effect/platform-node`, `node:*`, Bun and `process` only in `src/platform/`; no `console` in `src/`; Schema from `effect`, never zod or `@effect/schema`. Core code uses Effect's `FileSystem`, `Path` and `HttpClient` services, which the platform entry provides.

## HTTP API

Every endpoint is declared in a group with its path params, query, payload, success and error schemas, so decoding and encoding happen in the framework and handlers receive typed values. Handlers stay thin: they call a domain program and return its result. Resources live under `/v1` unless the project chose no prefix; `/healthz` and `/openapi.json` stay outside it. `.claude/rules/src/effect-api.md` names the helpers for create responses and unknown query params.

Expected failures are `Schema.TaggedError` classes in `errors.ts` with fixed safe messages. `apiErrorTable` maps every tag exhaustively to one status and one `retryable`, and each error schema carries its status annotation from that table, so no handler picks a status. Every error body is `{ "error": { "tag", "message", "retryable" } }`; causes stay in logs. The base rows are `BadInput` (400), `NotFound` (404), `Unavailable` (503, retryable) and `Defect` (generic 500); add `UnsupportedMediaType` (415) with the first endpoint that takes a body, and other rows when an endpoint needs them.

One server-level request middleware in `app.ts` owns the request id, request log line, defect log and error envelope, including for misses and the framework's own error responses (`effect-api.md` has the rules). The router has no 405: a wrong method gets the 404 envelope. Serve `/openapi.json` from the api definition, never by hand.

## Logging and development

Install a custom Effect logger: convert inputs to a plain LogEntry for testing, then format. JSON records have UTC `time`, lowercase `level`, `msg`, top-level annotations, `detail`, and an allowlisted `error` (`effect-api.md`, Logging). Rename annotation collisions with reserved fields.

The request middleware logs each completed request (method, route pattern, status, duration, `requestId`) and returns `x-request-id`. Health probes log at debug. `platform/node.ts` picks the logger's sink by `NODE_ENV` (read in config): unset or `development` writes readable terminal lines plus JSONL to `logs/server.jsonl`; `production` writes JSON to stdout only and never creates `logs/`. Respect `NO_COLOR` and `LOG_LEVEL`, read case-insensitively. A file sink recreates a deleted log directory, warns once on failure, and never fails a request.

The shipped dev wrapper copies terminal output to `logs/dev.log`, rotates prior logs, owns `logs/dev.pid`, and refuses duplicate checkout servers or occupied ports. Background start waits for `/healthz`, reports failures in `logs/dev-bg.err`, and stop signals only the wrapper and the server groups it recorded. Agents use `dev:bg` and `dev:stop`, never broad process killing. `dev:server` runs `src/platform/node.ts` on Node with watch mode on `PORT_API`; verify calls it directly so it doesn't rotate the user's logs.

## Tool configuration and tests

Biome starts from its current generated config: recommended rules as `"rules": { "preset": "recommended" }`, import and export type discipline, organized imports, two spaces, double quotes, width 100, VCS ignores, folder ignores without a trailing glob, and the shipped `biome-plugins/boundaries.grit`. Scope `files.includes` to code and JSON. Check Grit against the installed Biome syntax and preserve each rule when adapting it. Grit sees `process.x` reads and assignments; the boundary hook also catches destructuring. A test in `tests/` writes one fixture per Grit rule into `src/`, runs `biome lint` on the real files (stdin hides plugin diagnostics), and expects one diagnostic per probe and none in `src/platform/`.

TypeScript is two projects, both strict with unchecked index access, verbatim module syntax, erasable syntax only and no emit, and `typecheck` runs both. `tsconfig.json` covers `src/` and `tests/` (minus `tests/hooks/`) with `nodenext` resolution, relative imports with `.ts` extensions (`allowImportingTsExtensions`) and no path aliases, because Node runs the source as written. `tsconfig.tools.json` covers `scripts/`, `.claude/hooks/`, `tests/hooks/` and `tests/helpers/hooks.ts` with `bundler` resolution and Bun's types, because the shipped scripts and hooks import without extensions.

Vitest runs on Node in the `node` environment and needs no `.env`, network or credentials; setup clears credentials before app modules load. Tests follow `.claude/rules/src/testing.md`: most tests go through the HTTP surface with real in-memory layers, either Effect's in-process test client or a real server on an ephemeral port. Cover `/healthz`, startup failing on invalid config, the 404 envelope, every `apiErrorTable` row's status and `retryable`, a decode failure (`?limit=abc` style) as the 400 envelope, a wrong method as the 404 envelope, a defect as a generic 500 logged once with its stack frames and no message, request ids, exactly one request log line per call (a route miss included), and the same `/healthz` response through the web handler with platform-free server services, not Node's. Hook tests run with the Claude adapter.

<!-- stacks:when with=ci-github -->
CI sets up Bun from packageManager and Node from .node-version, installs frozen dependencies, then runs lint, typecheck, coverage and the build. Upload logs and coverage on failure. No external credentials are needed.
<!-- stacks:end -->

## Commands and gotchas

Wire the declared scripts to Node, Biome, Vitest and the shipped helpers. `start` runs the bundle with Node's optional env-file support and reads `PORT_API`, else `PORT`, else 3000. `build` bundles with Bun targeting Node, without inlining env, so the bundle reads env at runtime. `prepare` invokes `scripts/prepare.ts`; `dev:bg` and `dev:stop` invoke `scripts/dev-bg.ts start` and `stop`. `check` runs lint, typecheck, test and build. `clean` removes only generated project output. Document command names, logs and hook ownership in AGENTS, plus a Debugging section with `jq` queries over `logs/server.jsonl` (one request by `requestId`, errors only, slow requests).

<!-- stacks:when with=git-hooks -->
The shipped `scripts/prepare.ts`, run by the `prepare` script after every `bun install`, already runs `lefthook install` (skipped when `CI` is set, lefthook is missing, or `lefthook.yml` doesn't exist yet, and non-fatal when it fails, for example outside a git checkout), so don't add another install step. pre-push runs `bun run typecheck` alongside `bun run test`, in parallel.
<!-- stacks:end -->

<!-- stacks:when with=effect -->
The generated Effect skill also records, under the installed release's names, every HTTP mechanism `effect-api.md` describes by behavior: the API declaration, error status annotations, server-level middleware, the test client, serving on Node and as a web handler.
<!-- stacks:end -->

The server and Vitest run on Node: never `bun test`, never `--bun`, and never run the server under Bun to save a step, because a runtime difference then hides until deploy. Bun doesn't pass its loaded `.env` to a Node child. Check current TypeScript, Node and Biome configuration requirements; adapt generated config and record necessary workarounds with their removal condition. The architecture stays Effect-based even when the optional Effect testing fragment is excluded.
