# Phase 3.3b: Bundled stack expansion

Status: DRAFT 2026-10-26 (not agreed). Re-scoped 2026-10-26: 1.6a brings every bundled
stack into v1, including those beyond the gate set, so this file gives each of those a
bench proof and keeps the backlog. A stack too large for the budget now splits its slice
into an app fragment (1.1), not a D26 app entry. Body rewritten to match 2026-10-26

| Field | Value |
|---|---|
| Goal | Every bundled stack outside the gate set has a green bench run under D5 and D7, recorded in the ledger, and a backlog section names the next entries so later sessions pick them up without rediscovering them |
| Traces to | Job 1: "When I start a new project, I want it set up the way I'd set it up myself"; open question "Who is the bundled registry for?"; assumption 2, "version-less prose rots much more slowly than versioned templates", which needs more than three stacks to test |
| Depends on | [2.0b](phase-2.0b-bench.md) (bench runs), [2.2](phase-2.2-deterministic-rot-checks.md) (rot checks on the content), [3.3a](phase-3.3a-release-and-deploy-fragments.md) and [3.3c](phase-3.3c-service-vendor-and-effect-fragments.md) soft (a stack whose defaults include one of their fragments waits for that fragment's proof; one that doesn't can go first), [3.5b](phase-3.5b-two-phase-brief.md) soft (a stack that offers an app is proved without it here; the app's own proof is 3.5b's), [2.0c](phase-2.0c-run-ledger.md) (the ledger the proof rule checks) |
| Blocks | Nothing |
| Decisions needed | D6 (curated catalog) assumed; which stacks ship is the maintainers' choice (roadmap, Feature gaps). D5 and D7 unchanged. If a stack can't fit its proving slice in 1.5's composed cap, the part past the base moves into an app fragment (`category: app`, 1.1) or the stack is cut, not given a bigger budget |
| Settles | Each stack's proving slice as checked by its bench run; the order stacks are proved in; the backlog order |

## Scope

In:

