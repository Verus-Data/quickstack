# Phase 1.3: `verify`

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | `quickstacks verify` runs the project's manifest steps in phases, probes dev servers, always tears down, fails when the steps were changed since `new` wrote them, and records each run locally, so an agent has an unambiguous definition of done |
| Traces to | "When I'm an agent asked to set up a project, I want a target I can verify against, so I know when I'm done" (job 5); "That is why `verify` exists, why the brief refuses to let the agent weaken a step" (Jobs, the trust paragraph); success rows "The agent finishes without help", "It's faster than by hand", "The result is complete"; assumption "`verify` is enough of a definition of done to keep an agent honest" |
| Depends on | [1.2](phase-1.2.md) (manifest, digest, state record), [0.3](phase-0.3.md) (process service, progress output, report-carrying failures, exit 5) |
| Blocks | [1.6](phase-1.6.md), [2.0](phase-2.0.md) |
| Decisions needed | D14 (changed steps fail rather than warn). If the maintainers choose "warn", the `VerifyChanged` path becomes a warning in the result and outcome `changed` still never counts as green |
| Decisions or questions this settles | Phase semantics; probe behavior; process-group cleanup; the result and run-record shapes; what counts as green; how failures are classified |

## Scope

In:

- `verify [--only a,b] [--skip-tag t] [--all] [--accept-changes] [--json]`, run from the
  project root or any directory below it (walks up to the nearest `.quickstacks/manifest.json`).
- Phases `setup`, `check`, `serve`, `teardown`; the built-in `filled` and `exists` checks;
  HTTP probes.
- Tamper detection (D14 as proposed).
- Live progress on stderr in human mode; one result on stdout in both modes.
- Run records in `.quickstacks/state/runs.jsonl`, and `firstGreenAt` in the state record.

Out:

- Sending anything anywhere (4.1). Aggregating runs (`quickstacks runs`, 2.0).
- Parallel steps. Steps run one at a time; parallelism changes failure output and port use
  and has no evidence of need yet.

## Design

### Phases

| Phase | Runs | On failure |
|---|---|---|
| `setup` | In order. Installs, starts services (databases) | Stop running further setup and check steps; go to teardown |
| `check` | In order. Lint, typecheck, test, build, file checks | Keep going: report every failing check, so the agent fixes several things per loop |
| `serve` | Each step: start the command in its own process group, poll its probe, then kill the group | Keep going to the next serve step |
| `teardown` | Always, even after a failure or an interrupt | Recorded, but never turns a green run red on its own unless it fails |

Continuing through `check` failures is deliberate: an agent loop that sees one failure at a
time takes more iterations, and each iteration costs minutes.

### Running a step

A `run` step is executed through the platform shell (`sh -c` on POSIX) with the project
root (or `cwd`, which must resolve inside it) as working directory. Environment: the
process environment, overlaid by the manifest's `env` for keys not already set, so a user
can move a port with `PORT_WEB=5187 quickstacks verify`. stdin is closed. stdout and
stderr are merged into a bounded tail buffer (last 60 lines, at most 128 KB kept) and, in
human mode, streamed to stderr prefixed with the step name.

Each step runs in a new process group through the 0.3 process service. When the step's
shell exits, the CLI waits up to 2 seconds for its output pipes to close, then sends
SIGTERM to the group, then SIGKILL after 5 seconds, so a test runner that leaves a
watcher behind cannot hang verify. Before running, the command is printed (human: a
`> name: command` line; JSON: in the result), which is part of the trust boundary.

A `check` step runs in-process with `FileSystem`:

| Kind | Passes when |
|---|---|
| `filled` | The path exists inside the project, is a non-empty file, and does not contain `quickstacks:fill` |
| `exists` | The path exists inside the project |

### Probes

A `serve` step starts `run`, then polls `probe.url` (with `${VAR}` expanded from the
merged env) every 500 ms with a 5 second per-request timeout until it returns any status
below 500 or `within` elapses (default 60 s). A probe URL with an unresolved `${VAR}`, a
non-http scheme, or a host other than `localhost`, `127.0.0.1` or `::1` fails the step
before starting anything, with a reason. The local-host rule keeps verify from becoming
a way to make requests elsewhere. If the command exits before the probe succeeds, the
step fails with its output tail.

Port in use is detected before start (a connect to the probe's host and port succeeds
before the command runs) and reported as `failureKind: "env"` with the port, rather than
probing someone else's server and calling it green.

### Selection flags

| Flag | Effect | Outcome can be `green` |
|---|---|---|
| none | Every step, except `skipByDefault` (`prod` under sandbox) | Yes |
| `--all` | Every step including `skipByDefault` | Yes |
| `--skip-tag t` | Skip steps carrying tag `t`; repeatable | No, `partial` |
| `--only a,b` | Run only these `check` and `serve` steps; `setup` and `teardown` still run | No, `partial` |

