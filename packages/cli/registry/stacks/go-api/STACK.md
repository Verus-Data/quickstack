---
schema_version: 1
id: go-api
kind: stack
name: Go HTTP API
description: A Go HTTP API on the standard library (net/http, slog) with no web framework. JSON resources share one error envelope and request logging, the server shuts down cleanly on SIGINT and SIGTERM, and race-enabled tests run against the built binary.
tags: [go, api, make]
deps:
  test: [github.com/stretchr/testify]
tools: [go, make, git, golangci-lint]
decisions:
  - "Module path: github.com/<owner>/<project-slug> (default), owner from `gh api user -q .login` or the git remote, never the author's display name. If neither exists, use the bare `<project-slug>` and list the path under decisions to revisit."
  - "Router: the standard library's ServeMux with method patterns (default). Add a third-party router only when the user asks for one, and record why in AGENTS.md."
  - "Listen address: HOST 127.0.0.1 and PORT 8080 (default); a container sets HOST=0.0.0.0."
  - "Proving resource: notes (title, body) held in memory (default), or the project's first real resource with the same routes and tests."
  - "Persistence: none (default). A database replaces the in-memory store behind the same interface."
  - "Coverage floor: 60% (default)."
env:
  PORT: "8080"
merge: [.claude/settings.json]
fragments:
  default: [agent-ops, git-hooks, ci-github, rest-api]
  optional: [docker-deploy, rr, ce-plugin]
verify:
  - { name: install, phase: setup, layer: install, run: make install }
  - { name: fmt-check, layer: lint, run: make fmt-check }
  - { name: vet, layer: typecheck, run: make vet }
  - { name: lint, layer: lint, run: make lint }
  - { name: build, layer: build, run: make build }
  - { name: test, layer: test, run: make test }
  - { name: test-integration, layer: test, run: make test-integration }
  - name: api
    phase: serve
    layer: serve
    run: make serve
    expect: { http: "http://127.0.0.1:${PORT}/healthz", within: 60s }
  - name: readme-filled
    layer: check
    run: "test -s README.md && ! grep -n 'stacks:fill' README.md"
commands:
  install: Download modules and install dev tools that are missing
  build: Build bin/server with version info
  serve: Build, then run the server in the foreground until SIGINT or SIGTERM
  vet: Type-check every package, including tagged integration tests (go vet)
  lint: Run golangci-lint
  lint-fix: Run golangci-lint with --fix
  fmt: Format code
  fmt-check: Fail if gofmt or goimports would change any file
  test: Unit and handler tests with the race detector
  test-integration: Build the binary, run it on a free port, test it over HTTP and stop it with signals
  coverage: Race-enabled tests with a coverage floor
  vuln: Check dependencies and the standard library for known vulnerabilities (govulncheck)
  ci: "Everything CI runs (fmt-check, lint, coverage, test-integration, vuln, build)"
  clean: Remove build and coverage output
---

# Go HTTP API

One HTTP service in a single binary on `net/http`, `encoding/json` and `log/slog`, with no router or logging dependency. The proving slice, an in-memory `notes` resource, runs routing, validation, errors, logging and shutdown end to end. Fragments add a database, auth or a deploy target.

## Layout

```
cmd/server/main.go       version var (ldflags); calls run(ctx, args, env, stdout) and exits
internal/config/         typed Config from env, Load() and Validate()
internal/notes/          Note, validation, the Store interface and the in-memory store
internal/httpapi/        NewHandler(deps) http.Handler: routes, handlers, middleware,
                         error table, JSON encode/decode helpers
tests/integration/       black-box tests of the built binary (build tag: integration)
docs/                    ARCHITECTURE.md, configuration.md (every env var)
```

`main.go` stays thin: everything it does goes through a `run` function that returns an error, so tests can call it, and only `main` calls `os.Exit`. Domain packages never import `httpapi`.

## Setup

No generator; write the code by hand at the root.

1. `go mod init <module path>`, `go get` testify, `go mod tidy`.
2. Write `config`, then `notes`, then `httpapi`, then `main.go`.
3. Implement the proving slice below, then the tests in Testing.
4. Write `.golangci.yml` per Tool configuration.
5. Write `docs/configuration.md` and fill the README's `stacks:fill` markers (`readme-filled` checks).
6. Run `stacks verify` until it passes.

## Proving slice

Routes, registered with method patterns on one `http.ServeMux`:

