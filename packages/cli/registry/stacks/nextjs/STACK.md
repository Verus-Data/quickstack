---
schema_version: 1
id: nextjs
kind: stack
name: Next.js app on Node
description: A full-stack Next.js App Router app served by Node, with server components, Server Actions validated by zod, ESLint, Vitest with Testing Library, and a Playwright browser test against the production build.
tags: [typescript, react, web, fullstack, scripts, bun, node]
deps:
  app: [next, react, react-dom, zod, server-only]
  dev: [typescript, "@types/node", "@types/react", "@types/react-dom", eslint, eslint-config-next, prettier, vitest, "@vitest/coverage-v8", "@vitejs/plugin-react", jsdom, "@testing-library/react", "@testing-library/dom", "@testing-library/jest-dom", "@testing-library/user-event", "@playwright/test"]
tools: [bun, node, git]
decisions:
  - "Node version: current LTS (default), recorded in .node-version and engines.node. Node runs next, Vitest and Playwright; Bun installs and runs scripts."
  - "Styling: CSS modules plus one global stylesheet (default), or Tailwind CSS when the person asks for it, set up the way the installed Next docs describe."
  - "Formatter: Prettier with its defaults and the shipped .prettierignore (default), checked by lint."
merge: [.claude/settings.json]
fragments:
  required: [claude-harness]
  default: [git-hooks, ci-github]
  optional: [rr, ce-plugin, drizzle-postgres]
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
    run: "bun run start --port ${PORT_WEB}"
    expect: { http: "http://localhost:${PORT_WEB}/api/health", within: 60s }
  - name: readme-filled
    layer: check
    run: "test -s README.md && ! grep -n 'stacks:fill' README.md"
commands:
  dev: Run the Next development server
  build: Build the production app
  start: Serve the production build on Node
  typecheck: Generate route types and run tsc
  lint: Run ESLint and the Prettier check
  format: Apply Prettier formatting
  test: Run Vitest once
  test:watch: Watch Vitest tests
  coverage: Run Vitest with coverage
  e2e: Build, then run the Playwright tests against the production server
  check: Run lint, typecheck, tests and e2e
  clean: Remove build, test and coverage output
  prepare: Install git hooks and the Playwright browser outside CI
---

# Next.js app on Node

One Next.js App Router application, built with `next build` and served by `next start` on Node. Server components are the default; client components are explicit and small. Package scripts are the entry points. The proving slice is an items page: a server-rendered list from an in-memory service, a form that posts to a Server Action validated with zod, the list refreshed after a successful write, a JSON health route and an error boundary. No database, account, auth or deploy target is assumed; fragments add them.

Read `docs/guidance/nextjs/index.md` before writing code and link it from AGENTS.md.

## Look up the installed release first

Next changes routing, caching and config conventions between majors, and your memory of it is probably older than the installed release. Recent releases ship their docs inside the package at `node_modules/next/dist/docs/` (getting started, guides including testing, API reference, CLI). Look things up in this order: the installed type declarations and that docs folder, then the matching page on nextjs.org, then memory last. If the folder is missing, the release predates bundled docs; use nextjs.org for the installed major.

## Layout

```text
src/app/              routes: layout.tsx, page.tsx, error.tsx, not-found.tsx, actions.ts,
                      api/health/route.ts, CSS modules beside the components that use them
src/components/       client components ("use client"), one per file
src/lib/              code safe on both sides: zod schemas, pure helpers
src/lib/server/       server-only services; each module imports "server-only" first
tests/                Vitest: services, schemas, client components
e2e/                  Playwright specs against the production server
scripts/prepare.ts    shipped: lefthook and Chromium install outside CI
```

## Setup

1. Read `bunx create-next-app@latest --help`, then run it non-interactively into a temporary directory: TypeScript, App Router, `src/` directory, ESLint, the `@/*` alias, Bun as package manager, no install, no git, no agent files, no Tailwind unless the styling decision chose it. Move its files into the project without overwriting scaffold files, then delete the temporary directory and the starter's marketing page, images and generator README.
2. Keep the generator's `next.config` settings and its TypeScript and ESLint version ranges. Raise a major only after the TypeScript and ESLint config pages in the installed docs say it's supported. Set the package name, Bun `packageManager`, Node LTS in `.node-version` and `engines.node`.
3. Install the remaining dev dependencies, checking peer ranges. Configure Vitest, Prettier and Playwright as below.
4. Build the proving slice:
   - `src/lib/server/items.ts`: an in-memory items service (list, add) seeded with two items, holding its store on `globalThis` so dev hot reload keeps it.
   - `src/lib/item-schema.ts`: the zod schema for a new item (a trimmed, required name with a length limit) and a pure function turning `FormData` into either the item or per-field errors.
   - `src/app/actions.ts` (`"use server"`): parse with that function; on errors return them with the submitted values; on success add the item and invalidate the page's cached data the way the installed caching docs describe for read-your-own-writes, so the new item shows without a manual reload.
   - `src/app/page.tsx`: a server component that awaits the service and renders the list and the form. `src/components/add-item-form.tsx`: a client component that submits to the action, keeps its returned state, shows field errors next to the input and disables the button while pending.
   - `src/app/api/health/route.ts`: `GET` returns `{"status":"ok","items":<count>}` from the service, rendered per request rather than at build time.
   - `src/app/error.tsx`: a client error boundary with a safe message and a retry button; `not-found.tsx` for unknown paths.
