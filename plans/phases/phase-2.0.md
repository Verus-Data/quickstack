# Phase 2.0: Run records, fingerprint and bench

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Every real build of a bundled stack becomes a record tied to the exact content it ran: a run record schema, a content fingerprint per composition, a ledger in the package, `quickstacks runs` to read a project's own numbers, and a bench script that scaffolds a stack, drives the user's own agent headlessly, verifies the result itself and appends to the ledger |
| Traces to | "None of these are collected today"; success rows "The agent finishes without help" and "It's faster than by hand"; assumption 1 ("count hesitations and skipped instructions"); "the only proof a stack works is an end-to-end agent run ... nobody has time to run it" |
| Depends on | 1.6 (stacks that went green once, run notes to import), 1.3 (verify's local run records and digest), 1.1 (composition) |
| Blocks | 2.1 (the canary schedules the bench), 2.2 ("changed since last green" needs the fingerprint and ledger), 4.0 (publishes ledger results) |
| Decisions needed | D8 (phase 2 before phase 3) assumed. None blocks building it |
| Decisions or questions this settles | The run record and ledger shapes; what the fingerprint covers; what counts as pass, partial and fail; how interventions are counted; why the bench doesn't breach D2 |

## Scope

In:

- `RunRecord` schema, and the ledger `packages/cli/registry/runs.json` (a JSON array,
  appended by the bench, reviewed in PRs).
- `fingerprint(composition, agent)`: a content hash of the composition's inputs.
- `quickstacks runs [--json]` in a project: its verify history and measures.
- `list --json` and `list` gain `lastRun` per stack from the ledger.
- `packages/cli/scripts/bench.ts`, a development script (not a CLI command) that runs one
  stack end to end with a chosen agent.
- Importing the 1.6 gate runs into the ledger.

Out:

- Scheduling (2.1). Validate notes about staleness (2.2). Sending anything off the
  machine (4.1). Publishing results (4.0).
- Judging whether the built project is good beyond verify. The bench records the
  agent's notes for a person to read; it doesn't grade them.

## Design

### Run record (per project, from 1.3)

1.3 already appends one line per `verify` to `.quickstacks/state/runs.jsonl`. This
sub-phase fixes its schema (if 1.3 left it loose) and adds the reader:

```ts
// src/schemas/runs.ts
export const VerifyRun = Schema.Struct({
  at: Schema.String,                  // ISO time
  cli: Schema.String,                 // CLI version
  scope: Schema.Literals(["full", "partial"]),
  outcome: Schema.Literals(["green", "failed", "changed", "interrupted"]),
  steps: Schema.Array(Schema.Struct({
    name: Schema.String,
    status: Schema.Literals(["passed", "failed", "skipped"]),
    ms: Schema.Number,
    exitCode: Schema.optional(Schema.Number),
    kind: Schema.optional(Schema.Literals(["step", "env", "timeout"])),
  })),
  secondsSinceCreated: Schema.Number,
  agent: Schema.optional(Schema.String), // detected caller, from 1.4's detection
});
```

`quickstacks runs` reads the manifest, `runs.jsonl` and `NOTES.md` and reports:

```ts
export const ProjectRuns = Schema.Struct({
  stack: Schema.String,
  createdAt: Schema.String,
  handoff: Schema.optional(Schema.String),   // 1.4's manifest record
  verifyRuns: Schema.Number,
  firstGreen: Schema.NullOr(Schema.Struct({ at: Schema.String, minutes: Schema.Number, runIndex: Schema.Number })),
  lastOutcome: Schema.NullOr(Schema.String),
  interventions: Schema.NullOr(Schema.Number), // lines under "## Asked" in NOTES.md; null if no NOTES.md
  briefWords: Schema.Number,                   // recorded by new in the manifest
});
```

Only full-scope `green` runs count as green. A `changed` outcome never counts, so an
agent can't reach "first green" by editing the steps. `interventions` is null rather than
zero when there is no notes file, because absence of notes is not evidence of no
questions.

### Fingerprint

```ts
// src/core/fingerprint.ts
export const fingerprint: (c: Composition, agent: AgentId) => string; // "sha256:<hex>"
```

Input, in order: for each composed entry in composition order, its id, canonical JSON of
its decoded frontmatter, and its body; then every composed shipped file for that agent
(`files/` plus `adapters/<agent>/`, templates rendered with fixed neutral values) as
`path`, owning entry id and bytes, sorted by path. The CLI's own brief text is excluded,
so a CLI release that rewords the brief's fixed sections doesn't mark every run stale;
a CLI change that alters behavior is caught by the canary rerunning anyway. Frontmatter
is hashed decoded, so reformatting YAML doesn't change it.

The `new --json` result and the manifest gain `fingerprint`, so a project records what
it was built from.

### Ledger

```ts
export const LedgerRecord = Schema.Struct({
  stack: Schema.String,
  with: Schema.Array(Schema.String),        // optional fragments added, sorted; [] for defaults
  preset: Schema.Literals(["default", "sandbox"]),
  agent: AgentId,
  date: Schema.String,                      // YYYY-MM-DD
  result: Schema.Literals(["pass", "partial", "fail"]),
  minutes: Schema.Number,
  verifyRuns: Schema.Number,
  interventions: Schema.Number,
  briefWords: Schema.Number,
  fingerprint: Schema.String,
  cli: Schema.String,
  note: Schema.optional(Schema.String),     // path of the run note under plans/runs/
});
```

Lookup key is stack, `with`, preset and agent; the latest date wins. `list` shows
`proven <date>`, `<result> <date>` or `unproven` per stack, and `list --json` gains
`lastRun: { date, result, fingerprint } | null`. `list` doesn't compose, so it doesn't
say whether the stack changed since; that is `validate`'s note in 2.2. A ledger that
fails its schema is a `validate` error.

`result` is `pass` when the final independent verify is green, the manifest is
unchanged, and the runner exited cleanly; `fail` otherwise. `partial` is set by a person
reviewing the notes when verify was green but a deliverable the stack names is missing.
That is the case where verify under-specified the stack, and the fix is a new verify step,
not a different label.

### Bench script

```
bun scripts/bench.ts <stack> [--with a,b] [--agent claude|codex] [--max-minutes 60] [--keep]
```

1. Packs or builds the CLI and runs it from the artifact, not from source.
2. Creates a throwaway directory outside any repo and a throwaway `HOME` with fresh XDG
   paths. Copies in only the agent's login material, never other config, so the user's
   own stacks, settings and agent hooks can't leak into the run. Telemetry, when 4.1
   exists, is off by flag and env.
3. `quickstacks new <stack> run --sandbox --no-launch --json` and reads `fingerprint`
   and `briefWords` from the result.
4. Writes `.quickstacks/BENCH.md` with the run rules: use the wrapper for verify, never
   edit the manifest, keep `NOTES.md` including `## Asked`, never fake credentials. The
   brief's own rules already say most of this; `BENCH.md` makes notes mandatory.
5. Writes `.quickstacks/bench-verify`, a two-line wrapper that logs a timestamp and runs
   the packed CLI's `verify`, so verify runs are counted even if the agent doesn't keep
   notes.
6. Launches the agent headlessly with the prompt from 1.4's `agentPrompt`, the agent's
   non-interactive mode and JSON output, and a wall-clock cap. The agent runs with full
   permissions inside the throwaway directory. Allowlisted modes were tried in design
   and rejected: agents treat their own config directories and git hook config as
   protected paths and deny writes to them under headless runs regardless of the
   allowlist, so every stack with agent config or git hooks ends red for reasons that
   aren't the stack's. Isolation comes from the throwaway directory and `HOME`, which
   is the boundary that matters.
7. When the agent exits or the cap hits, runs `verify --json` itself, checks the
   manifest digest, reads `quickstacks runs --json`, and appends a `LedgerRecord`. Copies
   `NOTES.md` into a new run note under `plans/runs/`.
8. Deletes the throwaway directory unless `--keep`. Never stops a process it didn't
   start; serve steps clean up their own process groups (1.3).

Each agent has an adapter in the script: the binary, its headless flags, how to read
duration and turn count from its output. Adding an agent is one entry.

### Why the bench doesn't breach D2

D2 is about the product: the CLI never calls an LLM and never runs a command from an
entry. The bench is a development script in the repo, run deliberately by a person or
the canary, that starts the agent the user already has, exactly as the user would by
hand. The CLI it drives is the published artifact and still runs nothing from an entry;
the agent runs the generators, and the CLI runs only the manifest's steps under
`verify`. The bench never ships in the package (excluded from `files`), and no CLI
command imports it.

### Failure modes

| Case | Handling | Exit (bench) |
|---|---|---|
| Agent not installed or not logged in | Stops before scaffolding with the agent's own message | 1 |
| Agent exceeds the time cap | Killed (process group), verify still runs, record `fail` with `note: "timeout"` | 0 (recorded) |
| Agent edits the manifest | Verify reports `changed`; record `fail` | 0 |
| Verify green but notes say a deliverable is missing | Record `pass`; reviewer changes to `partial` and opens a verify-step fix | 0 |
| Port in use on the bench machine | Bench picks free ports and passes them as `PORT_*` to both `new` and the final verify | n/a |
| `quickstacks runs` in a directory with no manifest | `NotFound` | 2 |
| `runs.jsonl` has a malformed line | Skipped and counted in a `skippedLines` field; never fails the command | 0 |

### Decisions settled here

- The fingerprint hashes inputs, not the rendered brief. Reason above.
- Headless bench runs use full permissions in a throwaway directory and `HOME`.
  Reason: allowlisted runs fail on protected agent config paths, which tells you about
  the agent, not the stack.
- The ledger is a reviewed file in the package. Reason: it ships with the CLI, so
  `list` can say "proven" offline, and every record is visible in a PR.

## Files and areas touched

| Path (under `packages/cli/`) | Change |
|---|---|
| `src/schemas/runs.ts` | `VerifyRun`, `ProjectRuns`, `LedgerRecord` |
| `src/core/fingerprint.ts`, `src/core/ledger.ts` | fingerprint; ledger read and lookup |
| `src/commands/runs.ts`, `src/cli.ts` | `runs` command |
| `src/commands/list.ts`, `src/schemas/list.ts` | `lastRun` |
| `src/commands/new.ts`, manifest schema | `fingerprint` in result and manifest |
| `scripts/bench.ts`, `scripts/bench/agents.ts` | bench and agent adapters |
| `registry/runs.json` | ledger, seeded from the 1.6 run notes |
| `package.json` | `bench` script; `files` excludes `scripts/` |
| repo `AGENTS.md`, package README | `runs`, `lastRun`, how to bench |

## Acceptance tests

- Fingerprint: stable across runs and machines for the same inputs; changes when any
  body, frontmatter value or shipped file byte changes; unchanged by YAML reformatting
  or by a change to the brief's fixed text; differs per agent when an adapter file
  differs.
- `runs` over a fixture project with a hand-written `runs.jsonl`: first green is the
  first full-scope `green`, not a `partial` or `changed` one; minutes computed from the
  manifest's `createdAt`; `interventions` counts `## Asked` lines and is null without
  `NOTES.md`.
- `list --json` shows `lastRun` from a fixture ledger, latest date winning, `null` for an
  unproven stack.
- Bench with a fake agent: a test puts a scripted "agent" on PATH (a Node script that
  writes files to make a fixture stack's verify pass, then exits) and registers it as an
  adapter. The bench appends a `pass` record with the right fingerprint. A second fake
  that edits the manifest yields `fail`. A third that sleeps past `--max-minutes` is
  killed and yields `fail` with `timeout`.
- The packed tarball contains no `scripts/` files.

## Exit criteria

- `bun run check` green from the repo root.
- The ledger holds the three 1.6 runs, with fingerprints computed from the content that
  actually ran (recorded honestly as "changed since" if the prose moved after).
- One real bench run per bundled stack, by the maintainers, appended to the ledger.
- `AGENTS.md` documents `runs`, the ledger and the bench, including the throwaway `HOME`
  rule.

## What this plan may get wrong

- Headless agent modes differ in what they allow and report. The adapter table absorbs
  the differences, but an agent without a headless mode can't be benched at all.
- Bench runs measure a fresh machine-like environment. Users' machines have busy ports,
  missing tools and read-only homes inside agent sandboxes, which the bench never sees.
  `failure kind: env` in the run record is how those show up once 4.1 exists.
- `## Asked` depends on the agent following the notes rule. In headless runs it is
  zero by construction; in interactive runs it is a lower bound.
