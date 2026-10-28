# @quickstacks/mcp

A stdio MCP server built on Effect's MCP modules. It wraps the quickstacks CLI,
exposing three typed tools and markdown resources over newline-delimited
JSON-RPC, launched by an agent client as a subprocess.

## Tools

- **quickstacks_list** — lists available stacks and fragments. Pass `kind` to
  filter to `"stack"` or `"fragment"`. Returns each entry's id, kind, name,
  description, tags, origin, trusted flag, shadows and lastRun.
- **quickstacks_new** — scaffolds a new project from a stack: writes starter
  files and `.quickstacks/BRIEF.md`. Runs nothing from the stack. Pass `stack`
  (required), `dir` (optional), `sandbox` (default `true`), and optional
  `with`/`without` fragment lists. Returns the project path, stack, fragments,
  agents, written files, brief word count, and handoff info. Fails with
  `CliFailure` carrying the CLI's tag, message and details verbatim.
- **quickstacks_verify** — runs the project's verify steps. Pass `dir`
  (optional, defaults to the server's working directory). Returns the outcome
  (`green`/`partial`/`red`), totals, duration, and per-step results. A red
  outcome is a successful call; it only fails when the CLI cannot run.

## Resources

- `quickstacks://guide` — the quickstacks agent guide, captured at startup.
- `skill://<name>` — one per file in `skills/*.md`, each a short skill document
  with frontmatter carrying `name` and `description`.

## Running

```
node dist/server.js
```

The server reads no flags and no config file. Its entire input is JSON-RPC over
stdin; stdout is protocol-only. Set `MCP_LOG_LEVEL` (trace, debug, info, warn,
error, fatal) to adjust the log threshold; logs go to stderr. An unset or
unrecognized value defaults to info.

Set `QUICKSTACKS_MCP_CLI` to an absolute path to the quickstacks CLI entry
(`packages/cli/src/bin.ts`) if the default relative path does not resolve.

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
src/server.ts     entry: builds the layer, registers tools and resources, runs
src/toolkit.ts    Tool declarations and Toolkit (pure, no I/O)
src/handlers.ts   one handler per tool, failure mapping
src/run.ts        CliRunner service: spawns the CLI with bun, always --json
src/resource.ts   guide capture and skill resource loading
src/config.ts     the only reader of process.env (MCP_LOG_LEVEL, QUICKSTACKS_MCP_CLI)
src/errors.ts     tagged errors (CliFailure)
src/schemas/      one file per shape crossing the boundary, re-exported from index.ts
skills/           markdown skill files with frontmatter (name, description)
tests/            unit tests (schemas, handlers against a fake CLI)
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