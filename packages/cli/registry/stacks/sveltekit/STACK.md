---
schema_version: 1
id: sveltekit
kind: stack
name: SvelteKit app on Node
description: A full-stack SvelteKit app built with the Node adapter and served by Node, with server load functions, zod-validated form actions, svelte-check, Vitest and a Playwright test against the production build.
tags: [typescript, svelte, web, fullstack, scripts, bun, node]
deps:
  app: [zod]
  dev: [svelte, "@sveltejs/kit", "@sveltejs/adapter-node", "@sveltejs/vite-plugin-svelte", vite, typescript, svelte-check, "@types/node", eslint, "@eslint/js", eslint-plugin-svelte, eslint-config-prettier, typescript-eslint, globals, prettier, prettier-plugin-svelte, vitest, "@vitest/coverage-v8", jsdom, "@testing-library/svelte", "@testing-library/jest-dom", "@testing-library/user-event", "@playwright/test"]
tools: [bun, node, git]
decisions:
  - "Node version: current LTS (default), recorded in .node-version and engines.node. Node runs Vite, svelte-check, Vitest, Playwright and the built server; Bun installs and runs scripts."
  - "Styling: scoped <style> blocks in components plus one global stylesheet (default), or Tailwind CSS through the generator's add-on when the person asks for it."
  - "Formatter: Prettier with the config the generator's add-on writes, its Svelte plugin and the shipped .prettierignore (default), checked by lint. The shipped .editorconfig uses tabs to match that config; if the add-on's config uses spaces, change .editorconfig to match."
merge: [.claude/settings.json]
fragments:
  required: [claude-harness]
  default: [git-hooks, ci-github]
  optional: [rr, ce-plugin]
env:
  PORT_WEB: "3000"
verify:
  - { name: install, phase: setup, layer: install, run: bun install }
  - { name: lint, layer: lint, run: bun run lint }
  - { name: typecheck, layer: typecheck, run: bun run typecheck }
  - { name: test, layer: test, run: bun run test }
  - { name: build, layer: build, run: bun run build }
  - { name: e2e, layer: test, run: bun run e2e }
  - name: web
    phase: serve
    layer: serve
    run: "PORT=${PORT_WEB} bun run start"
    expect: { http: "http://localhost:${PORT_WEB}/api/health", within: 60s }
  - name: readme-filled
    layer: check
    run: "test -s README.md && ! grep -n 'stacks:fill' README.md"
commands:
  dev: Run the Vite development server
  build: Build the Node server with the Node adapter
  start: Serve the production build on Node (PORT, default 3000)
  typecheck: Sync SvelteKit's generated types, then run svelte-check
  lint: Run the Prettier check and ESLint
  format: Apply Prettier formatting
  test: Run Vitest once
  test:watch: Watch Vitest tests
  coverage: Run Vitest with coverage
  e2e: Build, then run the Playwright tests against the Node server
  check: Run lint, typecheck, tests and e2e
  clean: Remove build, generated and test output
  prepare: Sync SvelteKit's generated types; outside CI, install git hooks and the Playwright browser
---

# SvelteKit app on Node

One SvelteKit application, built by the Node adapter into `build/` and served with `node build`. Pages render on the server from `load` functions, forms post to form actions and keep working without JavaScript, and `use:enhance` upgrades them when it loads. Package scripts are the entry points. The proving slice is an items page: a server-rendered list from an in-memory service, a form action validated with zod that returns field errors through `fail`, a JSON health endpoint and an error page. No database, account, auth or deploy target is assumed; fragments add them.

Read `docs/guidance/sveltekit/index.md` before writing code and link it from AGENTS.md.

## Look up the installed release first

SvelteKit and Svelte have changed config location, aliases, component syntax and data APIs between majors, and your memory is probably older than the installed release. Look things up in this order: the installed type declarations (`node_modules/@sveltejs/kit/types/index.d.ts` and `node_modules/svelte/types/` carry the API docs as comments), then the matching pages on svelte.dev (each docs section has a plain-text `llms.txt` version), then memory last.

## Layout

```text
src/routes/            +layout.svelte, +page.svelte, +page.server.ts (load and the add action),
                       +error.svelte, api/health/+server.ts
src/lib/components/    components the routes render, one per file
src/lib/               code safe on both sides: zod schemas, pure helpers
src/lib/server/        server-only services; SvelteKit refuses to bundle them for the browser
tests/                 Vitest: schemas, services, the action, components
e2e/                   Playwright specs against the Node build
scripts/prepare.ts     shipped: type sync, lefthook and Chromium install
```

