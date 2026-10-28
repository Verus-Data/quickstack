# @quickstacks/mcp

A stdio MCP server built on Effect's MCP modules. It exposes typed tools and a
static resource over newline-delimited JSON-RPC, launched by an agent client
as a subprocess.

## Tools

- **ping** — takes no parameters and returns `{ alive: true }`. Reports no
  failure of its own.
- **echo** — takes `{ text: string }` and returns `{ text, length }`. Inputs
  longer than 10 000 characters fail with `EchoTooLong`, returned as a
  `CallToolResult` with `isError: true` and a JSON text block
  `{"_tag":"EchoTooLong","message":"..."}`.

## Resource

- `mcp://readme` — this document, served as `text/markdown`.

## Running

```
node dist/server.js
```

The server reads no flags and no config file. Its entire input is JSON-RPC over
stdin; stdout is protocol-only. Set `MCP_LOG_LEVEL` (trace, debug, info, warn,
error, fatal) to adjust the log threshold; logs go to stderr. An unset or
unrecognized value defaults to info.

The server advertises both protocol revisions `2026-07-28` and `2025-11-25`, so
a client that lags behind still connects.

## Build

```
bun run build      # Bun bundles src/server.ts → dist/server.js (ESM, Node target, shebang)
bun run dev        # run the source through Bun for a quick loop
bun run lint       # Biome check
bun run typecheck  # tsc --noEmit
bun run test       # Vitest unit tests (tests/)
bun run e2e        # build, then Vitest e2e (e2e/) against dist/server.js
bun run check      # lint, typecheck, test, e2e
bun run clean      # remove dist/
```

## Layout

```
src/server.ts     entry: builds the layer, registers tools and resource, runs
src/toolkit.ts    Tool declarations and Toolkit (pure, no I/O)
src/handlers.ts   one handler per tool, failure mapping
src/resource.ts   the markdown resource body constant
src/config.ts     the only reader of process.env (MCP_LOG_LEVEL)
src/errors.ts     tagged errors (EchoTooLong)
src/schemas/      one file per shape crossing the boundary, re-exported from index.ts
tests/            unit tests (schemas, handlers)
e2e/              stdio handshake test against dist/server.js
scripts/build.ts  Bun bundle script
```

## Dependencies

- `effect` — MCP modules (`McpServer`, `McpClient`, `McpProtocol`, `Tool`,
  `Toolkit`), Schema, Effect runtime.
- `@effect/platform-node` — `NodeStdio`, `NodeRuntime`, `NodeServices`.

Dev: `typescript`, `@biomejs/biome`, `vitest`, `@vitest/coverage-v8`,
`@types/node`, `@types/bun`, `@effect/vitest`.

Dependency versions resolve from the root workspace catalog.