An unknown `--only` name is `BadInput` with the known names in `details`.

### Tamper detection (D14 as proposed)

Before running anything:

1. Recompute the digest of `manifest.verify` and compare it with `manifest.verifyDigest`.
2. Read `$XDG_STATE_HOME/quickstacks/projects/<projectId>.json` and compare its digest.
3. If either differs, compute which steps were removed, added or edited (by name), and fail
   with `VerifyChanged` (exit 5) without running steps. `details` lists them.
4. If the state record is missing (fresh clone, another machine, read-only home at `new`),
   compare against the manifest only and set `tamperCheck: "manifest-only"` in the result.

`--accept-changes` re-records the current steps as the definition of done in both places,
after printing the diff. It refuses with `PermissionDenied` (reason `accept_in_agent`)
when `AppConfig` reports a detected agent (the env markers 1.4 defines, read in
`config.ts`; whichever of 1.3 and 1.4 lands first adds that config field, so the two can
still run in parallel) or when stdin is not a TTY. The flag is for a person who changed the steps on
purpose; it is not reachable from an agent's shell tool in the common case. This is a
guard against an agent weakening the gate to finish, not against someone who controls
the machine; the roadmap's trust boundary says so.

### Result

```ts
const StepResult = Schema.Struct({
  name: Schema.String,
  phase: Phase,
  layer: Schema.optional(Layer),
  command: Schema.optional(Schema.String),   // run steps
  check: Schema.optional(Check),             // check steps
  status: Schema.Literals(["passed", "failed", "skipped"]),
  failureKind: Schema.optional(Schema.Literals(["step", "env", "timeout", "interrupted"])),
  durationMs: Schema.Number,
  exitCode: Schema.optional(Schema.Number),
  reason: Schema.optional(Schema.String),     // generated by the CLI, never step output
  outputTail: Schema.optional(Schema.String), // last lines of the step's own output
})

const VerifyResult = Schema.Struct({
  outcome: Schema.Literals(["green", "partial", "failed", "changed", "interrupted"]),
  scope: Schema.Literals(["full", "partial"]),
  tamperCheck: Schema.Literals(["full", "manifest-only"]),
  steps: Schema.Array(StepResult),
  totals: Schema.Struct({ passed: Schema.Number, failed: Schema.Number, skipped: Schema.Number }),
  changed: Schema.optional(Schema.Struct({ removed, added, edited })),
  secondsSinceCreated: Schema.Number,
  firstGreen: Schema.Boolean,   // this run is the project's first green
})
```

`outputTail` is the step's own output, which can contain anything the project prints.
It goes in the result on stdout (the agent needs it to fix the failure) and never into
the error envelope or the logs, which keep the base's rule that logs never carry arbitrary
data.

On failure the result stays on stdout and the error envelope is the last stderr line,
using the report-carrying failure from 0.3:

| Outcome | Exit | Envelope |
|---|---|---|
| `green` | 0 | none |
| `partial` with every selected step passing | 0 | none; the brief says done means `green` |
| `failed` | 5 | `VerifyFailed`, `details: { failed: [{ name, exitCode?, failureKind }] }` |
| `changed` | 5 | `VerifyChanged`, `details: { removed, added, edited }` |
| `interrupted` | 130 | `Interrupted` |
| No manifest found | 2 | `NotFound`, `details: { looked: <dirs> }`, with `quickstacks new` as the hint in the message |
| Manifest fails to decode | 3 | `InvalidConfig`, `details: { path, field }` |

