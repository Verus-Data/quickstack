# Phase 1.4: Handoff and entry points

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | After `new` writes the project, the brief reaches an agent without the user copying anything: the agent that called quickstacks is told what to do next, or the first agent CLI on PATH is launched with the brief as its first prompt, or the prompt is printed. Running `quickstacks` with no arguments prints a guide written for agents |
| Traces to | "The CLI writes a few files and a brief, then hands off to the agent the user already has"; assumption "Handoff to whatever agent is on PATH is the right entry point" (confidence low, "Watch whether people use `new` from a terminal or ask their agent to run it"); the agent user: "It runs `list --json`, picks a stack, runs `new`, reads the brief, builds, and loops on `verify`" |
| Depends on | 1.2 (`new` writes the manifest and brief, and returns its result), 0.3 (process service, signal policy for interactive children, results flushed before a child takes the terminal) |
| Blocks | 1.6 (the gate runs use the real handoff), 2.0 (the bench reuses the agent table and prompt text) |
| Decisions needed | D9 (both entry points, instrumented) must be agreed or explicitly deferred before this starts; if deferred, build both anyway and record the handoff kind, since recording costs nothing |
| Decisions or questions this settles | Agent detection markers and the launch order; when the CLI refuses to launch; the exact prompt text; how `new` exits when it launches an agent; what `quickstacks` with no arguments prints |

## Scope

In:

- Agent detection from environment markers, read in `config.ts` and exposed through
  `AppConfig`, never from `process.env` elsewhere.
- PATH lookup for agent binaries, also from the `PATH` that `config.ts` reads, done with
  Effect `FileSystem` and `Path` (no `which` subprocess).
- The handoff decision as a pure function, and the three outcomes: `inside-agent`,
  `launch`, `print`.
- Launching an interactive agent through the 0.3 process service with inherited stdio,
  under the 0.3 signal policy, and exiting with the agent's status.
- `new` flags: `--agent <id>`, `--no-launch`. `--json` never launches.
- Recording the handoff kind in the manifest (for D9).
- The no-argument agent guide.

Out:

