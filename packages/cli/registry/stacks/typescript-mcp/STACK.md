---
schema_version: 1
id: typescript-mcp
kind: stack
name: TypeScript MCP server with Effect
description: A stdio MCP server on Effect's MCP modules, serving typed tools and a resource over newline-delimited JSON-RPC, with Vitest unit tests and a real client handshake against the built server.
tags: [typescript, mcp, effect, bun, node, ai, scripts]
deps:
  app: [effect, "@effect/platform-node"]
  dev: [typescript, "@biomejs/biome", vitest, "@vitest/coverage-v8", "@types/node"]
tools: [node, bun, git]
decisions:
  - "Transport: stdio only (default), through layerStdio. No HTTP, no SSE, no auth."
  - "Runtime: Node runs the built server (default), because an MCP client spawns node, not bun; Bun builds and runs the build script."
  - "Protocol revisions: 2026-07-28 and 2025-11-25 (default: both, in that order); the server advertises both, so a client that lags behind still connects."
  - "Dependencies: bundled into the server (default), so it needs nothing installed beside it; a server that wraps another program adds that program as its one runtime dependency."
merge: [.claude/settings.json]
fragments:
  required: [claude-harness]
  default: [git-hooks, ci-github, effect]
verify:
  - { name: install, phase: setup, layer: install, run: bun install }
  - { name: lint, layer: lint, run: bun run lint }
  - { name: typecheck, layer: typecheck, run: bun run typecheck }
  - { name: test, layer: test, run: bun run test }
  - { name: stdio-handshake, layer: test, run: bun run e2e }
  - name: readme-filled
    layer: check
    run: "test -s README.md && ! grep -n 'quickstacks:fill' README.md"
---

# TypeScript MCP server with Effect

A stdio MCP server on Effect's MCP modules, launched by an agent client as a subprocess. The server is the product: no model provider, no chat loop, no HTTP listener, no dashboard. It speaks newline-delimited JSON-RPC over stdin and stdout, declares typed tools, and serves one resource. The proving slice is a `ping` tool, one tool that takes a string and returns it with its length, and one markdown resource, exercised end to end by a real `McpClient` in the tests. Build that slice until the handshake passes, then extend it.

## Layout

`src/server.ts` is the entry: it builds the layer, registers the toolkit and the resource, and runs. It declares nothing itself.

`src/toolkit.ts` holds the `Toolkit` of `Tool`s: names, descriptions, parameter and success schemas. Pure declarations, no imports that touch I/O.

`src/handlers.ts` holds one handler per tool: read the decoded parameters, do the work, map failures. `Tool.make` decodes the parameters on the way in and the success value on the way out, so a handler decodes neither of them itself; its only job is the failure mapping.

If this server fronts another program, add `src/run.ts` as the only place a child process starts: through `ChildProcessSpawner`, always an argv array and never a shell string, returning `{ exit, stdout, stderr }` with a timeout it enforces itself. A server whose tools compute their own answers has no such file, and inventing one to look complete leaves dead code nothing calls.

`src/config.ts` is the only reader of `process.env`. `src/errors.ts` holds tagged errors with fixed messages. `src/schemas/` holds one file per shape that crosses the boundary, re-exported from `index.ts`, because the `effect-schema` fragment requires a directory and a `src/schemas.ts` file cannot also exist.

Vitest tests live in `tests/`; the stdio handshake lives in `e2e/` and runs against `dist/server.js`. Nothing in `src/` may import from `tests/` or `e2e/`. Keep `dist/` out of version control and out of typecheck: it is build output, and a checked-in bundle makes a stale server look current.

## Setup

Create package metadata with `"type": "module"`, `"version": "0.1.0"`, and a `bin` entry mapping the project slug, which is the directory name, to `dist/server.js`. Write `.node-version` yourself with the Node major you target: quickstacks does not write one, and CI reads it. Set `engines.node` to match it, and record the Bun version the build needs in `.bun-version`. TypeScript starts from the compiler's own `--init` output and stays strict: no unchecked index access, verbatim module syntax, `noEmit` because Bun bundles and tsc only checks. Biome with two spaces, double quotes, width 100, and organized imports. Vitest runs on Node and excludes `e2e/`. The required `claude-harness` fragment ships an `AGENTS.md`; if this server is scaffolded into a repository that already has one, keep that one true rather than inventing a second.