A run is `failed` with every failing step `failureKind: "env"` (missing command exit 127
naming the step's first word, port in use, spawn error) still exits 5; `env` is there so
the agent and 2.0 can tell "the machine lacks Docker" from "the code is broken".

### Interrupts

The first SIGINT or SIGTERM interrupts the running step (its group gets SIGTERM, then
SIGKILL), skips remaining setup, check and serve steps, runs teardown, writes the run
record, and exits 130. That ordering is an Effect scope: teardown steps and the record are
finalizers. A second signal during teardown exits immediately with 130; 0.3's signal
policy owns that.

### Run records

Every run, including failed, changed and interrupted ones, appends one line to
`.quickstacks/state/runs.jsonl`:

```ts
const RunRecord = Schema.Struct({
  at: Schema.String, cli: Schema.String,
  agent: Schema.String,                 // detected agent or "none"
  outcome, scope, tamperCheck,
  secondsSinceCreated: Schema.Number,
  steps: Schema.Array(Schema.Struct({ name, status, failureKind: Schema.optional(...), durationMs })),
})
```

No commands, output, paths or env values are recorded, so the file is safe to share in a
bug report and 4.1 can build on it. The first `green` run also writes `firstGreenAt` to
the state record, which is what time to green is computed from. If either write fails,
verify logs one warning and its outcome and exit code are unchanged.

### Settled here

| Question | Answer | Why |
|---|---|---|
| Check-phase failures | Run all checks, report all | Fewer agent loops |
| What counts as green | Full scope, unchanged steps, every non-skipped step passed | A narrowed or edited run can't stand in for the definition of done |
| Probe targets | Local hosts only | Verify checks the project, it doesn't reach the network |
| Output in records | Never | Records must be safe to share and to send later |
| Shell | `sh -c` for `run` steps | Steps are project commands like `make test`; the shell is how users run them too |

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/commands/verify.ts` | Thin handler |
| `packages/cli/src/core/verify/` | `plan.ts` (selection), `run.ts` (phases, scope), `step.ts` (process step), `probe.ts`, `checks.ts`, `tamper.ts`, `record.ts` |
| `packages/cli/src/core/manifest.ts` | Locate by walking up; read |
| `packages/cli/src/core/project-state.ts` | `firstGreenAt` |
| `packages/cli/src/schemas/verify.ts` | `StepResult`, `VerifyResult`, `RunRecord` |
| `packages/cli/src/errors.ts` | `VerifyFailed`, `VerifyChanged` on exit 5, if 0.3 hasn't added them |
| `packages/cli/src/cli.ts` | `verifyCommand` |
| `packages/cli/tests/verify.test.ts`, `tests/verify-tamper.test.ts`, `tests/verify-signals.test.ts` | New |
| `packages/cli/tests/fixtures/projects/` | Hand-written manifests for each case |
| `packages/cli/e2e/` | `verify` on a fixture project against the built artifact |

## Acceptance tests

Real child processes only (`sh -c 'exit 1'`, `node -e`, a tiny HTTP server started by a
`serve` step's command). No module mocks.

1. A manifest with passing setup, check and teardown steps exits 0, outcome `green`, one
   result on stdout, and `runs.jsonl` gains one line with no command text in it.
2. Two failing check steps: both reported, exit 5, `VerifyFailed` envelope last on stderr,
   result on stdout with both `outputTail`s; teardown ran (it touches a marker file).
3. A failing setup step skips check and serve, still runs teardown.
4. A serve step starting `node -e` HTTP server on a free port passes its probe; afterwards
   the port is free again (the group was killed).
5. A serve step whose command exits early fails with its output tail; a probe on a busy
   port fails `failureKind: "env"` without starting the command.
6. A step that leaves a background `sleep 600` behind does not hang verify (finishes in
   under 10 seconds) and the sleep process is gone.
7. A probe URL to a non-local host fails before starting anything.
8. `filled` passes on a real README, fails on one containing `quickstacks:fill`, fails on
   an empty file.
9. Editing one step's `run` in the manifest fails `VerifyChanged` with that step in
   `edited`; editing the step and `verifyDigest` together still fails, against the state
   record; deleting the state record gives `tamperCheck: "manifest-only"`.
10. `--accept-changes` with an agent marker in env, or without a TTY, exits 6 and changes
    nothing.
11. `--only lint` passes with outcome `partial`; `--only nope` exits 2 listing names.
12. `--sandbox` project: the `prod` step is skipped; `--all` runs it.
13. Interrupting via `runCli`'s `signal` during a `sleep` step exits 130, kills the step,
    runs teardown, and records `outcome: "interrupted"`.
14. Running from a subdirectory of the project finds the manifest; running outside any
    project exits 2.
15. First green writes `firstGreenAt`; a later green does not change it.

## Exit criteria

- Tests pass on Linux and macOS in CI; `bun run check` green from the repo root, including
  the e2e verify case against the built artifact.
- `AGENTS.md` documents exit 5, the result-on-failure contract for verify, and
  `.quickstacks/state/`; `packages/cli/README.md` documents `verify` and its flags.
- The roadmap's contracts table matches exit codes and the JSON contract as built.

## What this plan may get wrong

- Process groups and `kill(-pid)` are POSIX. If the 0.3 process service can't offer them
  through `effect/process` on both platforms CI covers, step cleanup needs a platform
  adapter; Windows is out of scope for the MVP and should stay so explicitly.
- Detecting "port in use" by connecting first can race with a server that starts between
  the check and the step. Rare, and the failure is visible.
- Continuing after check failures can produce noisy output when one root cause breaks
  everything (no install). If gate runs show that, stop the check phase after the first
  failing `install`-layer step.
- `--accept-changes` keyed on a TTY assumes agents' shell tools don't allocate one. Some
  agents may; the agent-marker check is the stronger half and should be verified against
  each agent 1.4 supports.
- The 60-line tail may cut the useful part of a long test failure. Measure in 1.6's gate.