- A bench proof under [3.3a's proof rule](phase-3.3a-release-and-deploy-fragments.md#the-proof-rule-for-a-bundled-entry)
  for each bundled stack outside the gate set, with stacks in place of fragments: 2.2's
  `ledger-unproven` note must be absent for each (a `pass` record for the default
  composition under `--sandbox`).
- Fixes the bench runs call for, in those stacks' entry files and, within the rule
  below, in the shared default fragments.
- The backlog section below.

Out:

- Writing the stacks (1.6a).
- Apps a stack offers (3.5b proves them).
- Device or simulator runs in verify. A mobile verify that needs a simulator can't run on
  a headless machine; the proving slice stops at tests and the export build, and the
  prose says how to run on a device.
- Signing and store submission for desktop and mobile. Prose names them as the project's
  own later steps.
- The backlog entries themselves.

## Design

### Where this fits

The gate stacks (1.6a, 1.6b) test assumption 1 at two brief sizes. More stacks are how
assumption 2 gets tested across toolchains that move at different speeds, and how the
catalog becomes something a stranger wants (D6). Each stack is a surface that can rot,
so each is proved (2.0b) and watched by 2.2's ledger notes from then on.

### What each bench run checks

1.6a's entry content rules and 3.3a's proof rule apply. In addition, each run note
checks by hand that:

- The proving slice named in the stack's Setup was built, and covers every D7 layer.
- A stack with two toolchains (a native shell and a web UI, say) gets hooks and CI that
  cover both, through `quickstacks:when tag=...` blocks in the default fragments.
- `tools` lists every CLI the agent needed on `PATH`, so 1.2a's missing-tools list and
  the `--without` hint were accurate.
- Every step that needs a production account (edge hosting, app stores) carries `prod`,
  is skipped under `--sandbox`, and the stack verifies against a local emulator.
- A dev server is a `serve` step with `expect: { http, within }`; a native shell's debug
  build is a `build` step, not a `serve` step.

### Order

Cheapest to prove first: stacks closest to the gate stacks' toolchains, then stacks with
a second toolchain, then desktop and mobile, whose SDK installs are slowest. A stack that
misses the proof rule in one session stays unproved and is named in the status line.

### Backlog

Entries designed but not scheduled. Each needs a maintainer to move it into a sub-phase;
they are listed so no one rediscovers them.

| Entry | Kind | Notes |
|---|---|---|
| `mcp-server` | stack | A Model Context Protocol server in TypeScript with stdio transport, a protocol conformance test, and an inspector-based smoke step |
| `slide-deck` | stack | A web slide deck built from Markdown with a static export and a visual smoke test |
| `plugin-marketplace` | stack | A repository that publishes agent plugins and skills, with a manifest validation step |
| `ts-fullstack` | stack | A TypeScript API and frontend in one workspace; overlaps a gate stack in shape, so it waits for evidence that users want it |
| `otel` | fragment | OpenTelemetry tracing with a local collector and a test that asserts one span |
| `deps-bot` | fragment | A dependency-update bot configured by intent (grouping, schedule, automerge for patch updates that pass CI) |
| `agent-action` | fragment | A GitHub Action that runs a coding agent on issues or pull requests, with its permissions spelled out |
| `mcp-registry` | fragment | Publishing an MCP server's metadata to a registry from a tag |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/registry/stacks/<id>/` for each stack outside the gate set | Fixes from bench runs |
| Shared default fragments under `packages/cli/registry/fragments/` | `tag=` blocks for a stack's toolchain where its run needs them, within D5 |
| `packages/cli/tests/registry.test.ts` | Composition, size and brief-identity tests |
| `packages/cli/registry/runs.json`, `plans/runs/` | One bench record and note per stack |
| `packages/cli/README.md` | Stack table, with each stack's proof |

## Acceptance tests

- For each stack outside the gate set and both presets: `new --no-launch --json` succeeds
  into a temp dir with a recording shim on `PATH` (no command run), `briefWords` is under
  1.5's cap, and the manifest has every D7 layer (with a `serve` step carrying `expect`
  where the stack has a server).
- `validate` over the bundled registry: zero errors, zero warnings, and no
  `ledger-unproven` note for any stack.
- The packed tarball's `registry/` file list equals the tree's (1.6a's packing test).
- A fix made for one stack doesn't change another proved stack's brief: a shared
  fragment may only gain `quickstacks:when` blocks that don't apply to the stacks already
  proved, so each of their composed briefs on 1.5's canonical render is byte-identical
  before and after (compared against a committed digest list). Their fingerprints do
  change, because the fingerprint hashes fragment bodies; 2.2 then reports
  `ledger-changed` (a note) for those stacks until a bench rerun records a new `pass`,
  and the run notes say so.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- Every bundled stack outside the gate set is proved under the rule, or this file's
  status line lists which aren't and why.

## What this plan may get wrong

- Desktop and mobile toolchains install slowly and need large SDKs; a bench run may hit
  the 60-minute cap on install alone. If so, raise `--max-minutes` for that stack in its
  run note rather than trimming the slice.
- Mobile verify without a simulator proves less than the web stacks do. If the
  maintainers want device-level proof, it needs a runner with a simulator, which is
  phase 5 work.
- Shared fragments growing `tag=` blocks for every toolchain push existing stacks toward
  the composed cap only if the blocks apply to them; if a block leaks, the brief-identity
  test fails.
- 2026-10-26: this plan first designed and authored three new stacks (an edge-hosted
  React app, a desktop app, a mobile app) and sent a stack too large for the budget to
  D26's `app` entry kind. The amended D18 and D13 changed both: 1.6a brings every bundled
  stack into v1, so this file proves the stacks beyond the gate set rather than writing
  them, and a slice past the budget becomes a `category: app` fragment composed by 1.1.
  The catalog's stacks are the maintainers' choice, so this file names none; how many
  there are sets how long this sub-phase takes.
