# Phase 4.3: MCP server

Status: DRAFT 2026-10-26 (not agreed). Gated: start only when the evidence below exists.

| Field | Value |
|---|---|
| Goal | `packages/mcp` is a stdio MCP server that exposes `list`, `show`, `new` (never launching an agent) and `verify` as tools, so an agent whose client prefers MCP tools over shell commands can use quickstacks with the same results and the same trust boundary as the CLI |
| Traces to | Assumption 5: "Handoff to whatever agent is on PATH is the right entry point. Evidence: Matches how the author works. Confidence: Low. Validate: Watch whether people use `new` from a terminal or ask their agent to run it." The coding agent as "the CLI's main reader". D11: "an MCP server will be its own package" |
| Depends on | 4.0a (shared format package and conventions for a second app), evidence from D9 (proposed) |
| Blocks | Nothing |
| Decisions needed | D9 (proposed) and its data. New open question for the maintainers: the gate threshold below |
| Decisions or questions this settles | How the MCP server shares code with the CLI; its tool contracts; whether MCP changes the trust boundary |

## The gate

The CLI's `--json` contract already serves agents that can run shell commands, which is every major coding agent today. An MCP server earns its place only if agents are being asked to run quickstacks and are struggling with the shell path, or if a client that matters can't run shell. Start this sub-phase when either holds:

- 4.1 data shows a majority of `new` events with `handoff: inside_agent` for two consecutive 28-day windows, and run notes or issues show agents mis-parsing output or failing to find the CLI; or
- A widely used agent client is found that supports MCP tools but not shell commands, and someone asks for it.

Proposed threshold for the first condition: over 50% `inside_agent`. The maintainers set the real one.

## Scope

In:

- Fill in the `packages/mcp` placeholder: an MCP server over stdio, its own tests, `check` script and CI job, `.claude/rules/mcp/`.
- Four tools and one resource, below.
- Publishing as part of the `quickstacks` package (a `quickstacks mcp` subcommand) or as `@quickstacks/mcp`, decided in the design.

Out:

- HTTP or SSE transports. Stdio covers local agents, and a remote MCP server would need auth and would run commands on a server, which nothing here wants.
- `add` and `source` tools until the four basics are used.
- Any tool that runs a command from an entry. Same rule as the CLI.

## Design

### How it shares code

| Option | For | Against |
|---|---|---|
| The MCP server runs the installed `quickstacks` CLI with `--json` for each tool call | The JSON contract is already stable, versioned and tested; zero duplicated logic; the server can't drift from the CLI | One process per call (about 100 ms on Node); needs the CLI on PATH or resolved from its own dependency |
| Extract the CLI's core (registry, compose, brief, scaffold, verify runner) into `packages/core` and import it | No process per call; typed results | A large extraction to support one app; two programs now wire the same services and can diverge on config and error mapping |

Recommendation: the first. The server depends on the `quickstacks` package, resolves its bin from its own `node_modules`, and maps each tool to one CLI invocation. The shared code is the CLI's published contract, which is the cheapest thing to keep identical. If call latency matters in practice, extract `packages/core` then. That keeps the D11 rule of extracting only when the second consumer needs it, and here the second consumer doesn't need the internals.

For the MCP protocol itself, first check whether the installed `effect` exposes an MCP server module (its `effect/ai` export is the place to look). If it does and supports stdio tools, use it, matching the repo's Effect conventions. Otherwise use the official MCP TypeScript SDK, the one new dependency, justified because implementing the protocol by hand would be the larger risk.

### Tools

| Tool | Input | Runs | Returns |
|---|---|---|---|
| `quickstacks_list` | `{ kind?: "stacks" \| "fragments" }` | `quickstacks list --json` | The `list --json` result |
| `quickstacks_show` | `{ id: string }` | `quickstacks show <id> --json` | The `show --json` result |
| `quickstacks_new` | `{ stack: string, dir: string, with?: string[], without?: string[], sandbox?: boolean, yes?: boolean }` | `quickstacks new <stack> <dir> --no-launch --json ...` | The `new --json` result, including `next` and the brief path |
| `quickstacks_verify` | `{ dir: string, only?: string[] }` | `quickstacks verify --json` with `cwd: dir` | The verify report; `isError: true` when the CLI exits non-zero, with the report still attached |

