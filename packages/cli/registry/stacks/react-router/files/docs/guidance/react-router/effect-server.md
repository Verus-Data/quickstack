# Server code (Effect)

Everything under `app/.server/` is Effect: services, config, errors, and the runtime that loaders and actions run programs on. Nothing here is imported by client code (a hook denies it from components, hooks, client libs, and schemas).

Load the project's `effect` skill before writing Effect code or looking up an Effect API; it was written against the installed release.

## Services and the runtime

- A service is a `Context.Service` class in `services/` with its layers as statics (`static readonly layer`, plus `layerMemory` when tests need fresh state). Add it to `AppLayer` in `runtime.ts`; never build a second runtime for app code.
- `runtime.ts` owns the one `ManagedRuntime`. It's settable so tests can swap in one built from test layers, and in dev it disposes the previous runtime (kept on `globalThis`) before building a new one on hot reload. Don't cache service instances outside the runtime.
- Long-lived in-memory state (an in-memory store, rate-limiter buckets) lives on `globalThis` in dev so hot reload doesn't wipe it.
- Services depend on other services through the context (`yield* OtherService`), never by providing another service's layer inside a constructor.

## Config and errors

- Every env var is read in `config.ts` through Effect Config; empty counts as unset. Secrets are redacted values. Nothing else touches `process.env`.
- Expected failures are tagged errors in `errors.ts`. Each maps to one HTTP status and one retryability in `runRoute` (`http.ts`, through `statusFor` and `retryableFor`). Add the error and both mappings together, and give it a user-safe message.
- Unexpected failures are defects: `runRoute` logs them once and returns a generic 500. Don't catch and swallow them earlier, and don't turn a defect into a tagged error to make it "handled".

## Retry, timeout, limits

- Effect retry and timeout are for non-streaming calls to third parties, with the underlying SDK's own retries turned off so there is one retry layer. Retry only errors that can succeed on retry (429, 5xx, network), with a jittered exponential schedule and a cap.
- A streaming response is not wrapped in Effect retry or timeout: once bytes have reached the client, a retry would repeat them. The app that adds streaming says how it is bounded.
- Limits (input size, counts, durations) come from Config. Enforce them before calling a third party, not after.

## Effect traps

- `Effect.catch` catches typed failures only; defects and interruption need `Effect.catchCause`. `Effect.promise` and a throw inside `Effect.sync` are defects: wrap third-party promises with `Effect.tryPromise({ try, catch })` (pass its `signal` through) and throwing code with `Effect.try`, mapping to a tagged error.
- Fail with `return yield* new SomeError({...})`.
- Work that outlives the Response runs from a callback: capture the context with `yield* Effect.context<never>()` before handing control away, run the program with `Effect.runForkWith(context)`, and end it in `Effect.catchCause(... Effect.logError ...)`: a failing forked fiber prints nothing otherwise. The callback returns nothing, not the fiber.
- No `Effect.runPromise`/`runSync` inside Effect code, and no `Effect.provide(X.layer)` in a service or per request (a sequential provide builds the layer again, with fresh state). Services come from the runtime.
- `Layer.effect` handles scoped constructors (finalizers register on the layer's scope); there is no `Layer.scoped`.
- Service methods return `Effect<A, E, never>`: yield dependencies in the layer constructor, not in each method.
- Time comes from `Clock`, not `Date.now()`, in anything a test drives with `TestClock`.

## Logging

`Effect.logInfo` / `logWarning` / `logError` with annotations, not `console.*`. `logging.ts` formats them: one line per record in the terminal, JSON lines in `logs/server.jsonl` (dev) and on stdout (production). Annotation keys become top-level JSON keys, so use stable camelCase names and don't reuse `time`, `level`, `msg`, `detail`, or `error`. `runRoute`/`runData` already log one `request` line per call and annotate everything under them with `requestId`; don't add per-route access logging. Never log message content, prompts, request bodies, or API keys, and don't log whole third-party error objects (SDK errors can carry the request body): pass the error as a log argument and `logging.ts` keeps only its name, message, status, and stack.
