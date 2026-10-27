# Phase 4.3: MCP server

Status: DRAFT 2026-10-26 (not agreed). Gated: start only when the evidence below exists.

| Field | Value |
|---|---|
| Goal | `@quickstack/mcp` is a published stdio MCP server that exposes `list`, `show`, `new` (never launching an agent) and `verify` as tools by running the published CLI's `--json` contract, so an agent whose client prefers MCP tools, or has no shell, gets the same results and the same trust boundary as the CLI |
| Traces to | Assumption 5: "Handoff to whatever agent is on PATH is the right entry point. Confidence: Low. Validate: Watch whether people use `new` from a terminal or ask their agent to run it." The coding agent as "the CLI's main reader". D11: "an MCP server will be its own package" |
| Depends on | 1.6c (a published `quickstack` with a stable `--json` contract), 3.1a (`show --json`, which `quickstack_show` wraps). Evidence: open question 15 |
| Blocks | Nothing |
| Decisions needed | Open question 15 (the start condition below). D9 (proposed) supplies context. The `@quickstack` npm scope must be owned by the maintainers before publishing ([open question 23](../risks-and-open-questions.md#open-questions-for-the-maintainers)); if it isn't, publish as `quickstack-mcp` and change nothing else |
| Settles | How the server shares code with the CLI; packaging; tool contracts; that MCP changes nothing about what runs |

## The gate (open question 15)

The CLI's `--json` contract already serves every agent that can run shell commands. An MCP server earns its place only when that path is shown to fail someone. Start this sub-phase when either holds:

- Documented agent struggles with the shell path: 2.0b bench run notes in `plans/runs/` or GitHub issues showing an agent mis-parsing `--json` output, failing to find or invoke the CLI, or losing the brief, in a way a tool interface would fix; or
- A user asks for quickstack in a client that has MCP tools but no shell tool.

A majority of `new` events with handoff kind `inside-agent` (4.2a's entry-point share, if D17 is agreed) is supporting context only: it shows agents are running quickstack through the shell successfully, which argues against the server, not for it. Without telemetry, the two evidence sources above are enough. The exit criteria require recording which evidence started the work.

## Scope

In:

- Filling in the `packages/mcp` placeholder: a stdio MCP server, tests, scripts the root fan-out runs, `.claude/rules/mcp/`.
- Four tools and one resource.
- A manual `npm publish` of `@quickstack/mcp` by a maintainer, the same way 1.6c publishes the CLI. A CI release of this package is out of scope here and owned by no sub-phase: 5.0's workflow releases only `quickstack`.

Out:

- HTTP or SSE transports. A remote MCP server would run commands on a server and need auth.
- `add` and `source` tools until the four basics are used.
- Any tool that runs a command from an entry.

## Design

### Where this fits

This is the only phase 4 sub-phase that doesn't depend on the API: it wraps the CLI that 1.6c published, with `show` from 3.1a. It shares no source with `packages/cli`; the shared surface is the CLI's `--json` output and error envelope (see roadmap, Contracts: Error envelope, JSON contract).

### How it shares code

The server runs the CLI with `--json` for each tool call. The JSON contract is stable, versioned and tested, so the server can't drift from the CLI. The cost is one Node process per call (around 100 ms). Extracting the CLI's core into a library was rejected: two programs would wire the same services and diverge on config and error mapping. If call latency matters in practice, revisit then.

### Packaging

- `@quickstack/mcp` depends on `quickstack` with `"quickstack": "workspace:^"`, which `bun pm pack` rewrites to the released range. Its own code and `effect` are bundled the way 0.2 bundles the CLI, so `quickstack` is its only runtime dependency.
- The server finds the CLI from the dependency, never from PATH: `createRequire(import.meta.url).resolve("quickstack/package.json")`, then the `bin.quickstack` path from that file, run as `process.execPath <bin> ... --json`. That pins the CLI version the server was released with. If 0.2 gives `quickstack` an `exports` map, it must include `"./package.json"`; the startup test catches it if not.
- `bin`: `quickstack-mcp`. A client registers it as `npx -y @quickstack/mcp`.

### Protocol

`effect` 4.0.6 (installed) exports the server from `effect/ai`: `import { McpServer } from "effect/ai"`, with `McpServer.layerStdio({ name, version, protocols })`, `McpServer.toolkit(...)` for tools defined with `Tool` and `Toolkit` from the same module, and `McpServer.resource(...)`. `layerStdio` requires a `Stdio` service, provided by `NodeStdio` from `@effect/platform-node`. `effect/ai` also exports `McpClient` with `layerStdio`, which the tests use, so no MCP SDK dependency is needed. Re-check these exports against the installed version before writing code, since the module is marked unstable.

### Tools

| Tool | Input | Runs | Returns |
|---|---|---|---|
| `quickstack_list` | `{ kind?: "stacks" \| "fragments" }` | `quickstack list --json` | The `list --json` result |
| `quickstack_show` | `{ id: string }` | `quickstack show <id> --json` | The `show --json` result |
| `quickstack_new` | `{ stack, dir, with?, without?, sandbox?, yes? }` | `quickstack new <stack> <dir> --no-launch --json ...` | The `new --json` result, including `next` and the brief path |
| `quickstack_verify` | `{ dir, only? }` | `quickstack verify --json` with `cwd: dir` | The verify result; `isError: true` when the CLI exits non-zero, with the result still attached |

Plus a resource `quickstack://brief/<dir>` returning `.quickstack/BRIEF.md`.

Arguments are passed as an argv array, never through a shell. Tool descriptions are written for the agent: `quickstack_new` never launches an agent and its `next` text is the caller's task; `quickstack_verify` runs the project's own steps and weakening a step counts as failure; any non-empty untrusted list in a result means stop and ask the user.

A non-zero exit becomes a tool result with `isError: true` and structured content `{ exit, error }`, where `error` is the CLI's envelope from the last stderr line and, for keeps-result failures (exit 5), `result` is the stdout result.

### Trust

Trust model ([roadmap, Trust model](../roadmap.md#trust-model)) points 1 to 4 apply unchanged. `quickstack_new` always passes `--no-launch`. `quickstack_verify` runs the manifest's steps, the same decision as running verify from a shell; the client's tool approval is an extra check, not a replacement. Untrusted entries surface through the same result fields. The server runs under the client's environment, so `AppConfig.agent` detection and point 4's refusals still apply to anything the CLI does.

### Failure modes

| Case | Result |
|---|---|
| `quickstack` not resolvable | Server exits at startup with a message naming the package; no tools registered |
| CLI exits non-zero | `isError: true` with `{ exit, error, result? }` |
| CLI output isn't valid JSON | `isError: true`, tag `Defect`; logged to the server's stderr |
| `dir` outside the client's workspace roots | Rejected before running, when the client provides roots |
| Verify longer than the client's tool timeout | Documented; the agent can loop with `only` |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/mcp/package.json`, `tsconfig.json`, `biome.json` | Fill in the placeholder; drop `private`; `bin`; depend on `quickstack`; scripts `build`, `typecheck`, `test`, `coverage`, `check`, `clean` |
| `packages/mcp/src/server.ts`, `src/tools/*.ts`, `src/run-cli.ts` | New |
| `packages/mcp/scripts/build.ts` | Bundle, as 0.2's build does |
| `packages/mcp/tests/` | New |
| `.claude/rules/mcp/` | No shell strings; CLI found only through the dependency |
| `AGENTS.md`, `packages/mcp/README.md` | How to register the server with an agent client |

## Acceptance tests

All against the built bundles: the package's `test` script builds the CLI (`bun run --cwd ../cli build`) and the server, then runs Vitest on Node, so tests exercise the files that get published.

- An `McpClient` from `effect/ai` connects over stdio to the built server, lists four tools and one resource.
- `quickstack_list` returns the same JSON as running the resolved CLI with `list --json` directly, byte for byte.
- The server resolves the CLI through `quickstack/package.json`'s `bin` field: with a fake `quickstack` earlier on PATH that would fail, tools still work.
- `quickstack_new` into a temp dir writes the brief and manifest, the result's `handoff.kind` is `print`, and no agent process starts with a fake agent on PATH.
- `quickstack_verify` on a fixture with one failing step returns `isError: true`, `exit: 5`, the envelope and the result with the failing step.
- An untrusted fixture composition returns a non-empty untrusted list.
- The brief resource returns the file's exact contents.
- `bun pm pack` of the package: its `package.json` lists only `quickstack` as a dependency.

## Exit criteria

- The gate is met and the evidence that met it is recorded in this file.
- Acceptance tests pass; `bun run check` green from the repo root, including `packages/mcp`.
- A maintainer publishes `@quickstack/mcp` by hand; `npx -y @quickstack/mcp` starts from a clean directory.
- One real agent client registers the server and builds a sandbox project to a green `verify` through the tools alone; run note in `plans/runs/`.

## What this plan may get wrong

- Long verify runs may exceed client tool timeouts. Then `quickstack_verify` needs `only` in a loop, or progress notifications, which is the streaming question (A2) again.
- `effect/ai`'s MCP modules are marked unstable and may change in a 4.x minor. Pin the catalog range if they do, and record why under Build workarounds.
- The gate may never be met because shell access is universal. That means the CLI was the right interface and this plan stays unexecuted.
