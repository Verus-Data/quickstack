---
schema_version: 1
id: python-react
kind: stack
name: Python API + React SPA
description: FastAPI backend (uv, ruff, mypy strict, pytest) plus a React single-page app (Vite, React Router in SPA mode, TanStack Query, Tailwind, shadcn/ui) that talks to the API through a typed client generated from its OpenAPI spec.
tags: [python, typescript, react, web, api, fullstack, monorepo, make, bun, node]
deps:
  backend: [fastapi, uvicorn, pydantic, pydantic-settings, structlog]
  backend-dev: [ruff, mypy, pytest, pytest-asyncio, pytest-xdist, pytest-cov, pytest-randomly, httpx]
  frontend: [react, react-dom, react-router, "@tanstack/react-query", zod, tailwindcss, "@tailwindcss/vite", class-variance-authority, lucide-react]
  frontend-dev: ["@react-router/dev", vite, "@vitejs/plugin-react", typescript, eslint, "@eslint/js", typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-jsx-a11y, globals, prettier, vitest, "@vitest/coverage-v8", happy-dom, "@testing-library/react", "@testing-library/jest-dom", "@testing-library/user-event", msw, "@faker-js/faker", orval, "@playwright/test"]
tools: [uv, bun, make, git, jq]
merge: [.claude/settings.json]
decisions:
  - "Python version: the newest stable CPython that FastAPI, ruff, and mypy support (default). Setup writes it to .python-version and requires-python."
  - "Frontend package manager: bun (default), or npm/pnpm; swap every command consistently."
  - "Database: none (default); add --with postgres for Postgres + SQLAlchemy + Alembic."
  - "Auth: none (default); leave a current-user dependency as the seam."
  - "Production SPA serving: static host on the API's origin behind a reverse proxy (default), or FastAPI serving the build."
  - "Commit the generated API client and openapi.json (default: yes)."
env:
  PORT_API: "8000"
  PORT_WEB: "5173"
fragments:
  default: [agent-ops, git-hooks, ci-github, posthog]
  optional: [postgres, docker-deploy, rr, ce-plugin]
verify:
  - { name: install, phase: setup, layer: install, run: make install }
  - { name: lint, layer: lint, run: make lint }
  - { name: typecheck, layer: typecheck, run: make typecheck }
  - { name: test, layer: test, run: make test }
  - { name: api-contract, layer: check, run: make check-api }
  - { name: build, layer: build, run: make build, tags: [prod] }
  - name: api
    phase: serve
    layer: serve
    run: make dev-api
    expect: { http: "http://localhost:${PORT_API}/health", within: 90s }
  - name: web
    phase: serve
    layer: serve
    run: make dev-web
    expect: { http: "http://localhost:${PORT_WEB}/", within: 90s }
  - name: readme-filled
    layer: check
    run: "test -s README.md && ! grep -n 'stacks:fill' README.md"
commands:
  install: Install backend and frontend dependencies
  lint: Lint and format-check both halves
  format: Auto-format and auto-fix both halves
  typecheck: mypy strict + tsc
  test: Backend and frontend tests
  coverage: Tests with coverage thresholds enforced
  build: Production frontend build
  dev: Run API and web dev servers together
  dev-api: API dev server with reload on PORT_API
  dev-web: Web dev server on PORT_WEB (proxies /api to PORT_API)
  backend-install: uv sync (--locked when CI is set)
  backend-lint: ruff check + ruff format --check
  backend-format: ruff format + ruff check --fix
  backend-typecheck: mypy strict
  backend-test: pytest (parallel)
  backend-coverage: pytest with the coverage floor
  frontend-install: bun install (frozen lockfile when CI is set)
  frontend-lint: ESLint + prettier --check
  frontend-format: prettier --write
  frontend-typecheck: React Router typegen + tsc
  frontend-test: vitest run
  frontend-coverage: vitest with coverage thresholds
  frontend-build: Static SPA build into frontend/build/client
  generate-api: Dump OpenAPI from the backend and regenerate the typed client
  check-api: Fail if frontend/openapi.json no longer matches the backend's spec (run generate-api)
  e2e: Playwright end-to-end tests (installs the browser on first run)
  clean: Remove caches and build output
---

# Python API + React SPA