- Native per-agent config files under `adapters/<agent>/` for anything other than Claude
  Code (roadmap, Won't have).
- An agent skill or plugin that teaches agents about quickstacks (3.1 authoring can ship
  one; the guide covers the MVP).
- Sending the handoff kind anywhere (4.1 telemetry, if agreed).
- `add` handoff (3.0 reuses this module unchanged).

## Design

### Detection

`AppConfig` gains a lazily read `agent` field. Detection checks, in order:

| Agent id | Marker (any one) | Binary on PATH |
|---|---|---|
| `claude` | `CLAUDECODE`, `CLAUDE_CODE` | `claude` |
| `codex` | `CODEX_SANDBOX`, `CODEX_CI`, `CODEX_THREAD_ID` | `codex` |
| `opencode` | `OPENCODE`, `OPENCODE_CLIENT` | `opencode` |
| `cursor` | `CURSOR_AGENT`, or `CURSOR_EXTENSION_HOST_ROLE=agent-exec` | `cursor-agent` |
| `other` | `AI_AGENT` set to a value none of the above match | none |

`AI_AGENT` is the cross-agent convention; its value is matched by prefix (`claude...`
maps to `claude`). Cursor's trace id variable is not a marker because the integrated
terminal sets it for humans too. Markers drift; the table lives in one schema-checked
constant with the date each marker was last confirmed from the agent's docs, and a
test asserts every id in it has a launch-args entry.

```ts
// src/schemas/agent.ts
export const AgentId = Schema.Literals(["claude", "codex", "opencode", "cursor"]);
export type AgentId = typeof AgentId.Type;
export type DetectedAgent = AgentId | "other";

// src/config.ts (added to AppConfig's service shape)
agent: Effect.Effect<DetectedAgent | undefined>;
searchPath: Effect.Effect<ReadonlyArray<string>>; // PATH split on the platform delimiter
```

### The decision

```ts
// src/core/handoff.ts: pure apart from the injected binary lookup
export type HandoffDecision =
  | { kind: "inside-agent"; agent: DetectedAgent }
  | { kind: "launch"; agent: AgentId; bin: string; args: ReadonlyArray<string> }
  | { kind: "print"; reason: PrintReason; agent?: AgentId };

export type PrintReason =
  | "json" | "no-launch" | "not-a-terminal" | "untrusted" | "no-agent-found" | "agent-not-found";

export function decideHandoff(input: {
  detected: DetectedAgent | undefined;
  json: boolean;
  launch: boolean;            // false with --no-launch
  isTTY: boolean;             // stdin and stdout are both terminals (Host)
  trusted: boolean;           // every composed entry is trusted (1.0)
  preferred?: AgentId;        // --agent
  configured: ReadonlyArray<AgentId>; // Settings.agents, user order
  find: (bin: string) => string | undefined; // absolute path or undefined
}): HandoffDecision;
```

Rules, first match wins:

1. An agent is detected: `inside-agent`. quickstacks is already a tool call inside an
   agent session; launching a second agent there would nest sessions.
2. `--json`: `print` with reason `json`. A machine caller wants a result, not a terminal
   takeover.
3. `--no-launch`: `print`.
4. stdin or stdout is not a terminal: `print`. An interactive agent with no terminal
   hangs or exits immediately.
5. Any composed entry is untrusted: `print`. This is the trust boundary in the roadmap:
   the user reads the warning before any agent acts on the brief.
6. Otherwise try `--agent` alone if given, else the configured order followed by
   `claude`, `codex`, `opencode`, `cursor` (deduplicated). First binary found:
   `launch`. None: `print` with `no-agent-found` or `agent-not-found`.

`Host` gains `isTTY: boolean`, supplied by `bin.ts` from the real streams; tests pass it.
`Settings` gains an optional `agents: AgentId[]` (schema rejects unknown ids, config
still rejects excess properties).

### The prompt

One sentence, the same in every outcome, built by `agentPrompt(verifyCommand)`:

> Read .quickstacks/BRIEF.md and carry it out. It's your full task for this project; you're done when `<verify command>` passes.

`<verify command>` is how this invocation was run (`npx quickstacks verify` when run
through npx, `quickstacks verify` when installed), taken from the invocation context
1.1 already computes for the brief. Launch arguments per agent: the prompt as the single
positional argument for `claude`, `codex` and `cursor-agent`; `--prompt <text>` for
`opencode`.

### Outcomes

| Kind | Stdout (human) | `--json` result `handoff` field | Exit |
|---|---|---|---|
| `inside-agent` | `NEXT STEP FOR THE AGENT: read .quickstacks/BRIEF.md now and carry it out, working in <dir>. Loop on <verify> until it passes. Don't stop here to report back; the brief says when to ask the user.` With untrusted entries, instead: don't start, name them, ask the user first | `{ kind, agent }` | 0 |
| `launch` | `Launching <bin> in <dir>...` flushed, then the agent owns the terminal | not reachable (`--json` never launches) | the agent's exit status |
| `print` | `Next: open <dir> in your coding agent and give it this prompt:` then the prompt, an example command (`cd <dir> && claude "<prompt>"`), and the brief path; with untrusted entries, a warning first | `{ kind, reason, agent?, prompt }` | 0 |

The `inside-agent` text is aimed at the agent reading the tool output, which is the
main reader. It is a result on stdout, not a note on stderr, because agents read
stdout first and some drop stderr.

### Launching

`new` builds its result, then for `launch`:

1. Writes the manifest's `handoff` field (below) before anything else, so a crash
   during the session still leaves the record.
2. Calls the 0.3 output flush so the scaffold summary reaches the terminal before the
   agent clears it.
3. Runs the agent through the 0.3 process service's interactive mode: cwd is the
   project, stdio inherited, SIGINT and SIGQUIT ignored by quickstacks while the child
   runs (the terminal already delivers them to the child's process group), SIGTERM and
   SIGHUP forwarded.
4. Returns the child's status as the invocation's exit status: its code, or 128 plus the
   signal number. A non-zero agent exit is not a quickstacks error and writes no error
   envelope; the project was written correctly.

The command `log` record (`main`'s `command` entry) gains `handoff: <kind>` and, for
`launch`, `agent: <id>`. No argument values, paths or prompt text.

### Manifest record

The manifest (1.2) gains:

```json
"handoff": { "kind": "inside-agent" | "launch" | "print", "agent": "claude", "at": "2026-11-03T10:02:00Z" }
```

`agent` is present for `inside-agent` (detected id, or `other`) and `launch`. This is
the local half of D9's instrumentation: 2.0's `quickstacks runs` reports it, 4.1 can
send it if telemetry is agreed. The field is not part of the verify digest.

### The no-argument guide

`quickstacks` with no subcommand prints a short guide written for agents (and readable
by people) instead of the framework's help. Today a bare invocation fails with the
framework's `ShowHelp` with no errors, which `main` turns into help text and exit 0;
the guide replaces that text only for the bare root, `--help` keeps the framework help.
Content, under 250 words, kept in `src/core/guide.ts` with a test asserting the word cap:

1. What quickstacks does, in two sentences.
2. The loop: `quickstacks list --json`, pick a stack and tell the user why, `quickstacks
   new <stack> <dir> [--sandbox]`, read the brief, loop on `quickstacks verify`.
3. Rules: never edit `.quickstacks/manifest.json`; weakening a step counts as failure;
   ask the user only what the brief says to ask.
4. Where the user's own stacks go (the user directory from 1.0).

`--json` on the bare root returns `{ guide: "<text>", commands: [...] }`.

### Failure modes

| Case | Error tag | Exit | What the agent or user sees |
|---|---|---|---|
| `--agent` names an unknown id | `Usage` (parser) | 2 | Usage error listing valid ids |
| `--agent` binary not on PATH | none, `print` with `agent-not-found` | 0 | Printed prompt plus "claude isn't on PATH" |
| Spawn fails after the binary was found (permissions, ENOENT race) | `PermissionDenied` for EACCES, `Defect` otherwise | 6 or 1 | The project is written; stderr says the launch failed and stdout already has the printed prompt (step 2 flushed it) |
| Agent exits non-zero or by signal | none | agent's status | Whatever the agent printed |
| SIGTERM to quickstacks during the session | none | forwarded; then the agent's status | The agent shuts down; quickstacks never leaves an orphan on the terminal |
| Untrusted entries composed | none, `print` with `untrusted` | 0 | Warning naming each entry and its path before the prompt |

### Decisions settled here

- Detection and launch order as above. Configured agents first lets a user who has
  several agents installed pick without a flag every time.
- `--json` never launches, and neither does a non-terminal. Reason: a launched session
  would swallow the JSON contract and hang a caller that isn't a person.
- A non-zero agent exit is passed through, not wrapped. Reason: the CLI's job ended when
  the files were written; inventing an error would make `new` look failed.

## Files and areas touched

| Path (under `packages/cli/`) | Change |
|---|---|
| `src/config.ts` | `agent` and `searchPath` on `AppConfig`; `agents` read through `Settings` |
| `src/schemas/config.ts`, `src/schemas/agent.ts` | `agents` setting; `AgentId` |
| `src/services/host.ts` | `isTTY` |
| `src/bin.ts` | supplies `isTTY` from the real streams |
| `src/core/handoff.ts` | `decideHandoff`, `agentPrompt`, launch args, messages |
| `src/core/guide.ts`, `src/cli.ts` | bare-root guide |
| `src/commands/new.ts` | flags, decision, manifest field, launch |
| `src/main.ts` | `command` record fields; guide for the bare root |
| `tests/handoff.test.ts`, `tests/new.test.ts`, `tests/helpers/cli.ts` | see below; the helper gains `isTTY` and `env` for markers |
| `e2e/` | one test against the built artifact |
| `README.md` (package), repo `AGENTS.md` | the handoff behavior and the guide |

## Acceptance tests

- `decideHandoff` table test covering every rule and their precedence (detected agent
  beats `--json`; `--json` beats `--no-launch`; untrusted beats a found binary).
- Property test with `@effect/vitest`: for any env containing a marker, the decision is
  `inside-agent` regardless of other inputs.
- `runCli(["new", "<fixture-stack>", dir, "--sandbox"])` with `CLAUDECODE=1`: stdout
  starts with `NEXT STEP FOR THE AGENT`, exit 0, manifest `handoff.kind` is
  `inside-agent`, agent `claude`.
- Same with `--json`: one JSON result whose `handoff` is `{ kind: "inside-agent", agent: "claude" }`.
- Launch with a real child: a temp directory on `PATH` holding an executable named
  `claude` (a small Node script) that writes its argv and cwd to a file and exits 7.
  `runCli` with `isTTY: true` and that `PATH`: the file shows the prompt as one argument
  and the project as cwd; the invocation exits 7; the manifest says `launch`; stdout
  had the scaffold summary before the child ran.
- Signal policy: the fake agent sleeps; the test sends SIGTERM to the quickstacks
  process (subprocess form of the test, as the dev-script test does) and asserts the
  child received SIGTERM and quickstacks exited with 143.
- `--no-launch`, non-TTY, untrusted fixture entry, empty PATH: each prints the prompt,
  exit 0, correct `reason` in `--json`.
- `quickstacks` with no args: the guide, exit 0, under 250 words; `--help` still shows the
  framework help.
- e2e: the built artifact run with `CLAUDECODE=1` against a fixture project directory
  prints the next-step text and writes the manifest record.

## Exit criteria

- All tests above pass; `bun run check` green from the repo root.
- `AGENTS.md` (Error handling, Architecture map) and the package README describe the
  handoff outcomes, the guide, and that `--json` never launches.
- The roadmap's D9 row notes that the local record exists.

## What this plan may get wrong

- Agent env markers change without notice. The constant carries confirmation dates so
  a stale one is visible; 2.1's canary runs inside real agents and will notice a missed
  detection as a nested launch attempt.
- Some agents may not accept the prompt as a positional argument in a future release.
  The launch args table is the one place to fix it, and the printed fallback always
  works.
- Ignoring SIGINT while the child runs assumes the child shares the terminal's
  foreground process group. If an agent starts its own session or group, Ctrl+C would
  reach neither; check this against each agent in the first gate run (1.6).
