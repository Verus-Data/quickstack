---
schema_version: 1
id: openrouter-ai
kind: fragment
category: vendor
name: OpenRouter integration
description: OpenRouter configuration, models discovery, request guardrails, and a scriptable local test server.
tags: [typescript, ai, openrouter]
applies_to: [typescript]
decisions:
  - "Default model: a cheap current model with tool support, selected from OpenRouter's public models list during setup (default), recorded as OPENROUTER_MODEL and as the application's fallback default when it needs one."
  - "Routing: no fallback models or provider sort; provider fallbacks and data collection allowed, zero-data-retention disabled (default). All routing settings are configurable."
---

# OpenRouter integration

Add provider configuration and a reusable boundary test harness. The application owns its client library, streaming protocol, recorder, replay assertions, evals, and user interface.

## Configuration and models

Read `OPENROUTER_API_KEY` as an optional redacted secret; empty means unset. Add `OPENROUTER_MODEL`, optional `OPENROUTER_BASE_URL`, comma-separated `OPENROUTER_FALLBACK_MODELS`, `OPENROUTER_PROVIDER_SORT` (price, throughput, latency), `OPENROUTER_ALLOW_FALLBACKS`, `OPENROUTER_DATA_COLLECTION`, and `OPENROUTER_ZDR` to the stack-owned `.env.example`, config module, and README. Leave optional SDK-owned variables commented out when empty values are invalid. Never put the key in a committed config file or log it.

The application must start, build, and test without a key. Return a clear not-configured state only when a provider operation needs it. Model discovery uses the public models endpoint, iterates every page, caches for ten minutes, and exposes the cached list without fetching. Resolve a requested model against the list; report `UnknownModel` for an invalid selection. Derive provider labels from id prefixes when the endpoint has no provider field. A stale or failed list must not prevent the application itself from starting.

Keep bounded retries and timeouts at one layer; disable duplicate client-library retries. Capture actual request bodies in tests and assert fallback models, routing settings, and usage accounting are sent correctly. Map upstream status and reason to a safe error without exposing request bodies or secrets. A rejected key, unavailable model endpoint, context overflow, or other rejected request is not retryable; credit exhaustion, throttling, server failures, timeouts, and unknown transient failures are retryable, with actionable messages. Credits exhausted must say to add credits or raise the key limit.

<!-- stacks:when tag=web -->
Over HTTP, the not-configured state is `LlmNotConfigured` (503, not retryable), an invalid model selection is `UnknownModel` (400), an upstream failure is `UpstreamUnavailable` (502, carrying its own `retryable` and a log-only `detail` with the upstream status and reason), and structured output that fails its schema is `InvalidModelOutput` (502, not retryable). The raw upstream cause is logged, never sent to the client.
<!-- stacks:end -->

Before paid recorder or eval use, tell the user to set a credit limit on the API key. Those commands remain opt-in and outside verification; never include a key in CI.

<!-- stacks:when with=effect -->
Use Effect Config and typed upstream errors. For Effect AI, map `AiError` reasons once at the provider boundary into the application's tagged errors. Preserve status and reason in log-only detail; keep retryability explicit and exhaustively mapped. Drive retry and timeout tests with TestClock.
<!-- stacks:end -->

## Local test server

Implement `tests/helpers/stub-openrouter.ts` with `startStubOpenRouter(port)`: `/models`, streaming and non-streaming `/chat/completions`, captured `chatRequests`, and per-test scripted failures. Support queued tool calls, `dropAfter`, `hangAfter`, `failCompletions(status)`, and queued recorded bodies via `replay(names)`. Own its listener lifecycle and use ephemeral ports for unit tests. Apps choose fixed ports only for their end-to-end harness.

Use real HTTP clients against this server, never module mocks. Cover model pagination with more models than one page (client paginators stop at the first short page), the cache, unknown ids, missing key, empty optional config, 401/402/404/429/5xx, interrupted streams, routing payloads, and usage metadata. Tests isolate credentials and point all provider URLs at unreachable local addresses unless the test owns a stub.

## Gotchas

App evals implement report v1 from `docs/eval-report.md` and use the shipped
independent `scripts/check-eval-dry-run.ts` checkpoint. It checks two local models,
required cases, explicit metadata and per-model aggregates. Keep `.eval/` ignored.
Vendor-only projects get these developer helpers without a new verify step or
dependency; apps still own their runner, stub and pure scorers.

Verify provider and SDK peer ranges against installed packages. Some SDKs inspect their own environment variables despite explicit constructor options; normalize invalid empty options at that boundary and record the workaround with a regression test. A provider's transitive validator dependency does not change the project's schema conventions.