## Setup

1. Read `bunx sv create --help` (the official generator), then run it non-interactively into a temporary directory: the minimal template, TypeScript, no install, no git, no AI or agent add-ons. Add the generator's add-ons for ESLint, Prettier and the Node adapter, at create time or with `sv add` in the temporary directory. Leave out its Vitest and Playwright add-ons; they're configured below. Move its files into the project without overwriting scaffold files, merge any `.prettierignore` lines the scaffold lacks, then delete the temporary directory and the generator README.
2. Keep SvelteKit's config where the generator put it and confirm it uses the Node adapter, with no auto adapter left in config or `package.json`. Keep the generator's TypeScript, ESLint and Svelte version ranges. Set the package name, Bun `packageManager`, Node LTS in `.node-version` and `engines.node`. Drop the generator's `preview` script; e2e and `start` run the Node build.
3. Install the remaining dev dependencies, checking peer ranges. Configure TypeScript, Vitest and Playwright as below.
4. Build the proving slice:
   - `src/lib/server/items.ts`: an in-memory items service (list, add) seeded with two items, holding its store on `globalThis` so dev reloads keep it, with an exported reset helper for tests.
   - `src/lib/item-schema.ts`: the zod schema for a new item (a trimmed, required name with a length limit) and a pure function turning `FormData` into either the item or per-field errors.
   - `src/routes/+page.server.ts`: `load` returns the items; the default action parses with that function, returns `fail(400, ...)` with the field errors and submitted values on bad input, and adds the item on success.
   - `src/lib/components/AddItemForm.svelte`: a `method="POST"` form with `use:enhance`, the action's returned data as a prop, field errors beside the input and the submit button disabled while a submit is pending. `+page.svelte` renders the list and the form.
   - `src/routes/api/health/+server.ts`: `GET` returns `{"status":"ok","items":<count>}` from the service, rendered per request. Don't prerender it or any layout above it.
   - `src/routes/+error.svelte`: the status and a fixed safe message with a link home, for unknown paths and thrown errors.
5. Write the tests listed under Testing, fill README and AGENTS.md, then run verify.

## Server and client boundary

Only `src/lib/server/` and `*.server.ts` modules read environment variables, hold state or talk to anything outside the process. SvelteKit fails the build, and the dev server's page load, when browser code imports them; the shipped Claude hook stops it earlier. Read secrets only through the private environment module the installed kit documents, and only from server modules.

Treat every form action as a public POST endpoint: parse its `FormData` with zod on the server even when the input has browser validation, and return expected failures with `fail` rather than throwing. Thrown errors render `+error.svelte`, and production replaces an unexpected error's message with a generic one. Use the kit's `error` helper for a missing record so the page gets a 404.

Server module state is shared by every request and every user. That's fine for the in-memory slice; per-user data goes in `locals`, cookies or a store keyed by user, never a module variable.

## Tool configuration

Write components in the syntax the installed Svelte major documents and the generator enables (it may force one mode for the whole project). Check the installed `svelte` types before writing props, state or events from memory.

TypeScript extends the tsconfig SvelteKit generates, which exists only after `svelte-kit sync`; `prepare` runs it on every install, CI included. Turn on `noUncheckedIndexedAccess` and add `tests`, `e2e`, `scripts` and `.claude/hooks` to the include list, which covers only `src` and the Vite config by default. `typecheck` runs `svelte-kit sync`, then `svelte-check` against that tsconfig with its flag that fails on warnings, so accessibility warnings get fixed rather than ignored.

ESLint runs `eslint .` with the add-on's flat config (JavaScript, typescript-eslint and eslint-plugin-svelte recommended, with Prettier's config last). `lint` runs `prettier --check .` first. The shipped `.prettierignore` keeps Prettier off generated output, `static/` and the stacks-owned `.stacks/` directory. The shipped harness files use two spaces and double quotes, so run `bun run format` once after setup to bring them to the project's config.

