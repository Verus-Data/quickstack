---
paths:
  - "tests/**"
  - "app/**/*.test.ts"
  - "app/**/*.test.tsx"
  - "e2e/**"
---

# Testing

## No network, fakes only at the boundary

- Tests never reach the network and need no `.env` or credentials.
- The only fakes are for third parties. Never mock our own modules or services; build a test runtime from real in-memory layers (`layerMemory`) instead.
- Route tests call loaders and actions with a real `Request` on a test runtime set through the runtime setter, and dispose it afterwards. `Route.LoaderArgs` (and `ActionArgs`) require `request`, `params`, `context`, `url`, and `pattern`; build them with one helper in `tests/helpers/` (`url: new URL(request.url)`, `pattern` the route path).

## Required coverage

- `/healthz` succeeding through the runtime, and failing visibly when config is invalid.
- Error paths for every route, each status it can return (bad body 400, wrong content type 415, missing thing 404, defect 500), with `retryable` asserted on each error body, not only the status.
- Request ids on responses, one completed-request log line, a defect logged exactly once, runtime isolation and disposal, and a log file sink that survives its directory being deleted.
- Retry schedules and anything time-based with `TestClock`.

## Effect tests

- `it.effect` runs on the TestClock (it starts at 0 and moves only when adjusted; fork the program, adjust, then join) and silences the default logger. The `effect` skill has the installed names.
- The TestClock doesn't reach routes run through a test runtime (a separate `ManagedRuntime` on the live clock). Test time-based behavior on the program or service with its layers provided directly.
- `it.layer` shares one layer build across its block; build fresh layers per test when state must not leak.

## Running

- Scoped first: `bun run test tests/<file>.test.ts` (add `-t "<name>"` for one test). Then `bun run test` before calling it done. Vitest runs on Node: never `bun test`, never `--bun`.
- Server tests run in the `node` environment; component tests opt into `happy-dom` per file. happy-dom replaces `fetch` and enforces same-origin rules, so a component test that calls a local server disables its same-origin policy for that file.
- Components that render router links need `createRoutesStub`.
- `bun run e2e` builds and runs the Playwright smoke against the production build. Add to it only when a change could break in the browser but not in happy-dom (hydration, the client bundle, a download); test behavior in vitest. On failure, read `test-results/<test>/error-context.md` first: it has the error and a snapshot of the page. Apps add their own acceptance flows.

## Discipline

- A bug fix starts with a test that fails for the bug's reason. Reintroduce the bug once to see it go red.
- A validation or limit test must prove the check bites: feed input that should be rejected and assert the rejection, not just that valid input passes.
- Never sleep to wait for something: wait on a condition (`vi.waitFor`), or drive the clock.
- Weakening an assertion, adding `.skip`, or loosening a limit to get green is a failure, not a fix.
- A subagent asked to write tests touches only test files; check with `git diff --stat`.
