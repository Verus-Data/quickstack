---
paths:
  - "tests/**"
---

# Testing conventions

- Build tests on `tests/conftest.py`: the real app factory, its lifespan entered, and an `httpx.AsyncClient` over `ASGITransport`.
- Simulate a failing dependency with `app.dependency_overrides`, not by patching modules.
- Assert the error envelope, not only the status code. Test services directly; mock external boundaries, not your own code.
- `make test` runs the suite in parallel; the coverage floor belongs to `make coverage`.

See the project's `AGENTS.md` for commands and the remaining conventions.