Vitest reads the project's Vite config, so the SvelteKit plugin resolves the lib alias and the kit's modules in tests. Run `tests/**/*.test.ts` only. Use the node environment by default and jsdom for files that render components (a per-file environment comment). Add Testing Library's Svelte Vite plugin (its `vite` export): without it, Svelte resolves its server build under Vitest and mounting a component fails with a message about the server. Load jest-dom matchers in a setup file.

Playwright uses Chromium, one worker, `forbidOnly` in CI, retained traces on failure and a `webServer` that runs `bun run start` with `PORT` set to a test port (`PORT_E2E`, default 3100), waits for `/api/health`, and never reuses an existing server: that might be a different project. `e2e` runs the build first, because `start` serves only a finished build. If the installed adapter fixes the origin at build time, build for the test port before Playwright and restore the build for `PORT_WEB` (default 3000) afterward, including when tests fail. Document that a port change requires a matching rebuild.

## Testing

Vitest covers what runs without a server:

- The item schema and FormData parser: valid input, empty and whitespace names, an over-long name, each with the exact field error.
- The items service: list, add, and that two tests don't share state (reset the store in a `beforeEach`).
- The default action, called directly with a real `Request` carrying `FormData` (build the event in one test helper with a single cast): bad input returns a 400 failure with the field error and adds nothing; good input adds the item.
- The form component in jsdom: renders the field error and keeps the submitted value from failure data. If its enhance import won't load under Vitest, mock that one kit module in the test.

Playwright covers `e2e/items.spec.ts` against the Node build: the page lists the seed items, an empty submit shows the field error without adding anything, a valid submit shows the new item and it survives a reload, the same valid submit works in a browser context with JavaScript disabled, `/api/health` returns 200 with `status` `ok`, and an unknown path renders the error page with a 404. Check that a cross-origin form POST is rejected. Tests need no `.env` and no network beyond localhost. If the test port is occupied, set `PORT_E2E` to a free port; `PORT_WEB` controls verify's server port.

<!-- stacks:when with=ci-github -->
CI sets up Bun from packageManager and Node from `.node-version`, installs frozen dependencies (which syncs SvelteKit's types), runs lint, typecheck and coverage, installs Chromium with system dependencies, then runs e2e. Upload the Playwright report and test results on failure. No credentials are needed.
<!-- stacks:end -->

## Commands

Wire the declared scripts to Vite, svelte-kit, svelte-check, ESLint, Prettier, Vitest, Playwright and the shipped helper. `start` is `node build`, which reads `PORT` and `HOST` from the environment. `test` is `vitest run`; `prepare` runs `bun scripts/prepare.ts`, which syncs SvelteKit's types and, outside CI, installs lefthook when `lefthook.yml` exists and downloads Chromium for e2e. `clean` removes `.svelte-kit/`, `build/`, `coverage/`, `test-results/` and `playwright-report/` only. List every script in AGENTS.md with a single-test-file example (`bun run test tests/item-schema.test.ts`).

<!-- stacks:when with=git-hooks -->
`scripts/prepare.ts` already runs `lefthook install` after every `bun install`, so don't add another install step. pre-commit runs Prettier and ESLint with `--fix` on staged files, `.svelte` included; pre-push runs `bun run typecheck` and `bun run test` in parallel.
<!-- stacks:end -->

## Gotchas

- The built server may assume `https` when deriving its public origin, so a form post to plain-http `localhost` fails with 403. Read the installed Node adapter and kit config docs for how to set the exact origin (at runtime in some releases, at build time in others). Match `http://localhost:<port>` to each local server, including port overrides; use the actual public origin for deployment. Do not disable the origin check, trust every origin, or trust a client-supplied forwarding header without a trusted proxy that overwrites it.
- `node build` doesn't load `.env`; Vite's dev server does. Pass production settings as real environment variables.
- Keep the TypeScript major the generator chose. svelte-check needs TypeScript's JavaScript API; check its peer range before raising TypeScript.
- `.svelte-kit/` and `build/` are generated. ESLint and typecheck fail with tsconfig errors until `svelte-kit sync` has run; run `bun install` or `bun run typecheck`, never edit them.
- The harness's type-check-on-write hook runs plain `tsc`, which skips `.svelte` files. `bun run typecheck` is the check that counts.
- Keep the slice on load functions and form actions. If the installed release offers newer data APIs, don't move the slice onto them.
- Never force `--bun` on Vite, Vitest or Playwright, and never use `bun test`; they run on Node.