`backend/` is FastAPI on uv; `frontend/` is React Router with SSR off. orval generates the frontend's types, hooks, and MSW handlers from the backend's committed OpenAPI spec. The root `Makefile` is the entry point for everything.

## Layout

```
Makefile, .env.example
backend/
  pyproject.toml, uv.lock, .python-version
  app/main.py            create_app() factory + module-level app
  app/config.py          Settings (pydantic-settings) + cached get_settings()
  app/lifespan.py        long-lived resources on app.state
  app/errors.py          AppError hierarchy + handlers
  app/logging.py         structlog + request-id binding
  app/routers.py         register_routers(app), the one place routers mount
  app/api/               one module per area exporting `router` (health.py first)
  app/schemas/ services/ pydantic API models / plain business logic (no FastAPI imports)
  scripts/dump_openapi.py
  tests/
frontend/
  react-router.config.ts (ssr: false), vite.config.ts, vitest.config.ts,
  playwright.config.ts, orval.config.ts, components.json, openapi.json (generated)
  app/root.tsx, routes.ts, routes/, components/ui/ (shadcn), lib/ (api fetcher, query client, utils)
  app/api/generated/     orval output, never hand-edited
  tests/setup.ts, tests/mocks/generated/, tests/e2e/
```

## Setup

Every generator runs in its subdirectory, never the populated root.

