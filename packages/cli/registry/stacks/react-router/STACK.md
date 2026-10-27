---
schema_version: 1
id: react-router
kind: stack
name: React Router with Effect
description: React Router framework mode with SSR, Effect services, typed HTTP errors, structured logs, Tailwind and shadcn, Vitest, and a health-route proving slice.
tags: [typescript, react, web, effect, fullstack, scripts, bun, node]
deps:
  app: [react, react-dom, react-router, "@react-router/node", "@react-router/serve", isbot, effect, tailwindcss, "@tailwindcss/vite", class-variance-authority, lucide-react]
  dev: ["@react-router/dev", vite, "@vitejs/plugin-react", typescript, "@biomejs/biome", vitest, "@vitest/coverage-v8", happy-dom, "@testing-library/react", "@testing-library/dom", "@testing-library/jest-dom", "@testing-library/user-event", "@types/node", "@types/react", "@types/react-dom", "@playwright/test"]
tools: [bun, node, git]
decisions:
  - "Node version: current LTS (default), recorded in .node-version and engines.node."
merge: [.claude/settings.json]
fragments:
  required: [claude-harness]
  default: [git-hooks, ci-github, effect]
  optional: [posthog, rr, ce-plugin, openrouter-chat]
env:
  PORT_WEB: "5173"
verify:
  - { name: install, phase: setup, layer: install, run: bun install }
  - { name: lint, layer: lint, run: bun run lint }
  - { name: typecheck, layer: typecheck, run: bun run typecheck }
  - { name: test, layer: test, run: bun run test }
  - { name: build, layer: build, run: bun run build }
  - name: web
    phase: serve
    layer: serve
    run: "bun run dev:server --port ${PORT_WEB} --strictPort"
    expect: { http: "http://localhost:${PORT_WEB}/healthz", within: 90s }
  - name: readme-filled
    layer: check
    run: "test -s README.md && ! grep -n 'stacks:fill' README.md"
commands:
  dev: Run the foreground server and preserve logs
  dev:server: Run the framework development server
  dev:bg: Start or reuse this checkout's background server
  dev:stop: Stop this checkout's background server
  build: Build the SSR application
  start: Serve the production build with optional .env loading
  typecheck: Generate route types and run tsc
  lint: Run Biome checks
  format: Apply Biome formatting and safe fixes
  test: Run Vitest
  test:watch: Watch Vitest tests
  coverage: Run Vitest with coverage
  e2e: Build and run the health-route browser smoke
  check: Run lint, typecheck, tests, and the browser smoke
  clean: Remove project build, test, and log output
  prepare: Install project hooks and local browser dependencies outside CI
---

# React Router with Effect

One SSR application in framework mode. React components use loaders/actions and resource routes; server programs run on one Effect runtime. Package scripts are the entry points. The base proving slice is `/healthz` through config, logging, a service, and the runtime, plus a minimal page. No vendor account or reference application is needed.

## Layout

`app/root.tsx`, `routes.ts`, `app.css`; explicit modules under `app/routes/`; generated shadcn components under `app/components/ui/`; shared boundary schemas under `app/schemas/`; server-only `app/.server/{config,logging,errors,runtime,http}.ts` and `services/`. Tests live under `tests/`, browser smoke under `e2e/`. Shipped `scripts/dev.ts`, `dev-bg.ts`, `dev-pid.ts`, and `prepare.ts` own development process management. Logs live in ignored `logs/`.

## Setup

Run the official React Router generator non-interactively in a temporary directory, without installing dependencies or initializing git. Merge its files into the scaffold, preserving owned files; discard generator README, Docker assets, competing lint/format config, and agent files. Set the project name, current Bun `packageManager`, Node LTS in `.node-version`/engines, and retain SSR. Install compatible dependencies, checking peer ranges, then delete the temporary generator directory.

Configure Tailwind through its Vite plugin. Initialize shadcn with `bunx shadcn@latest init -y --no-monorepo -b radix -p <preset>`: `-y` alone still prompts for a preset (an unknown one lists the valid names), and there are no alias flags because init reads the tsconfig `~/*` alias. Then `bunx shadcn@latest add button`, adding only the UI primitives the proving slice uses. Init adds its own runtime dependencies, which that rule can't prevent, plus a Geist font package and its `@import` in `app.css`; remove the font unless the design chose Geist. Implement a Health service and `/healthz` returning `{"status":"ok"}` through `runRoute`, so invalid runtime config fails visibly. The route must touch no external service. Add a minimal index page and a Playwright smoke that loads the page and checks health. Fill README and AGENTS for this base before adding optional app behavior.

## Runtime and boundaries

Services are namespaced `Context.Service` classes with static production and fresh-memory layers. Compose one AppLayer and ManagedRuntime in `runtime.ts`. Tests can swap the runtime through an explicit helper and dispose it. In development, dispose the previous runtime on hot reload before replacing it; retain intentional in-memory service state on `globalThis`. Never construct a runtime per request.

