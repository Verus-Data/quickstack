# Phase 3.3b: Bundled stack expansion

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Three more bundled stacks (an edge-hosted React app, a desktop app with a Rust shell and a React UI, a mobile app) each land with a green bench run under D5 and D7, and a backlog section names the next entries so later sessions pick them up without rediscovering them |
| Traces to | Job 1: "When I start a new project, I want it set up the way I'd set it up myself"; open question "Who is the bundled registry for?"; assumption 2, "version-less prose rots much more slowly than versioned templates", which needs more than three stacks to test |
| Depends on | [2.0b](phase-2.0b-bench.md) (bench runs), [2.2](phase-2.2-deterministic-rot-checks.md) (rot checks on the new content), [3.3a](phase-3.3a-release-and-deploy-fragments.md) and [3.3c](phase-3.3c-service-vendor-and-effect-fragments.md) soft (a stack whose defaults include one of their fragments waits for it; one that doesn't can land first), [2.0c](phase-2.0c-run-ledger.md) (the ledger the proof rule checks) |
| Blocks | Nothing |
| Decisions needed | D6 (curated catalog) assumed. D5 and D7 unchanged. If a stack can't fit its proving slice in D5's 5,000 words, it waits for D26's app split ([3.5a](phase-3.5a-app-entry-kind.md), [3.5b](phase-3.5b-two-phase-brief.md)) or is cut, not given a bigger budget |
| Settles | Which three stacks join the bundled set; their proving slices; the backlog order |

## Scope

In:

| Stack | Shape | Proving slice | Servers and probes |
|---|---|---|---|
| `react-edge` | A React app with server rendering on an edge runtime, local dev through the platform's emulator | One server-rendered route that reads a binding, one client interaction with a component test, one end-to-end test against the dev server | One `serve` step with a probe on the dev server |
| `desktop-tauri` | A desktop app: a Rust shell and a React UI in a web view | One command exposed from the shell and called from the UI, a Rust unit test, a UI component test, a debug build of the app bundle | The UI dev server probed; the shell's debug build is a `build` step, not a `serve` step |
| `mobile-expo` | A cross-platform mobile app on a managed React Native toolchain | One screen with navigation, a component test, a type-checked API call to a stub, the bundler's export build | The bundler's dev server probed with its status route |

- Each stack's default fragments from the existing set (`agent-ops`, `git-hooks`, `ci-github`) and, where they fit, 3.3a's and 3.3c's.
- The proof rule from [3.3a](phase-3.3a-release-and-deploy-fragments.md#the-proof-rule-for-a-new-bundled-entry), with stacks in place of fragments: 2.2's `ledger-unproven` note must be absent for each new stack (a `pass` record for the default composition under `--sandbox`).
- The backlog section below.

Out:

- Device or simulator runs in verify. A mobile verify that needs a simulator can't run on a headless machine; the proving slice stops at tests and the export build, and the prose says how to run on a device.
- Signing and store submission for desktop and mobile. Prose names them as the project's own later steps.
- The backlog entries themselves.

## Design

### Where this fits

The MVP's three stacks (1.6a) test assumption 1 at two brief sizes. More stacks are how assumption 2 gets tested across toolchains that move at different speeds, and how the catalog becomes something a stranger wants (D6). Each new stack is a new surface that can rot, so each lands only with proof (2.0b) and is watched by 2.2's ledger notes from then on.

### Per-stack rules

1.6a's entry content rules and the 3.3a proof rule apply. In addition:

- Two-toolchain stacks (`desktop-tauri`) use `tag=` conditional blocks in the default fragments the way `python-react` does (1.6a), so hooks and CI cover both toolchains.
- `tools` lists every CLI the agent needs on `PATH` (`cargo`, `bun`), so 1.2a's missing-tools list and the `--without` hint are accurate.
- A stack whose platform needs an account for production (edge hosting, app stores) keeps every such step tagged `prod`, skipped under `--sandbox`, and verifies against the local emulator.
- Each stack's Setup names its proving slice (1.6a's rule), and the bench run note checks it by hand.

### Order

`react-edge` first (closest to the existing web stacks, cheapest to prove), then `desktop-tauri`, then `mobile-expo`. A stack that misses the proof rule in one session stays on a branch.

### Backlog

Entries designed but not scheduled. Each needs a maintainer to move it into a sub-phase; they are listed so no one rediscovers them.

| Entry | Kind | Notes |
|---|---|---|
| `mcp-server` | stack | A Model Context Protocol server in TypeScript with stdio transport, a protocol conformance test, and an inspector-based smoke step |
| `slide-deck` | stack | A web slide deck built from Markdown with a static export and a visual smoke test |
| `plugin-marketplace` | stack | A repository that publishes agent plugins and skills, with a manifest validation step |
| `ts-fullstack` | stack | A TypeScript API and frontend in one workspace; overlaps `python-react` in shape, so it waits for evidence that users want it |
| `otel` | fragment | OpenTelemetry tracing with a local collector and a test that asserts one span |
| `deps-bot` | fragment | A dependency-update bot configured by intent (grouping, schedule, automerge for patch updates that pass CI) |
| `agent-action` | fragment | A GitHub Action that runs a coding agent on issues or pull requests, with its permissions spelled out |
| `mcp-registry` | fragment | Publishing an MCP server's metadata to a registry from a tag |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/registry/stacks/{react-edge,desktop-tauri,mobile-expo}/` | `STACK.md`, `files/`, `adapters/claude/` |
| `packages/cli/registry/fragments/{agent-ops,git-hooks,ci-github}/FRAGMENT.md` | `tag=` blocks for Rust and the mobile toolchain where needed, within D5 |
| `packages/cli/tests/registry.test.ts` | Composition and size tests per new stack |
| `packages/cli/registry/runs.json`, `plans/runs/` | One bench record and note per stack |
| `packages/cli/README.md` | Stack table |

## Acceptance tests

- For each new stack and both presets: `new --no-launch --json` succeeds into a temp dir with a recording shim on `PATH` (no command run), `briefWords` is under D5's cap, and the manifest has every D7 layer (with a `serve` probe where the table says so).
- `validate` over the bundled registry: zero errors, zero warnings, and no `ledger-unproven` note for any stack.
- The packed tarball's `registry/` file list equals the tree's (1.6a's packing test, now covering the new stacks).
- The existing entries' files are byte-identical: the test compares every file under `registry/stacks/` for the stacks that existed before this sub-phase against a committed digest list. Shared fragments (`agent-ops`, `git-hooks`, `ci-github`) may only gain `tag=` blocks that don't apply to existing stacks, so each existing stack's composed brief on 1.5's canonical render is byte-identical before and after. Their fingerprints do change, because the fingerprint hashes the fragment bodies; 2.2 then reports `ledger-changed` (a note) for those stacks until a bench rerun records a new `pass`, and the run notes say so.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- Each of the three stacks has landed under the proof rule, or this file's status line lists which didn't and why.

## What this plan may get wrong

- Desktop and mobile toolchains install slowly and need large SDKs; a bench run may hit the 60-minute cap on install alone. If so, raise `--max-minutes` for that stack in its run note rather than trimming the slice.
- Mobile verify without a simulator proves less than the web stacks do. If the maintainers want device-level proof, it needs a runner with a simulator, which is phase 5 work.
- Shared fragments growing `tag=` blocks for every toolchain push existing stacks toward D5's composed cap only if the blocks apply to them; if a block leaks, the composed-brief identity test fails.
