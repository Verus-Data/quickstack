# @quickstacks/mcp

A stdio MCP server built on Effect's MCP modules. It wraps the quickstacks CLI,
exposing three typed tools and markdown resources over newline-delimited
JSON-RPC, launched by an agent client as a subprocess.

## Tools

- **quickstacks_list** — lists available stacks and fragments. Pass `kind` to
  filter to `"stack"` or `"fragment"`. Returns each entry's id, kind, name,
  description, tags, origin, trusted flag, shadows and lastRun.
- **quickstacks_new** — scaffolds a new project from a stack: writes starter
  files and `.stacks/BRIEF.md`. Runs nothing from the stack. Pass `stack`
  (required), `dir` (optional), `sandbox` (default `true`), and optional
  `with`/`without` fragment lists. Returns the project path, stack, fragments,
  agents, written files, brief word count, and handoff info. Fails with
  `CliFailure` carrying the CLI's tag, message and details verbatim.
- **quickstacks_verify** — runs the project's verify steps. Pass `dir`
  (optional, defaults to the server's working directory). Returns the outcome
  (`green`, `partial`, `failed`, `changed` or `interrupted`), totals, duration,
  and per-step results. A failing project is a successful call; it only fails
  when the CLI itself cannot run.

## Resources

- `quickstacks://guide` — the quickstacks agent guide, captured at startup.
- `skill://<name>` — one per file in `skills/*.md`, each a short skill document
  with frontmatter carrying `name` and `description`.

## Skill documents

A skill is a markdown file in `skills/`. The frontmatter gives its name and the
description a client shows before reading it; the body is served unchanged.

```
---
name: authoring-stack
description: How a stack, its fragments and its verify steps fit together.
---

# Authoring a stack

...
```

Resources are registered when the server starts, so a new skill file needs a
restart, not a reload. Two ship today: `authoring-stack` and `reading-a-brief`.

## Wiring into a client

Any MCP client that spawns a stdio server works; the only thing it needs is the
path to the built server:

```json
{
  "mcpServers": {
    "quickstacks": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/server.js"]
    }
  }
}
```

The server then appears with three tools and reads the guide and skills as
resources, so an agent can pick a stack, create a project and verify it without
shell access.

## Known limit: skills are resources, not the skills extension

MCP's skills extension (SEP-2640) defines `skills/list` and `skills/get` on top
of protocol `2026-07-28`. The server advertises that revision, but `effect/ai`
4.0.6 can register tools, resources and prompts only — there is no way to serve
an arbitrary method. So skills ride on `skill://` resources, which every client
can read, and the extension is not declared. Declaring it without serving its
two methods would be false.


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