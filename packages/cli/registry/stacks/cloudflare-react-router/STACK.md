---
schema_version: 1
id: cloudflare-react-router
kind: stack
name: React Router on Cloudflare Workers
description: Full-stack React Router on the local Workers runtime, typed bindings, JSON resource routes, a cron handler slot, Tailwind, Biome, and Workers integration tests.
tags: [typescript, react, web, fullstack, cloudflare, workers, scripts, bun, node]
deps:
  app: [react, react-dom, react-router, tailwindcss, "@tailwindcss/vite"]
  dev: ["@react-router/dev", "@cloudflare/vite-plugin", wrangler, vite, typescript, "@biomejs/biome", vitest, "@cloudflare/vitest-plugin", "@types/node", "@types/react", "@types/react-dom"]
tools: [bun, node, git]
decisions:
  - "Package manager (default: bun)."
  - "Worker name (default: project slug)."
fragments:
  default: [agent-ops, ci-github]
  optional: [cloudflare-d1, git-hooks, ce-plugin]
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
    run: "bun run dev --port ${PORT_WEB} --strictPort"
    expect: { http: "http://localhost:${PORT_WEB}/healthz", within: 90s }
  - name: readme-filled
    layer: check
    run: "test -s README.md && ! grep -n 'stacks:fill' README.md"
commands:
  dev: Run React Router in the local Workers runtime
  build: Build the Worker and browser assets
  typecheck: Generate Worker and route types, then run tsc
  lint: Check owned source with Biome
  format: Apply Biome formatting and safe fixes
  test: Run local Workers integration tests
  coverage: Run tests with the supported Workers coverage provider
  check: Run lint, typecheck, tests, and production build
---

# React Router on Cloudflare Workers

One SSR application with resource routes for JSON APIs. Development and integration tests run in the local Workers runtime without an account, token, or network service. The proving slice is a minimal page and `/healthz`, plus an independently testable scheduled-handler slot. Application-specific APIs and storage stay outside this stack.

## Setup

1. Read Cloudflare's current React Router framework guide and Workers Vitest integration guide. Run the official create-cloudflare React Router generator non-interactively in a temporary directory, with deployment and git initialization disabled. Merge its application files into this scaffold; preserve the shipped README and agent files, merge ignores, and remove the temporary directory afterward. Do not deploy or create cloud resources.
2. Use the generator's compatible React Router, Vite, and Cloudflare plugin dependencies. Install Tailwind, Biome, TypeScript, and Cloudflare's supported Vitest Workers integration; resolve its peer ranges before selecting Vitest. Prefer the integration package the current docs recommend if it supersedes the package named in deps. Record necessary dependency constraints in AGENTS.md under Build workarounds.
3. Set the package name and Bun packageManager; record the supported Node runtime in `.node-version` and engines. Keep SSR enabled, configure Tailwind through its Vite plugin, and preserve the generator's Cloudflare Vite environment wiring.
4. Implement the routes, scheduled handler, and tests below. Fill the README, AGENTS.md, and selected adapter documents from the finished project. Run verify and the full check command.

## Runtime and layout

Use `app/root.tsx`, `app/routes.ts`, and `app/routes/` for the React Router application, `app/.server/` for server services, and `workers/app.ts` for the Worker entry. Keep a minimal index page. `/healthz` is a real resource loader returning JSON `{"status":"ok"}`; it must execute inside the Workers runtime. Use the generator's current typed-binding access pattern (the Workers environment import or request context), and pass the execution context explicitly when required. No binding or secret is serialized into loader data or bundled into browser code.

The Worker exports both `fetch` (delegating to React Router) and `scheduled`. Delegate scheduled work to a named, independently testable function that accepts bindings and the scheduled time. The base implementation is a harmless no-op; leave production cron triggers unset until the application chooses a schedule. Test invocation and rejected work propagation. Use `waitUntil` for background work only when its lifetime semantics fit the operation; don't silently swallow failures.

Bindings come from Wrangler configuration and generated types, never `process.env` in Worker code. Local secrets belong in ignored `.dev.vars`; public configuration belongs in Wrangler vars. Log structured records to console with safe fixed fields. Workers do not write log files, spawn processes, or use a Node HTTP server. Node is only a development-tool runtime.

## Tool configuration and tests

Describe configs for installed tools rather than copying stale examples. Wrangler points at the Worker entry and browser assets, uses a supported compatibility date and only required compatibility flags. Install Wrangler locally and invoke it through `bunx wrangler`. Generate binding types with Wrangler and route types with React Router before strict TypeScript checking, including unchecked-index checks and no emit. Ignore generated bindings, route types, build output, `.wrangler/`, secrets, and dependencies as appropriate.

Biome checks owned TypeScript, JSX, JSON, and CSS with recommended rules, organized imports, two spaces, double quotes, width 100, and Tailwind syntax enabled. Exclude generated runtime declarations and output from formatting and linting.

Run tests through Vitest with Cloudflare's Workers integration, using local bindings and the current supported coverage provider. Cover the resource loader's JSON/status, a request reaching the built framework Worker, the minimal page, and the scheduled handler. Framework virtual modules may not resolve in the Workers test pool: build first and test the generated Worker entry in an isolated test configuration, or use a dedicated test Worker for services plus a real local-server HTTP integration test for the framework. Never replace the framework request test with a static response stub. Tests must be repeatable without credentials, and must stop any server they start. Do not force Vite or Vitest to run under Bun or substitute `bun test` for Vitest.

## CI and deployment

CI runs frozen install and the project's check/coverage commands with the project's Node and Bun runtimes. Local verification includes the production build; it needs no deployment credentials.

Document a separate deployment workflow that runs only after successful CI for the exact tested default-branch commit, uses least-privilege permissions and SHA-pinned actions, builds before deploying with local Wrangler, and requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Do not deploy from fork pull requests. Cloud resources, credentials, domain attachment, and enabling cron belong under Pending user actions. Creating this project never provisions them.