5. Write the tests listed under Testing, fill README and AGENTS.md, then run verify.

## Server and client boundary

Only `src/lib/server/` reads environment variables, holds state or talks to anything outside the process. Server components and actions call it; client components never import it. The `server-only` import makes a leak fail the build; the shipped Claude hook stops it earlier. Treat every Server Action as a public HTTP endpoint: validate its input with zod on the server even when the form validates in the browser, and return errors as data rather than throwing. Thrown errors go to the nearest `error.tsx`, where production hides the message, so expected failures never throw.

Pass plain serializable data from server to client components. Keep `"use client"` at the leaves; a provider or form is a client component, the page around it isn't.

## Tool configuration

TypeScript is strict with unchecked index access, no emit, bundler resolution and the generator's Next plugin and include list (it covers generated route types). `typecheck` runs Next's route-type generation command (see `next --help`), then `tsc --noEmit`, so typed routes exist before tsc. If the installed TypeScript has no JavaScript compiler API, follow the installed TypeScript config page for how `next build` type checks.

Next's environment types can require `NODE_ENV` on every child-process environment. If the shipped harness tests fail typechecking for that reason, keep their isolated environments and supply `NODE_ENV` explicitly, including after filtering inherited variables.

ESLint runs through its own CLI (`eslint .`) with the generator's flat config, which extends Next's core-web-vitals and TypeScript configs. Don't use a framework lint wrapper; newer majors removed it. Add Playwright and test globs to its ignores only if a rule misfires. `lint` also runs `prettier --check .`. The shipped `.prettierignore` keeps Prettier off generated output and the stacks-owned `.stacks/` directory; add to it rather than formatting those.

Vitest uses the React plugin, resolves the `@/*` alias (the installed Vite's tsconfig-paths option, else `vite-tsconfig-paths`), runs `tests/**/*.test.{ts,tsx}` only, uses the node environment by default and jsdom for files that render components (a per-file environment comment), and loads jest-dom matchers and Testing Library cleanup in a setup file. Map `server-only` to an empty module in the Vitest config: imported outside Next's server bundler it throws, so service tests fail on import otherwise.

Playwright uses Chromium, one worker, `forbidOnly` in CI, retained traces on failure and a `webServer` that runs `bun run start --port <port>` on a test port (`PORT_E2E`, default 3100) with `reuseExistingServer` off in CI. `e2e` runs `next build` first, because `next start` serves only a finished build.

## Testing

Vitest can't render async server components. Test what it can and leave the rest to Playwright:

- The item schema and FormData parser: valid input, empty and whitespace names, an over-long name, each with the exact field error.
- The items service: list, add, and that two tests don't share state (reset the store in a `beforeEach` through an exported test helper).
- The form component in jsdom with a stub action: renders field errors from state and disables submit while pending.
- `error.tsx`: shows the safe message and calls `reset` on retry.

Don't call the Server Action from Vitest: invalidation needs Next's request context. Playwright covers it in `e2e/items.spec.ts`: the page lists the seed items, an empty submit shows the field error without adding anything, a valid submit shows the new item and it survives a reload, and `/api/health` returns 200 with `status` `ok`. Tests need no `.env` and no network beyond localhost.

<!-- stacks:when with=ci-github -->
CI sets up Bun from packageManager and Node from `.node-version`, installs frozen dependencies, runs lint, typecheck and coverage, installs Chromium with system dependencies, then runs e2e. Upload the Playwright report and test results on failure. No credentials are needed.
<!-- stacks:end -->

## Commands

Wire the declared scripts to `next`, ESLint, Prettier, Vitest, Playwright and the shipped helper. `test` is `vitest run`; `prepare` runs `bun scripts/prepare.ts`, which outside CI installs lefthook when `lefthook.yml` exists and downloads Chromium for e2e (slow once, then a no-op). `clean` removes `.next/`, `coverage/`, `test-results/` and `playwright-report/` only. List every script in AGENTS.md with a single-test-file example (`bun run test tests/item-schema.test.ts`).

<!-- stacks:when with=git-hooks -->
`scripts/prepare.ts` already runs `lefthook install` after every `bun install`, so don't add another install step. pre-commit runs ESLint with `--fix` and Prettier on staged files; pre-push runs `bun run typecheck` and `bun run test` in parallel.
<!-- stacks:end -->

## Gotchas

- `next dev` writes a marked block into AGENTS.md pointing agents at the bundled docs when it detects a coding agent. Keep it and commit it; deleting it only brings it back.
- Never force `--bun` on next, Vitest or Playwright, and never use `bun test`; they run on Node. Bun doesn't pass its loaded `.env` to the Node child, and Next loads `.env*` itself.
- Caching defaults differ by major and by `next.config` flags. A page that shows stale data after a write is a caching problem: read the installed caching and revalidation guides before adding a dynamic flag to the page.
- `.next/` and `next-env.d.ts` are generated. Change source or config, never them.
- Production builds hide thrown error messages. Read the server log printed by `next start` or the Playwright trace (`test-results/<test>/`) for the real cause.
