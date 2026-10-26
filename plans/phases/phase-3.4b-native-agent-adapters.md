# Phase 3.4b: Native agent adapters

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Users of Codex, OpenCode and Cursor get the same guardrails and agent config Claude Code users get: the `agent-ops` fragment ships `adapters/codex/`, `adapters/opencode/` and `adapters/cursor/` in each agent's documented config format (D27), each proved by a bench run with that agent where a headless adapter exists, each covered by a 2.2-style reference check, and the agent skill (3.4c) gets a plugin marketplace listing |
| Traces to | Assumption "Handoff to whatever agent is on PATH is the right entry point" (confidence low); Job 1: "with tests, lint, CI and agent config"; the coding agent as the CLI's main reader |
| Depends on | [1.6a](phase-1.6a-bundled-stack-content.md) (`agent-ops`), [1.6d](phase-1.6d-guardrail-hook-fragments.md) (its Claude Code hooks, the reference for behavior), [2.0b](phase-2.0b-bench.md) (the `codex` adapter, `hooksFired`), [2.2](phase-2.2-deterministic-rot-checks.md) (the reference-check module this extends), [3.4c](phase-3.4c-agent-skill.md) (the skill the listing publishes; the adapters themselves don't need it) |
| Blocks | Nothing |
| Decisions needed | D27 (native adapters in bundled fragments). [Open question 28](../risks-and-open-questions.md#open-questions-for-the-maintainers) (default target agents): this sub-phase doesn't change the default, but its value to a non-Claude user depends on that answer. D24 for any new bench adapter |
| Settles | Which agents get native config, in what order, and the rule for adding one; how each adapter is proved and checked; the skill's marketplace listing |

## Scope

In:

- For `agent-ops` (and any other bundled fragment that ships `adapters/claude/`), an adapter per agent, only where the agent documents the format:

| Agent (`AgentId`) | What the adapter ships | Proved by |
|---|---|---|
| `codex` | Its project config file with the sandbox and approval policy stated by intent, and its hook or rules mechanism for the destructive-command and secret-write guards, if documented; otherwise the guards are stated in AGENTS.md and the adapter ships config only | A 2.0b bench run with the `codex` adapter, `hooksFired` recorded |
| `opencode` | Its project config with permission rules for destructive commands, its plugin or hook mechanism for format-on-stop and lint-on-write where documented | A bench run once a headless adapter row exists in 2.0b; until then a composition test and the reference check, and the run note says it is unproved |
| `cursor` | Its project rules files (always-applied rules carrying the guardrail instructions) and its hooks file where documented | Same as `opencode` |

- The shared hook scripts from 1.6d (`.claude/hooks/*.sh` and the shared shell library) reused by path where the agent can call a script, so behavior is one implementation. A script that reads Claude Code's hook input format gets a small adapter shim per agent, never a fork of its logic.
- A reference check per adapter format, extending 2.2's shipped-reference module: every hook or command entry in the agent's config names a composed file or a key of the merged `commands` map, and the config file parses.
- The skill's marketplace listing: a plugin manifest for the agent skill 3.4c ships, published to a plugin marketplace repository the maintainers own, with a manual publishing procedure in the package README.

Out:

- The TypeScript harness (3.4a) for other agents.
- Changing the default target agents ([open question 28](../risks-and-open-questions.md#open-questions-for-the-maintainers)).
- New `AgentId` values. The set stays the roadmap contract's four.
- CI publishing of the marketplace listing (phase 5 if ever automated).

## Design

### Where this fits

1.0 defined `adapters/<agent>/` and `AgentId` from the start; 1.1 includes an adapter only for agents in `targetAgents`. Until now only `adapters/claude/` had content, so a user whose agent is Codex got AGENTS.md and nothing that enforces anything. This sub-phase fills the other directories. No CLI code changes for composition: the mechanism exists.

### Rule for adding an adapter

An adapter for an agent lands only when:

1. The agent documents the config format (a page or schema the adapter's change links). Undocumented formats are not reverse-engineered.
2. Its files compose with the stack's other fragments without a second owner (1.1) and with JSON merges where the format is JSON.
3. The reference check for its format passes with zero findings.
4. A bench run with that agent is `pass`, when 2.0b has an adapter for it. Without one, the adapter lands marked unproved in the package README's agent table, and the first bench adapter for that agent proves it.

### Order

`codex` first (2.0b already has its bench adapter), then `opencode`, then `cursor`.

### Usage signal

This sub-phase adds no telemetry and depends on none. Whether an adapter is worth maintaining is a maintainers' call from issues and bench notes; if telemetry (phase 4) later reports target agents, that is its own field with its own reader, defined there.

### Marketplace listing

3.4c ships the skill inside the npm package with an install path for Claude Code. The listing adds a plugin manifest that points at the same skill content, so a user can install it from the agent's plugin browser. The manifest's version follows the CLI release that shipped the skill. Publishing is a maintainer step after a CLI release; the procedure is in the package README.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/registry/fragments/agent-ops/adapters/{codex,opencode,cursor}/` | Adapter content |
| `packages/cli/registry/fragments/agent-ops/files/` | Shared hook scripts made agent-neutral where needed, plus input shims |
| `packages/cli/src/core/validate/shipped-refs.ts` (2.2's check module) | One reference check per adapter format |
| `packages/cli/tests/validate-shipped.test.ts`, `tests/fixtures/registries/*` | A fixture per new check |
| `packages/cli/tests/registry.test.ts` | Composition per agent |
| `packages/cli/plugin/` | The marketplace plugin manifest for the 3.4c skill |
| `packages/cli/registry/runs.json`, `plans/runs/` | Bench records and notes per agent |
| `packages/cli/README.md` | Agent table (proved or unproved), marketplace publishing procedure |

## Acceptance tests

- For each bundled stack and each agent: `new <stack> --agents <agent> --no-launch --json` writes that agent's adapter files and no other agent's; `--agents claude,codex` writes both with no ownership conflict.
- Each new reference check has a fixture with a hook entry naming a missing file and one naming an undeclared project command, each giving one error; a valid fixture gives zero findings; an unparseable config gives `ref-json`.
- The shared guard script, called through each agent's input shim with a recorded sample hook payload, blocks the same command it blocks for Claude Code.
- A `codex` bench run of one bundled stack is `pass` with `hooksFired` non-null.
- The plugin manifest decodes against the marketplace's documented schema (a recorded copy in test fixtures), and the skill path it names exists in the packed tarball.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- `codex` adapter proved by a bench run; `opencode` and `cursor` landed proved or listed as unproved in the README with the reason.
- The marketplace listing published once by a maintainer, recorded in HANDOFF.

## What this plan may get wrong

- Agent config formats move faster than stack prose, which is the rot D1 warns about. Adapters ship only config whose shape is stable and documented; 2.2's dated-phrase check and the bench are the tripwires.
- Some agents have no hook mechanism. For them the guardrails are instructions, which an agent can ignore; the README's agent table says which agents get enforced guards and which get instructions.
- The input shim per agent is a seam where behavior can drift. The shared sample-payload test is the guard.
