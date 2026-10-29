# OpenTelemetry for Effect servers

The server exports traces, logs and metrics over OTLP/HTTP through one observability layer. Business code keeps using Effect's spans, log functions and metrics and never imports an OTLP module. With no endpoint configured the layer exports nothing, which is the normal state for development, tests and CI.

## Finding the API

Effect 4 ships the OTLP tracer, logger, metrics exporter, resource helpers and serializers inside the `effect` package. Their module path has changed between Effect 4 releases, so don't copy an import from memory or a blog post. Look in this order:

1. The installed `effect` declarations (`node_modules/effect/package.json` exports, then the `.d.ts` files and their doc comments).
2. The observability examples under the installed package's `ai-docs/` directory.
3. The Effect 4 source in the effect-smol repository, for behavior the declarations don't spell out (what the exporter does after a failed export, what a failed span records).

Never add Effect 3's `@effect/opentelemetry` or the OpenTelemetry JS SDK packages: they bring a second tracer and context model. The exporter needs an HTTP client; use Effect's fetch-based client or the one the stack's platform package provides, whichever the entry already supplies. Record the names you used in the project's `effect` skill.

## Where the layer lives

| Stack | Layer | Provided by | Test file | `test:telemetry` runs |
| --- | --- | --- | --- | --- |
| typescript-api | `src/observability.ts` | `src/platform/node.ts` | `tests/telemetry.test.ts` | Vitest on that file |
| astro-fullstack | `apps/api/src/observability.ts` | `apps/api/src/platform/node.ts` | `apps/api/tests/telemetry.test.ts` | Vitest's `api` project on that file |
| react-router | `app/.server/observability.ts` | `AppLayer` in `app/.server/runtime.ts` | `tests/telemetry.test.ts` | Vitest on that file |

On typescript-api and astro-fullstack the layer is platform-free (it needs only an HTTP client, which the platform entry provides), so the web-handler entry can provide it too. The Node entry's existing graceful shutdown closes the layer's scope, which runs the flush.

On astro-fullstack only the API process is instrumented. The site and the contract never import the layer, and no OTEL variable is named with `PUBLIC_`, because Astro bakes those into the browser bundle.

On react-router only server code is instrumented. The layer sits under `app/.server/`, which the server-import hook and the production build keep out of client code. The framework's production server doesn't dispose the `ManagedRuntime`, so register SIGTERM and SIGINT handlers in `runtime.ts` that dispose it (bounded by the shutdown timeout) and then exit. The development hot-reload dispose already closes the old runtime; make sure the new one doesn't start a second exporter before the old one has flushed.

## Configuration

Read these in the stack's `config.ts` with the other settings, and pass them to the layer as values. Add them, commented out, to `.env.example`, and list them in README.

Check whether exporter constructors also read environment configuration internally. If they do, isolate those reads so only the values parsed by the stack's configuration reach the exporter; otherwise extra variables can change behavior or cause startup failures.

| Variable | Meaning | Default |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector base URL; `/v1/traces`, `/v1/logs` and `/v1/metrics` are appended | unset: no exporter |
| `OTEL_EXPORTER_OTLP_HEADERS` | `key=value` pairs, comma separated, for collector auth; a redacted value | none |
| `OTEL_SERVICE_NAME` | `service.name` | the package name |
| `OTEL_RESOURCE_ATTRIBUTES` | `key=value` pairs added to the resource, such as `deployment.environment=staging` | none |
| `OTEL_SDK_DISABLED` | `true` turns every exporter off, even with an endpoint | `false` |
| `OTEL_EXPORTER_OTLP_TIMEOUT` | Milliseconds allowed for one export request | 10000 |

`service.version` comes from the package version, and `deployment.environment` from `NODE_ENV` unless the resource attributes set it. Sampling follows the entry's decision; without a sampler every trace is exported. Other standard OTel variables (per-signal endpoints, protocol selection, batch tuning) are unsupported unless you wire and test them: say so in README rather than implying the whole specification works. An endpoint that isn't a valid URL fails startup visibly, like any other invalid setting. Empty strings count as unset.

## Export limits

- Each export request has a timeout (`OTEL_EXPORTER_OTLP_TIMEOUT`). Check whether the installed exporter applies one; if it doesn't, give it an HTTP client with the timeout applied.
- Batch size is bounded (512 items per signal unless you have a reason) and batches go out on a short interval.
- Bound the number of exports in flight too: a batch-size limit alone does not bound memory when exports are slower than incoming telemetry. Drop excess telemetry rather than waiting in the request path.
- Check in the source what the exporter does with buffered items when an export fails. Telemetry may be dropped; it must not grow memory without limit or retry forever.
- The shutdown flush has its own timeout (5 seconds unless the deployment needs longer), so an unreachable collector can't hold the process open.