Read environment only in `config.ts` through Effect Config; empty strings count as absent, which Effect's env provider already does, so test it rather than code it. Define tagged errors with fixed safe messages and exhaustive `statusFor` and `retryableFor` mappings. Every HTTP error body is `{ message, retryable }` (an `ErrorBody` schema in `app/schemas/`); causes remain log-only. Include bad input (400), not found (404), unsupported media (415), cancellation (503, retryable), and unexpected defects (generic 500, retryable). Add domain-specific errors only when needed.

`runRoute(request, program)` executes on the current runtime and returns a Response for success, typed failure, runtime construction failure, cancellation, and defects. `runData` applies the same mapping for page loaders, throwing an error Response to the boundary when appropriate. Share JSON-content-type validation and schema decoding. Loaders/actions stay thin; programs delegate to pure or service-backed functions. Components never import Effect or `.server/`; client schemas remain platform-free. The server-import hook and production build enforce this boundary.

## Logging and development

Install a custom Effect logger: convert inputs to a plain LogEntry for testing, then format. JSON records have UTC `time`, lowercase `level`, `msg`, top-level annotations, `detail`, and an allowlisted `error` containing name/message/status/stack. Rename annotation collisions with reserved fields. Never serialize arbitrary third-party error objects or secrets.

Development writes readable terminal lines and compact JSONL to `logs/server.jsonl`; production writes JSON to stdout without files. Respect `NO_COLOR` and `LOG_LEVEL`, read case-insensitively (`.env.example` says `info`; Effect's own log-level config accepts only `Info`). A file sink recreates a deleted log directory, warns once on failure, and never fails requests. Each completed request logs method/path/status/duration/requestId plus safe error fields; log a defect once at that boundary. Return `x-request-id`; health probes log at debug.

The shipped dev wrapper copies terminal output to `logs/dev.log`, rotates prior logs, owns `logs/dev.pid`, and refuses duplicate checkout servers or occupied ports. Background start waits for health, reports failures in `logs/dev-bg.err`, and stop targets only that process group. Agents use `dev:bg`/`dev:stop`, never broad process killing. `dev:server` is `react-router dev`; verify calls it directly so it does not rotate the user's logs.

## Tool configuration and tests

Use Biome's current generated config, recommended rules plus import/export types, unused imports, and const enforcement; two spaces, double quotes, width 100, organized imports, VCS ignores, Tailwind CSS directives. Keep the generated config's shapes: recommended rules as `"rules": { "preset": "recommended" }`, folder ignores without a trailing glob (`"!dir"`, not `"!dir/**"`), Tailwind as `css.parser.tailwindDirectives: true`. Lint owned components/scripts/hooks. TypeScript is strict with unchecked-index checks, verbatim module syntax, erasable syntax, no emit, bundler resolution, explicit Node/Vite types, and a `~/*` app alias without baseUrl. Include generated route types, scripts, and available adapter hooks. Typecheck runs framework typegen first; the stack's before-typecheck hook does the same for edited routes.

Vitest uses its own React plugin configuration, Node by default, happy-dom for components, Testing Library cleanup and jest-dom. Cover `app/` except generated UI primitives; exclude e2e. Test each runtime layer with real local dependencies: health response and config failure, decoding/error statuses and retryability, runtime isolation/disposal, request ids, defect logging once, and the resilient file sink. Hook tests run with the Claude adapter. Playwright uses Chromium, one worker, CI forbidOnly, and retained failure traces; serve the production build on a separate test port. Tests need no `.env` or credentials.

<!-- stacks:when with=ci-github -->
CI sets up Bun from packageManager and Node from .node-version, installs frozen dependencies, runs lint/typecheck/coverage, installs Chromium with system dependencies, then runs e2e. Upload Playwright reports and test results on failure. No external credentials are needed.
<!-- stacks:end -->

## Commands and gotchas

Wire the declared scripts to framework, Biome, Vitest, Playwright, and shipped helpers. `prepare` invokes `scripts/prepare.ts`, which outside CI also runs `playwright install chromium` on every install (slow the first time, not hung); `dev:bg`/`dev:stop` invoke `scripts/dev-bg.ts start`/`stop`. `start` serves the build with Node's optional env-file support and sets the framework's `PORT` from PORT_WEB, else an existing `PORT`, else 3000. `clean` removes only generated project outputs. Document command names, logs, and hook ownership in AGENTS.

<!-- stacks:when with=git-hooks -->
The shipped `scripts/prepare.ts`, run by the `prepare` script after every `bun install`, already runs `lefthook install` (skipped when `CI` is set, lefthook is missing, or `lefthook.yml` doesn't exist yet, and non-fatal when it fails, for example outside a git checkout), so don't add another install step. pre-push runs `bun run typecheck` alongside `bun run test`, in parallel.
<!-- stacks:end -->

Vitest/Vite/React Router run on Node: never force `--bun`, and never substitute `bun test` for Vitest. Route types must exist before tsc. Bun does not automatically pass its loaded `.env` into a child Node process. Check current TypeScript/compiler and Biome configuration requirements; adapt generated config and record necessary workarounds. The architecture remains Effect-based even when the optional Effect testing fragment is excluded; use the installed Effect service/runtime APIs.