1. **Backend.** `uv init` non-interactively in `backend/` as an unpackaged application (no `src/` layout, no build backend), so `app/` sits directly in `backend/`, with the Python version from Decisions. Make `.python-version` and `requires-python` match that version (uv may default to an older interpreter it finds). `uv add` the backend deps, `uv add --dev` the backend-dev deps, delete uv's stub `main.py`/`hello.py`, create `app/`.
2. **Backend code** per Conventions: `GET /health` returns `{"status": "ok"}` with no dependencies. Add `scripts/dump_openapi.py`, run from `backend/` as `uv run python -m scripts.dump_openapi` so it can import `app`. Configure ruff, mypy, pytest, coverage in `pyproject.toml`; get `uv run pytest` green.
3. **Frontend.** The official React Router generator, non-interactively, into `frontend/`, without git or install. `bun install`; set `packageManager` in `frontend/package.json` to the installed bun version (CI's bun setup reads it). SSR off; remove what only serves an SSR server (a server Dockerfile, the serve package and its `start` script). Keep one font setup; if the template and shadcn's init both add one, keep shadcn's. Add Tailwind through its Vite plugin if the template didn't.
4. **shadcn/ui.** Run its init non-interactively in `frontend/` (check `--help`: current versions also need a style/preset and base-library flag to skip every prompt), and let it add its own utility deps; it infers aliases from tsconfig. Check that `components.json` points at `~/components`, `~/components/ui`, `~/lib`, `~/lib/utils`, `~/hooks` (`~` is `app/`) and fix only what's wrong, rather than writing it by hand. Make sure `button` exists (init may add it).
5. **Data layer.** One `QueryClient` in `app/lib/query-client.ts`, provided in `root.tsx`; the Vite dev proxy.
6. **Typed client.** `make generate-api`. The home route calls `/health` through a generated hook and renders it: one real UI-to-API round trip.
7. **Frontend tooling** per Tool configuration, a component test for the home route (against MSW), one Playwright smoke spec. Fill the README's `stacks:fill` markers.
8. Run `stacks verify` until it passes.

## Conventions

**Backend**

- **Factory.** `create_app(settings: Settings | None = None)` configures logging, lifespan, middleware (request id, CORS from settings), exception handlers, and `register_routers(app)`. `main.py` ends with `app = create_app()`. Importing `app.main` has no side effects (no network, DB, or file writes), so `dump_openapi.py` and tests can import it.
- **Config.** One `Settings(BaseSettings)` with working dev defaults, reading env and the repo-root `.env` (resolvable from `backend/`), `SecretStr` for secrets, `__` nested delimiter. `get_settings()` is `lru_cache`d and injected with `Depends` so tests override it.
- **Lifespan** owns every long-lived resource on `app.state`; no module-level singletons that connect at import.
- **Routers.** Each `api/<area>.py` exports `router = APIRouter(prefix=..., tags=[...])`, mounted only in `routers.py`. App routes under `/api` (`/api/v1` for external consumers); `/health` at the root. Dependencies use `Annotated[T, Depends(fn)]`.
- **Errors.** Raise `AppError` subclasses rather than `HTTPException`. `AppError` (`code` UPPER_SNAKE, `message`, `status_code`, `details`) with `NotFoundError`, `ConflictError`, `ValidationFailed`, `Unauthorized`, `Forbidden`. Handlers render everything, including validation errors and `HTTPException`, as `{"error": {"code", "message", "details", "requestId"}}` (`request_id` with snake_case on the wire); the catch-all logs and returns `INTERNAL_ERROR` (detail only in development). Declare the envelope model in `responses=`.
- **Logging.** structlog, JSON outside development. Middleware accepts or generates `X-Request-ID`, binds it, and echoes it.
- **OpenAPI is the contract.** Every route has a `response_model`; `generate_unique_id_function` yields `<tag>_<function_name>` so client names don't churn. `dump_openapi.py` writes sorted keys and a trailing newline.

**Frontend**

- **SPA mode**: no server `loader`/`action`. Data comes from generated hooks (or `clientLoader` when a route must block).
- **API access**: relative `/api/...` URLs. Vite proxies `/api` and `/health` to `http://localhost:${PORT_API}` (from env, default 8000). Set Vite's `envDir` to the repo root so the root `.env` reaches the frontend. One fetcher in `app/lib/api.ts` (orval's mutator) prefixes `VITE_API_BASE_URL` when set, throws a typed `ApiError` (`code`, `message`, `status`) parsed from the envelope on non-2xx, and exports that error type for the generated hooks.
- **Generated code is read-only**: `app/api/generated/` and `tests/mocks/generated/` come from `make generate-api`. Exclude them from ESLint and coverage, not from Prettier (see orval).
- shadcn components in `components/ui/` are owned source; feature components in `components/<feature>/`. Use theme tokens (the CSS variables shadcn's init defines) over raw colors, `cn()` for conditional classes, `cva` for variants, and utility classes over inline styles. Extend shadcn components in place; give interactive elements accessible names. Route analytics through the analytics module. Invalidate with orval's query keys. `VITE_` vars are public and baked in at build.

## Tool configuration

- **ruff**: target the project's Python, line length 100. Select E, W, F, I, B, C4, UP, ARG, SIM, TC, PTH, ERA, PL, RUF, ASYNC, S, T20; ignore E501, PLR0913; tests may ignore S101, PLR2004, ARG. `app` is first-party. `ruff format` formats.
- **mypy**: strict, `warn_unused_ignores`, `warn_redundant_casts`, pydantic plugin; relax `disallow_untyped_defs` for `tests.*`; per-module `ignore_missing_imports` only for untyped libraries.
- **pytest**: asyncio auto mode, function-scoped loops, `testpaths = ["tests"]`, `--strict-markers --strict-config -ra`, markers `slow` and `integration`, `filterwarnings = ["error"]` with commented targeted ignores.
- **coverage**: source `app`, branch, parallel, `fail_under = 80`, exclude `if TYPE_CHECKING:`.
- **ESLint** flat config: `@eslint/js`, typescript-eslint, react-hooks, jsx-a11y recommended (browser globals from `globals`); unused vars error except `^_`. Ignore `build/`, `.react-router/`, generated dirs, `playwright-report/`, `test-results/`.
- **Prettier**: defaults. `.prettierignore` covers build output, `.stacks/`, `.claude/` and `openapi.json` (written by `dump_openapi.py`, not Prettier) but not the orval output dirs, which orval's Prettier hook formats. `lint` runs ESLint + `prettier --check`; `format` writes.
- **TypeScript**: strict; `~/*` -> `app/*`; include React Router's generated route types.
- **Vitest**: own `vitest.config.ts` with `@vitejs/plugin-react` (not the React Router plugin), `happy-dom`, `globals`, `setupFiles: ["./tests/setup.ts"]`, include `app/**/*.test.{ts,tsx}`, exclude `tests/e2e/**`, tsconfig's aliases, and vendor keys (`VITE_PUBLIC_POSTHOG_KEY`) set to `""` in `test.env`. v8 coverage (text + lcov) over `app/**` minus generated code and route entries; thresholds 80 lines/statements, 70 branches, 75 functions.
- **tests/setup.ts**: jest-dom matchers, MSW server set to fail on any unhandled request (find the installed MSW's option for it; reset per test), Testing Library cleanup.
- **orval**: from `./openapi.json`, (1) TanStack Query hooks + zod schemas in `app/api/generated/` using `app/lib/api.ts` as the custom mutator, with the fetch client configured so hooks return the success body itself rather than a `{data, status, headers}` wrapper (the fetcher throws on non-2xx; check orval's docs for the current option names, more than one may be involved); (2) MSW handlers in `tests/mocks/generated/`. Its post-generation Prettier hook respects `.prettierignore`, which is why generated dirs stay out of it. MSW handlers use `@faker-js/faker`. Default to camelCase on the wire via a shared `ApiModel` pydantic base model with camelCase aliases (serialize by alias, accept both on input); keep Python code snake_case.
- **Playwright**: chromium, CI retries and `forbidOnly`, HTML report with `open: "never"`; `webServer` runs `make dev-api` and `make dev-web`, reusing servers outside CI only.

## Testing

- **Backend**: shared fixtures in `tests/conftest.py`; the real app via `httpx.AsyncClient` + `ASGITransport(app=create_app(test_settings))`, entering the lifespan. Assert status codes, the envelope for 404/422/500, bodies. Test services directly. Stub external HTTP at the transport (respx or `httpx.MockTransport`), never your own code.
- **Frontend**: Testing Library by role/label, `user-event`, a fresh `QueryClient` with retries off per test, MSW via generated handlers (override inline for error and empty states). Build on `tests/render.tsx` and `tests/mocks/server.ts`. The test DOM enforces CORS on requests to another origin (a test of `VITE_API_BASE_URL`): give those handlers CORS headers, and answer `OPTIONS` if it preflights.
- **E2E**: a few Playwright smoke paths; `make e2e`, not verify.
- `make coverage` enforces both halves' thresholds; `make test` stays fast.

## Commands

The shipped root Makefile (`make help`) has `backend-*` and `frontend-*` sub-targets (install, lint, format, typecheck, test, coverage; plus `frontend-build`) that the combined targets call: install, lint, format, typecheck, test, coverage, build, dev, dev-api, dev-web, generate-api, check-api (a verify step: fails when `openapi.json` no longer matches the spec the backend dumps, compared as parsed JSON so formatting doesn't matter; it checks the spec only, not the generated client, which `generate-api` rebuilds from it and `typecheck` catches drifting), e2e, clean. `frontend/package.json` scripts back the frontend half: `dev`, `build`, `typecheck` (`react-router typegen && tsc`), `lint`, `format`, `test` (`vitest run`), `test:e2e`, `generate:api`. Mirror both in AGENTS.md.
<!-- stacks:when with=ci-github -->

**CI.** Two jobs behind the `changes` filter. Backend: uv's setup action (cache on, `.python-version`), then `make backend-install backend-lint backend-typecheck backend-coverage`. Frontend: bun's setup action, which reads `packageManager` from `frontend/package.json`, then `make frontend-install frontend-lint frontend-typecheck frontend-coverage frontend-build check-api`; `check-api` dumps the backend's spec, so this job also sets up uv and runs `make backend-install` first. Use the `-test` targets instead of `-coverage` if the coverage decision is no. Playwright (`make e2e`), if wanted, is its own job.
<!-- stacks:end -->

## Gotchas

- Bare `vitest` is watch mode in a TTY; scripts use `vitest run`.
- `tsc` fails on missing `./+types/...` until React Router typegen runs; `.react-router/` is gitignored.
- If ruff's TC rules are on, they move annotation-only imports under `if TYPE_CHECKING:`, but FastAPI and pydantic evaluate annotations at runtime, so a moved import breaks startup. Set ruff's runtime-evaluated base classes (`pydantic.BaseModel`, `pydantic_settings.BaseSettings`) and ignore TC in `app/api/` and `tests/`: ruff matches decorators by qualified name, while `@router.get` is an attribute of a router instance, so the decorator setting does not apply.
- If orval fails under bun with `Cannot find module 'ajv/dist/core'`, add the current `ajv` major as a frontend dev dependency and record it under Build workarounds.
- Regenerate after any route or schema change and commit spec and client together.
- `filterwarnings = error` turns upstream deprecations into failures; add targeted ignores, don't drop the rule.
- ruff renames rule prefixes across releases; switch to the new code when it warns.
- A static SPA host must fall back to `index.html`, or deep links 404.
