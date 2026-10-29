---
schema_version: 1
id: effect-otlp
kind: fragment
category: tooling
name: OpenTelemetry (OTLP) for Effect servers
description: OpenTelemetry traces, logs and metrics over OTLP for the Effect server in typescript-api, astro-fullstack and react-router. One observability layer adds trace ids to the existing logs, exports nothing without an endpoint, and is tested with an in-memory tracer and a loopback OTLP receiver.
tags: [typescript, effect, observability, opentelemetry, tracing]
applies_to: [typescript-api, astro-fullstack, react-router]
requires: []
decisions:
  - "Sampling: export every trace (default). Read OTEL_TRACES_SAMPLER and OTEL_TRACES_SAMPLER_ARG only if the installed Effect release offers a ratio sampler; otherwise README lists both as unsupported."
  - "Wire format: OTLP over HTTP with protobuf bodies (default, what collectors accept without configuration), or JSON bodies if the installed release has no protobuf serializer."
verify:
  - { name: telemetry, layer: test, run: bun run test:telemetry }
commands:
  test:telemetry: Run the tracing and OTLP export tests
---

# OpenTelemetry for Effect servers

Read `docs/guidance/effect-otlp/index.md` before implementation; it has the per-stack layout, the supported variables and the test cases.

The server process exports traces, logs and metrics over OTLP/HTTP to the collector `OTEL_EXPORTER_OTLP_ENDPOINT` names. Business code keeps using Effect's own spans, log functions and metrics; only one observability layer knows about OTLP. With the endpoint unset nothing is exported, so development and tests need no collector, account or Docker.

## Finding the API

Effect 4 ships its OTLP tracer, logger, metrics and serializers inside `effect`, and their module path has moved between releases. Look in the installed `effect` declarations, then the package's `ai-docs/` observability examples, then the Effect 4 source (effect-smol). Never add Effect 3's `@effect/opentelemetry` or the OpenTelemetry JS SDK.

## What to add

One `observability.ts` layer, provided where the server builds its runtime:

<!-- stacks:when stack=typescript-api -->
`src/observability.ts`, provided by `src/platform/node.ts`. The test is `tests/telemetry.test.ts`.
<!-- stacks:end -->
<!-- stacks:when stack=astro-fullstack -->
`apps/api/src/observability.ts`, provided by `apps/api/src/platform/node.ts`. The test is `apps/api/tests/telemetry.test.ts` in the `api` Vitest project. The site and the contract never import it, and no OTEL variable gets the `PUBLIC_` prefix.
<!-- stacks:end -->
<!-- stacks:when stack=react-router -->
`app/.server/observability.ts`, added to `AppLayer` in `runtime.ts`. The test is `tests/telemetry.test.ts`. Only `app/.server/` imports it, so no exporter setting reaches the browser bundle. The framework's server doesn't dispose the runtime on exit: dispose it on SIGTERM and SIGINT, bounded by the shutdown timeout, so the last batch is sent.
<!-- stacks:end -->

`test:telemetry` runs the stack's Vitest command on that file. The layer:

- Gets its settings from the stack's `config.ts`, with headers redacted. Support only the variables the guidance lists.
- Builds no exporter and makes no network call when the endpoint is unset or `OTEL_SDK_DISABLED` is true.
- Bounds the batch size, gives every export request a timeout, and drops telemetry when the collector is down instead of queueing without limit. A slow or missing collector never delays or fails a request.
- Flushes in the shutdown scope with its own timeout.

Each request gets exactly one server span (Effect's HTTP server may already open it), named by method and route pattern (never the raw path) and carrying the request id. A 5xx response or a defect marks it as an error. Health probes aren't traced. Outbound HTTP calls propagate W3C trace context. Request count and duration are metrics labelled by method, route pattern and status class, never by ids.

Log records gain `traceId` and `spanId` while a span is active; `x-request-id` and the `request` log line stay as they are. Exported spans and logs follow the stack's logging rules: no bodies, credentials or defect messages. The exporter records a failed span's cause message, so strip defect messages before export.

## Testing

Build fresh layers and one exporter per test (a failed export disables an exporter for a while), and go through real HTTP on the Node server:

- A request's server span is the parent of a service span, and two concurrent requests produce separate traces (in-memory tracer).
- A defect ends the server span with error status, and its message never reaches the receiver.
- An in-test HTTP server on an ephemeral loopback port receives an export containing a synthetic span.
- With the endpoint on a closed loopback port, the request still succeeds and shutdown finishes within its timeout.
- With the endpoint unset, an HTTP client that fails the test on any call is never called.

## AGENTS.md

Add an Observability section: the layer's file, the supported variables, that an unset endpoint exports nothing, the trace fields in logs, and how to point the server at a local collector.
