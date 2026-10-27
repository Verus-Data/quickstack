---
paths:
  - "backend/**"
---

# Backend conventions

- Build through `create_app()`; mount routers only through `register_routers()` in `app/routers.py`. Imports must not connect to services or write files.
- Raise `AppError` subclasses instead of `HTTPException`; handlers own the shared error envelope.
- Use the shared `ApiModel` base for wire models and a `response_model` on every route.
- Operation ids derive from the tag and function name. Renaming a route function renames its generated frontend hook.
- Keep FastAPI out of `app/services/`; services contain plain business logic.
- After any route or schema change, run `make generate-api` and commit the spec and generated client together. Do not edit generated files by hand.

See the project's `AGENTS.md` for commands and the remaining conventions.