| Route | Result |
|---|---|
| `GET /healthz` | 200 `{"status":"ok"}`, touches no store |
| `GET /v1/notes` | 200 `{"items":[...],"nextCursor":"..."}`; `limit` (default 20, max 100) and an opaque `cursor`; `nextCursor` omitted on the last page |
| `GET /v1/notes/{noteId}` | 200 with the note, 404 when absent |
| `POST /v1/notes` | 201 with the note and a `Location` header |

A note is `{"id","title","body","createdAt"}`: opaque string ids, `createdAt` as an RFC 3339 UTC string, list order by creation then id. `title` is required, trimmed, at most 200 characters; `body` is optional, at most 10,000. The store sits behind an interface whose methods take a `context.Context` and return errors, so a database can replace it without touching handlers. The in-memory store is safe under `-race`.

## Conventions

- **Error envelope**: every error response is `{"error":{"tag","message","retryable"}}` with `Content-Type: application/json`. One table in `httpapi` maps each tag to its status and `retryable`: `BadInput` 400, `NotFound` 404, `MethodNotAllowed` 405, `PayloadTooLarge` 413, `UnsupportedMediaType` 415, `Internal` 500, `Unavailable` 503 (retryable). Handlers return typed errors and one function writes them; no handler picks a status. Messages are fixed and safe ("title is required"); causes go to the log, never the response.
- **Mux misses**: ServeMux answers an unmatched path with 404 and a known path with the wrong method with 405 plus an `Allow` header, both as plain text. Keep its decision and replace only the body: in the outer handler, `mux.Handler(r)` returns an empty pattern for both cases. For those requests, wrap the `ResponseWriter`: on 404 or 405, replace the content type with JSON, write the envelope and suppress the mux's subsequent plain-text write, preserving `Allow`. Don't register a catch-all `/` route for 404s: it matches every method and hides the 405.
- **Decoding**: POST requires `Content-Type: application/json` (415 otherwise). Wrap the body in `http.MaxBytesReader` (1 MiB); a `*http.MaxBytesError` maps to 413. Decode with unknown fields disallowed and reject trailing data after the object; every decode failure is `BadInput`. Unknown query parameters on the list are 400.
- **Responses**: one helper writes JSON with its status. Fill a missing `Cache-Control` with `no-store` on API responses.
- **Middleware**, outermost first: request id, access log, panic recovery, then the mux. The request id comes from a valid incoming `X-Request-Id` (bounded length, token characters) or 16 random bytes in hex; it is echoed in the response header and stored in the request context. The access log writes one slog record per request after it completes: `method`, the matched `route` pattern, `status`, `duration_ms`, `bytes`, `request_id`; `/healthz` at debug. Recovery logs the panic value and stack at error level and returns the `Internal` envelope; it re-panics `http.ErrAbortHandler`.
- **Logging**: one JSON `slog` handler on stdout, built in `run` and passed down; no package-level logger and no `log.Printf`. `LOG_LEVEL` (debug, info, warn, error) sets the level. Handlers log through a logger carrying the request id.
- **Config**: read env only in `internal/config`: `HOST`, `PORT`, `LOG_LEVEL`, `SHUTDOWN_TIMEOUT` (Go duration, default 10s). Empty counts as unset. An invalid value fails startup with a message naming the variable and exit status 1. A new variable updates `docs/configuration.md`.
- **Server**: an `http.Server` with `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout` and `IdleTimeout` set; never `http.ListenAndServe`. Listen with `net.Listen` first and log `listening` with the actual address, so `PORT=0` works and tests can read the port from the log.
- **Shutdown**: `signal.NotifyContext` for SIGINT and SIGTERM. When it fires, call its stop function at once (a second Ctrl+C then kills the process), log `shutting down`, and call `Server.Shutdown` with a context bounded by `SHUTDOWN_TIMEOUT`. `Serve` returning `http.ErrServerClosed` is the normal path; log `stopped` and exit 0. A shutdown that times out logs an error and exits 1.

## Tool configuration

`.golangci.yml`, written for the installed version (its schema changed between majors):

- **Linters**: govet, errcheck, staticcheck, unused, ineffassign, bodyclose, gocritic (diagnostic and performance; disable hugeParam), gocyclo (min 30), misspell, unconvert, unparam, gosec, revive, nolintlint (require an explanation and a specific linter).
- **revive**: its default rules with `exported` and `package-comments` disabled. **errcheck**: exclude `fmt.Fprint`, `fmt.Fprintf`, `fmt.Fprintln` and `(io.Closer).Close` (exact names, no globs).
- **Formatters**: gofmt, goimports with the module as local prefix. **Exclusions**: relax gocyclo, gosec, errcheck and unparam in tests. Enable the `integration` build tag.
- **Version**: write the installed version (for example `2.x.y`) to `.golangci-lint-version`. `make lint` warns when the local binary differs, and CI reads the same file.