Plus a resource `quickstacks://brief/<dir>` that returns `.quickstacks/BRIEF.md` for a project, so a client can read the brief without a file tool.

Tool descriptions are written for the agent: `quickstacks_new` says it never launches an agent and that the returned `next` text is the caller's task; `quickstacks_verify` says it runs the project's own verify steps and that weakening a step counts as failure.

Errors: a non-zero exit becomes a tool result with `isError: true` and the CLI's error envelope as structured content. Exit codes are passed through in that content so agents can branch on them the same way they would in a shell.

### Trust

MCP changes nothing about what runs. `quickstacks_new` never launches anything (it always passes `--no-launch`) and runs no entry command. `quickstacks_verify` runs the manifest's steps, the same trust decision as running verify from a shell; MCP clients ask the user to approve tool calls, which is an extra check, not a replacement for the manifest being visible in the repo. Untrusted compositions surface through the same `untrusted` field and brief section; the tool description tells the agent to stop and ask the user when it is non-empty.

### Failure modes

| Case | Result |
|---|---|
| CLI binary not resolvable | Server fails at startup with a message naming the package; no tools registered |
| CLI exits non-zero | Tool result `isError: true` with the envelope |
| CLI output isn't valid JSON | Tool result `isError: true`, tag `Defect`; logged to the server's stderr |
| `dir` outside the client's workspace roots | Rejected before running, when the client provides roots |
| Verify longer than the client's tool timeout | Documented; the tool returns whatever the CLI returned if the client keeps the call open |

### Decisions settled here

- Stdio only.
- Shell out to the published CLI rather than extract its core.
- `new` over MCP never launches an agent.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/mcp/package.json`, `tsconfig.json`, `biome.json` | Fill in the placeholder; depend on `quickstacks` |
| `packages/mcp/src/server.ts`, `src/tools/*.ts`, `src/cli.ts` (the CLI runner) | New |
| `packages/mcp/tests/` | New |
| `packages/cli/package.json` | If shipped as `quickstacks mcp`, a subcommand that starts the server; otherwise nothing |
| `.github/workflows/ci.yml` | MCP package joins `ci-ok` |
| `.claude/rules/mcp/` | New rules scoped to `packages/mcp/` |
| `AGENTS.md`, CLI README | How to register the server with an agent client |

## Acceptance tests

- An MCP client from the SDK (or Effect's, whichever the server uses) connects over stdio to the real server in a test, lists four tools and one resource.
- `quickstacks_list` returns the same JSON as `quickstacks list --json` run directly, byte for byte.
- `quickstacks_new` into a temp dir writes the brief and manifest, the result's `handoff.kind` is `print`, and no agent process is spawned even with a fake agent binary on PATH.
- `quickstacks_verify` on a fixture project with one failing step returns `isError: true`, the report with the failing step, and exit code 5 in the structured content.
- An untrusted fixture composition returns a non-empty `untrusted` field.
- The brief resource returns the file's exact contents.

## Exit criteria

- The gate is met and recorded in the plan with the data that met it.
- Acceptance tests pass; `bun run check` green from the repo root including `packages/mcp`.
- One real agent client registers the server and builds a sandbox project to a green `verify` through the tools alone; notes recorded per 2.0.

## What this plan may get wrong

- Long verify runs may exceed common MCP client tool timeouts. If so, `quickstacks_verify` needs `only` used in a loop by the agent, or the server needs progress notifications, which is the streaming question (A2) again.
- The gate may never be met because shell access is universal. That is a fine outcome: it means the CLI was the right interface and this plan stays unexecuted.