Scripts: `build` (Bun bundles `src/server.ts` for the Node target with a shebang, output `dist/server.js`), `dev` (run the source through Bun for a quick loop), `lint`, `typecheck`, `test` (Vitest, unit only), `e2e` (build, then the handshake), `check` (lint, typecheck, test, e2e), `clean` (generated output only).

Bun bundles here, it does not compile a native binary: the result is one ESM file that `node` executes and a client can spawn. That is why `bin` points at `dist/server.js` and not at a compiled executable, and why `dev` under Bun is a convenience while every test that proves the server works runs the bundle.

Install `effect` and `@effect/platform-node` together from one version and check peer ranges. The MCP modules are exported from `effect` under an `ai` path: `McpServer`, `McpClient`, `McpProtocol`, `Tool`, `Toolkit`, `McpSchema`. That subtree is marked unstable, so read the installed `.d.ts` files before writing an import and record anything surprising under Build workarounds. If the latest Effect release is a prerelease, pin every Effect package to the same one.

## Transport

`McpServer.layerStdio({ name, version, protocols: [McpProtocol.v2026_07_28, McpProtocol.v2025_11_25] })` needs `Stdio`: `NodeStdio.layer` from `@effect/platform-node` alongside, then `NodeRuntime.runMain` in the entry or a scoped main in tests. Both are advertised: newer for current clients, older for those that haven't moved. `effect/ai` exports namespaces: `import { McpClient } from "effect/ai"` gives the namespace, not the tag (`McpClient.McpClient`; `yield* McpClient` fails "is not iterable"); layers (`McpServer.layerStdio`, `McpClient.layerStdio`, `McpProtocol.v2025_11_25`); only `effect/ai` and `effect/process` resolve — no `effect/ai/McpServer`.

Register the tools with `McpServer.toolkit(Toolkit.make(...))` and the handler layer with the same toolkit's `toLayer({ ... })`, provided alongside. Register the resource with `McpServer.resource`.

Stdout belongs to the protocol. Not one byte may go there except JSON-RPC frames: no startup banner, no version line, no `console.log`, no `console.error` either, because `console.error` is correct only by accident and the next edit turns it into stdout. Configure Effect's logger to write to stderr and log through it. A stray line breaks the frame stream and the client sees a parse error, not your message.

Build the layer in one place and provide it once. If the layer fails to build, write one line to stderr naming the failure and let the process exit non-zero before any tool is registered: a server that starts and then fails every call is harder for a client to diagnose than one that never starts. Provide the handler layer alongside the toolkit, so a tool declared without a handler is a startup failure rather than a `tools/call` that throws.

## Tools

Declare each tool with `Tool.make`, naming it, describing it for the agent that will read the description, and giving it a parameters schema and a success schema. Declare a failure schema only on a tool that has a failure worth reporting: a tool that cannot fail keeps the default (`Schema.Never`) and its description says it reports no failure of its own. `Toolkit.make(ping, echo)` collects them; the handler layer comes from `Toolkit.make(...).toLayer({ ping: handler, echo: handler })`.

The slice has two tools. `ping` takes no parameters and returns a typed object confirming the server is alive. `echo` takes one required string parameter and returns that string alongside its length, so a call exercises parameters, success decoding, and the failure path in one place.

Declare the failure and set `failureMode: "return"`. A declared failure then comes back as a `CallToolResult` with `isError: true` and no structured content: the client reads a text block, so the handler must put a stable message there and the test must parse it. Without that mode the same failure surfaces as a protocol error and the client loses the tool-level detail. A declared failure arrives as a text block with the schema-encoded value `{"_tag":"EchoTooLong","message":"..."}`; a defect or undeclared throw arrives as a fixed internal error message, not that value. Parse the JSON and assert exactly those fields — never "whatever came back".

