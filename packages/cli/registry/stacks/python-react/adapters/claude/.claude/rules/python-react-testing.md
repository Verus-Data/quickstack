---
paths:
  - "backend/tests/**"
  - "frontend/tests/**"
  - "frontend/app/**/*.test.{ts,tsx}"
---

# Testing conventions

- Build backend tests on `backend/tests/conftest.py`, using the real app factory and lifespan. Test services directly; mock external boundaries, not your own code.
- Build frontend tests on `frontend/tests/render.tsx` (a fresh QueryClient with retries off) and `frontend/tests/mocks/server.ts`.
- Use generated MSW handlers by default, with inline overrides for error and empty states. Fail on unhandled requests and reset handlers per test.
- Cross-origin handlers, including tests of `VITE_API_BASE_URL`, need CORS headers; answer `OPTIONS` if the test DOM preflights.
- `make test` runs backend and frontend tests. `make e2e` runs Playwright separately; coverage thresholds belong to `make coverage`.

See the project's `AGENTS.md` for commands and the remaining conventions.