## Request spans, logs and metrics

Exactly one server span per request. Effect's HTTP server can create one by itself when a tracer is present; check the installed server and either use that span or create your own in the request middleware (or in `runRoute`/`runData` on react-router), not both. Name it with the method and route pattern (`GET /v1/orders/:id`), never the raw path, which carries ids. Attach the request id as an attribute and keep the stack's `x-request-id` header and `request` log line unchanged; logs carry both ids. Incoming `traceparent` headers continue an existing trace. Health probes (`/healthz`) create no span.

When disabling automatic server spans, provide that setting where the Node server builds its request runtime, not only inside the route layer. Check both the Node listener and web handler: a route-only setting can leave the Node server's own spans active, including on health probes.

On React Router, a missing route or unsupported method can be answered without reaching a loader or action. Cover those responses at the request boundary or with a fallback route, and test them through the production server as well as direct route calls.

Static assets served by the framework's production server before the router runs are not traced; don't replace that server to trace them.

For a page loader, also forward the request-id response header through the framework's document-header mechanism. Test the actual document response: a header on loader data alone may not reach the browser.

A 5xx response or a defect sets the span's status to error. 4xx responses are the client's mistake and leave the status unset.

Check the serialized status too: a tracer can mark every successful Effect as OK, including a request that returned 4xx. Keep the client-error status unset in the exported record.

Outbound calls through Effect's HTTP client propagate W3C trace context. Check it is on in the installed release rather than adding headers by hand.

The stack's logger adds `traceId` and `spanId` to each record written while a span is active, as fields the logger owns beside `time`, `level` and `msg`. OTLP log export runs alongside the stack's logger, never instead of it, and sends the same sanitized records: the allowlisted `error` field, no bodies, no credentials.

Request count and duration are Effect metrics with method, route pattern and status class (`2xx`, `4xx`, `5xx`) as attributes. Never use ids, raw paths or user input as metric attributes; each distinct value creates a new series in the backend.

## Safe errors

The stack's logs omit a defect's message because it can carry user input. Exported telemetry follows the same rule. The OTLP tracer can put a failed span's cause in its status and exception event, including a stack trace. Before export, replace defect messages with their class name and remove defect stack traces (for example by wrapping the tracer the layer installs). Typed errors have fixed, safe messages and can be exported as they are. Spans and logs never carry request or response bodies, headers other than an allowlist, or credentials.

## Tests

Build fresh layers and a fresh `ConfigProvider` per test; never read the test runner's environment. Go through real HTTP on the Node server, as the stack's contract tests do.

1. **Span nesting and isolation.** Install an in-memory tracer (a small tracer that records ended spans in an array). One request produces a server span with a child span from a service call. Two concurrent requests produce two traces, each child under its own parent.
2. **Failed request.** A route that dies with a defect whose message contains a marker string ends its server span with error status. Run the same request with the loopback receiver below and assert the marker bytes never appear in any received body.
3. **Loopback export.** Start an HTTP server inside the test on `127.0.0.1` port 0, point the endpoint at it, run a synthetic span, close the layer's scope, and assert the receiver got a POST to `/v1/traces` whose body contains the span's name. Protobuf bodies keep strings as UTF-8, so a byte search works for both wire formats.
4. **Unreachable collector.** Bind a loopback port, close it, and use it as the endpoint. A request still succeeds with its normal status, and closing the layer's scope finishes within the shutdown timeout.
5. **Disabled.** With the endpoint unset, provide an HTTP client that fails the test on any request. Run a request and shut down; the client is never called.

After a failed export the exporter can stop exporting for a while, so a test that shares an exporter with an earlier failing test sees nothing. One exporter per test avoids that. Every test closes its server and receiver in a finalizer, including on failure.

## Trying it against a collector

Any OTLP/HTTP collector works, usually on port 4318. Start one locally (an OpenTelemetry Collector or an all-in-one Grafana image), set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in `.env`, restart the server and make a request. This is a manual check; verify never needs a collector.

## Other telemetry tools

If an error-tracking SDK is added later, start it with error capture only. This layer owns tracing, and two tracers on one request produce duplicate or broken traces.