Keep the parameter schema narrow: `Schema.Struct` with the keys the tool needs, a required key left non-optional, and no catch-all object. A loose schema turns a client mistake into a runtime defect inside the handler, where the declared failure cannot help. Name tools for what they do, in snake case with a shared prefix if the server fronts one product, because a client shows the bare name in its approval prompt and there is no namespace to disambiguate it there.

## Resource

Serve one static resource: a URI built from the project slug (`<slug>://readme`), a name and a description a client can list, `mimeType: "text/markdown"`, and a body that is one exported constant in `src/resource.ts`, so the test compares against the same value the server serves. Register it with `McpServer.resource`. The resource is read-only and needs no parameters; do not invent templated URIs, subscriptions, or notifications for the slice. The e2e test reads it and compares it against the expected bytes, so the body must be a constant in one place.

## Configuration

The server reads no environment beyond an optional log level, takes no flags, and has no config file. A client launches it as `node dist/server.js` with a working directory and nothing else. State that in the README, so nobody adds a config loader to a program whose entire input is JSON-RPC.

`src/config.ts` is the only place `process.env` is read, and it reads that one variable with a safe default. Name it with the project's uppercase prefix so it cannot collide with a client's own settings. An unset or unrecognized value falls back to the default level rather than failing startup, because a client that cannot start the server shows the user nothing but an error.

The server inherits the client's environment, so treat everything in it as visible to the child and none of it as configuration. Never log an environment value, a token, or a whole error object from a dependency. If a later version needs a path or a timeout, it goes in `config.ts` and is documented in the README; it does not become a flag.

## Tests

Vitest runs on Node. Unit tests cover what is pure: argument construction, schema decoding, and each handler against a fake of the service it calls when it calls one, provided as a `Layer`, so no process starts and no network is touched. Test the failure mapping too: a handler that receives a non-zero exit or an undecodable body must produce the declared failure, not a defect. Decode a deliberately wrong payload in at least one test, so a schema that drifted from the real shape fails there and not in front of a client.

The e2e test is one file that builds, then spawns the server through `McpClient.layerStdio({ command, protocol: McpProtocol.v2025_11_25 })` with `ChildProcessSpawner` from `NodeServices` provided. It lists the tools and asserts the count and the names, lists the resources, calls each tool and decodes the result, reads the resource and compares its bytes, and exits clean. Use the older revision on the client side deliberately: it proves the server honours both, and it is the shape a client that lags behind will use. A client exposes the version it negotiated and not the server's advertised list, so prove the second revision by connecting a second time with it: dropping one from `protocols` then fails here rather than at a user's client. No module mocks, no network, no fixed port. The command it spawns is the built `dist/server.js`, so `e2e` depends on `build` and the script order must say so. `McpClient.layerStdio` drains the child's stderr and discards it, so wrap `ChildProcessSpawner` in the test layer to keep a copy and print the server's stderr before the assertion output; a handshake failure with no server log is the slowest kind to debug.

## Gotchas

The server must never read `process.argv` for flags. A stdio server that accepts arguments invites a client to pass them, and the contract is that it takes none.

A single line on stdout before the transport starts is enough to break the handshake, and the failure looks like a client bug. Keep the entry free of prints and check its output when debugging.

Do not call `process.exit` to end the server. `McpServer.layerStdio` reaches the runtime through `Layer.launch`, which never returns, so after stdin reaches EOF the process stays alive until the client kills it; that is the transport's job, and an exit call races the last flush and can truncate a response. If a test needs the process to end, close the client's scope and let it terminate the child.

Assert the tool count in the e2e test. A registration that silently fails leaves a server that answers `tools/list` with fewer entries and no error anywhere; the count is the only cheap check that catches it.

Check the installed Effect exports before writing imports, and do not copy snippet paths from release notes for an older major. When a workaround is needed, record it with its removal condition.

Biome 2 treats `files.includes` as globs, so `src` matches nothing, the run reports `Checked 0 files`, and it exits 1. That is a config failure, not a lint failure; use `src/**`, and assert the file count, not only the exit code.