## Testing

- Unit tests next to code, table-driven with `t.Run`; testify `require` for preconditions and `assert` for checks. `t.Setenv` for env, never `os.Setenv`.
- Handler tests run `httptest.NewServer(httpapi.NewHandler(...))` with a fresh store per test and a logger writing to a buffer, and assert status, headers and the decoded body for: list with pagination and a bad cursor, get, get missing (404), create (201, `Location`), missing title, unknown field, malformed JSON, wrong content type (415), a body over the limit (413), an unknown path (404 envelope) and a wrong method (405 envelope with `Allow`). Add a request-id test (incoming id echoed, generated otherwise), an access-log test that parses the buffered JSON line, a panic test (500 envelope, stack logged) and a failing-store test (a fake store returning an error gives the 503 `Unavailable` envelope).
- Config tests: defaults, each invalid value.
- Integration tests (`//go:build integration`): `TestMain` builds the binary once into a temp dir. Each test starts it with `PORT=0`, reads stdout until the `listening` record and takes the address from it, then: health, a create then get round trip, an invalid body (400 envelope), and shutdown, sending SIGTERM in one test and SIGINT in another, asserting exit 0 within a few seconds and a `stopped` record. Kill the process in `t.Cleanup` so a failing test never leaves a server running.
- `make test`, `make test-integration` and `make coverage` all run with `-race`, which needs cgo and a C compiler.

## Commands

The shipped Makefile (`make help`) holds every declared command. Adapt recipes, keep the names, and mirror them in AGENTS.md with a single-test command (`go test -race -run TestName ./internal/httpapi/`). Run `make serve` in the background when you need it, and stop it by the pid you started, never by name or port.
<!-- stacks:when with=agent-ops -->

The stack's `.claude/settings.json` merges in allow rules for its non-destructive make targets and `go test`, so they're already approved; add rules only for commands you create beyond those.
<!-- stacks:end -->
<!-- stacks:when with=git-hooks -->

**Git hooks.** The Makefile's install recipe ends with the line `@test -n "$$CI" || ! test -f lefthook.yml || lefthook install`. pre-commit runs gofmt and goimports on staged `*.go` files with fixes re-staged, then `make lint` (golangci-lint needs the whole module); pre-push runs `make test`.
<!-- stacks:end -->
<!-- stacks:when with=ci-github -->

**CI.** Go's setup action with the version read from `go.mod`. Steps: `make fmt-check`, lint, `make coverage`, `make test-integration`, `make vuln`, `make build`. Lint is the one exception to calling make targets: use golangci-lint's official action with its `version-file` input pointed at `.golangci-lint-version`, because the action installs and caches that exact binary.
<!-- stacks:end -->
<!-- stacks:when with=rest-api -->

The proving slice already follows the REST rule: `/v1` prefix with `/healthz` outside it, the envelope above, cursor pagination, and 405 with `Allow` for a wrong method. Record those in AGENTS.md's API conventions section with `notes` as the example resource.
<!-- stacks:end -->
<!-- stacks:when with=docker-deploy -->

**Container.** The distroless runtime has no shell or curl, so the binary checks its own health: `server -healthcheck` GETs `http://127.0.0.1:$PORT/healthz` with a short timeout and exits 0 or 1, and `HEALTHCHECK` runs it in exec form. The image sets `HOST=0.0.0.0`. Cover the flag with an integration test.
<!-- stacks:end -->

## Gotchas

- Method patterns follow go.mod's `go` directive: an old directive selects the legacy mux, which reads `GET /v1/notes` as a literal path, so every route 404s. Keep the directive at the installed toolchain.
- A `GET` pattern also matches `HEAD`. `{noteId}` matches one segment; read it with `r.PathValue`.
- The mux records the matched pattern on the `*http.Request` it receives. The access log reads it after the mux returns, so no middleware between them may swap in a copy with `r.WithContext`.
- An integration test that stops reading the server's stdout after `listening` blocks the server on its next log line once the pipe fills. Keep draining it in a goroutine.
- Once a handler has written the header, a later error can't change the status. Decode and validate before writing anything.
- `-race` fails with a cgo error when `CGO_ENABLED=0` or no C compiler is installed. Fix the environment; don't drop the flag.
- `make vuln` can fail on a fresh project when the installed Go's standard library has a published advisory that `net/http` reaches. Set go.mod's `toolchain` directive to the patched release instead of raising `go`.
