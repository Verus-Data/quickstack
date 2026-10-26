# Phase 0.3: Command runtime

Status: DRAFT 2026-10-26 (not agreed). Answers A2, A3 and A4; the maintainers review the
answers before 1.3 and 1.4 build on them.

| Field | Value |
|---|---|
| Goal | The base can run a command that takes minutes, reports progress as it goes, fails with a report and structured details, spawns and cleans up child processes, and hands the terminal to an interactive program without fighting it for signals |
| Traces to | The agent's frustration is "a verify command that doesn't exist" and ambiguity; `verify` "failing is the normal case for an agent loop". Problem statement: the agent "loops on `verify`" and the CLI hands off "to the agent the user already has" |
| Depends on | 0.1 |
| Blocks | 1.0 (error details for registry errors), 1.3 (`verify`), 1.4 (handoff) |
| Decisions needed | none from the product list. The maintainers review A2-A4 as answered here |
| Settles | A2 (streaming output), A3 (signals during handoff), A4 (structured errors); exit code 5 |

## Scope

In:

- A4: optional, closed `details` on tagged errors, one table for exit code and
  retryability, and failures that keep their command's result.
- A2: live progress lines on stderr in human mode.
- A process service: run a shell command in its own process group with a captured output
  tail and a timeout, start a long-running one that is killed with its group when its
  scope closes, run an interactive program in the foreground, and find an executable on
  `PATH`.
- A3: a signal policy that knows whether an interactive child holds the terminal, and a
  second Ctrl+C that forces exit while cleanup runs.

Out: any product command. `verify` (1.3) and handoff (1.4) are the first users. No
NDJSON event stream (A2 option a was rejected; see below).

## Design

### A4: structured errors

Today each class in `errors.ts` has no fields, and `errors.ts::exitCode`,
`errors.ts::retryable` and `errors.ts::knownError` are three switches that must agree.
They become one table:

```ts
type ErrorSpec = { exit: number; retryable: boolean; keepsResult: boolean };
export const errorTable = {
  Usage: { exit: 2, retryable: false, keepsResult: false },
  BadInput: { exit: 2, retryable: false, keepsResult: false },
  NotFound: { exit: 2, retryable: false, keepsResult: false },
  NotConfigured: { exit: 3, retryable: false, keepsResult: false },
  InvalidConfig: { exit: 3, retryable: false, keepsResult: false },
  UpstreamUnavailable: { exit: 4, retryable: true, keepsResult: false },
  VerifyFailed: { exit: 5, retryable: false, keepsResult: true },
  VerifyChanged: { exit: 5, retryable: false, keepsResult: true },
  PermissionDenied: { exit: 6, retryable: false, keepsResult: false },
  Interrupted: { exit: 130, retryable: false, keepsResult: false },
  Defect: { exit: 1, retryable: false, keepsResult: false },
  BrokenPipe: { exit: 0, retryable: false, keepsResult: false },
} as const satisfies Record<AppError["_tag"], ErrorSpec>;
```

`exitCode` and `retryable` read the table, so adding a tag without a row is a type error.
`knownError` checks membership through a list derived from the same classes.

A tag may declare a `details` schema. The JSON envelope becomes:

```ts
{ error: { tag: string; message: string; retryable: boolean; details?: Record<string, unknown> } }
```

Rules for `details`:

| Rule | Why |
|---|---|
| Each tag's details are a closed `Schema.Struct` (excess properties rejected when encoding) | Agents can rely on the shape; nothing leaks by accident |
| Details hold only values the CLI produced or the caller passed in as an argument: step names, exit codes, entry ids, flag names | The base promises fixed, safe messages and no secrets in output |
| `message` stays fixed per tag; details never interpolate into it | Messages stay stable for agents that match on them |
| Details go into the envelope only, never into a log record | Logs never serialize argument values (base rule) |

Human mode prints the message, then one indented line per detail field that the tag's
renderer chooses to show (for `VerifyFailed`, the failed step names).

`VerifyFailed` and `VerifyChanged` are added to the table now so exit 5 is reserved and
tested here; their detail schemas are defined in [1.3](phase-1.3.md). Until then they
exist with empty details, used only in tests.

### Failures that keep their result

`main.ts::main` clears the output buffer on every error. For a tag with
`keepsResult: true`, it doesn't: it flushes buffered results to stdout first, then
writes the error envelope as the last stderr line. Verify's report is the thing an
agent needs most when verify fails, and the envelope still says "this failed", so both
halves of the JSON contract hold:

- stdout carries one result (the report) whether verify passed or failed.
- On any failure, the last stderr line is the envelope.
- For every other tag, stdout stays empty on failure, as today.

### A2: progress

`services/output.ts::Output` gains:

```ts
progress: (text: string) => Effect.Effect<void>
```

In human mode it writes `text` plus a newline to stderr immediately (not buffered), and
swallows write errors after the first `BrokenPipe` so a closed terminal can't fail the
command. In `--json` mode it does nothing, because the JSON contract reserves stderr for
the envelope and JSON-mode logs go only to the configured file.

Options considered:

| Option | For | Against | Choice |
|---|---|---|---|
| NDJSON events on stdout under `--json` | Agents could watch steps live | Breaks "JSON commands produce one result"; every consumer must parse a stream and find the last line; agents' shell tools return whole output anyway | No |
| One result at the end; live progress on stderr in human mode | Keeps the contract; humans see progress; agents get one object | Agents in `--json` mode see nothing until the end | Yes |

An agent that wants progress can run without `--json`; the brief (1.1) tells it to use
`--json` for the final check only. Logs stay buffered as today.

### The process service

A new `Processes` service in `src/services/processes.ts`, `Context.Service` named
`quickstacks/Processes`, with a live layer built on Effect's `effect/process` module
(confirm the installed exports; if it can't create process groups, the live layer lives
in `src/platform/process.ts` on `node:child_process` and the boundary rules gain no
exception, since that rule restricts Bun, not Node).

```ts
type ShellSpec = {
  command: string;              // run through /bin/sh -c
  cwd: string;
  env: Record<string, string>;  // the full environment; nothing inherited implicitly
  timeout?: Duration.Duration;
};
type Finished = {
  exitCode: number;             // 128 + n when killed by signal n
  signal?: string;
  durationMs: number;
  tail: string;                 // last 60 lines of combined stdout and stderr
  timedOut: boolean;
};
interface Processes {
  run(spec: ShellSpec, onOutput?: (chunk: string) => Effect.Effect<void>):
    Effect.Effect<Finished, SpawnFailed>;
  start(spec: ShellSpec): Effect.Effect<Running, SpawnFailed, Scope.Scope>;
  interactive(spec: { bin: string; args: string[]; cwd: string; env: Record<string, string> }):
    Effect.Effect<number, SpawnFailed>;
  which(name: string): Effect.Effect<Option.Option<string>>;
}
interface Running {
  readonly exited: Effect.Effect<Finished>;
  readonly tail: Effect.Effect<string>;
}
```

Behavior that `verify` depends on:

- Every `run` and `start` child is the leader of a new process group. On interruption,
  timeout or scope close, the service sends SIGTERM to the group, waits 5 seconds, then
  SIGKILL, and only then completes. No child outlives the command.
- Output is captured into a bounded buffer (256 KB kept, last 60 lines reported) so a
  chatty dev server can't exhaust memory.
- `env` is passed whole. `config.ts` builds it (it is the only reader of the process
  environment), so tests control exactly what a child sees.
- `which` searches the `PATH` that `config.ts` captured, checking the executable bit
  through `FileSystem`. No shell.
- `SpawnFailed` (a new internal error, mapped to `Defect` unless the caller handles it)
  carries the command's first word, so verify can report "command not found" as an
  environment failure rather than a step failure.

`interactive` runs the program with inherited stdio and resolves with its exit status.
It registers the child with the foreground policy below for as long as it runs.

### A3: the signal policy

`bin.ts` today aborts the whole program on SIGINT or SIGTERM. It gains a small
`Foreground` holder, provided as a layer so `Processes.interactive` can register a
child:

| Signal | No interactive child | Interactive child in the foreground |
|---|---|---|
| SIGINT (first) | Interrupt the program; finalizers run (teardown, killing process groups); exit 130 | Ignored here. The terminal already delivered it to the child's process group; the child decides |
| SIGINT (second, during cleanup) | Exit 130 immediately | Ignored |
| SIGQUIT | Default | Ignored |
| SIGTERM | Interrupt, as SIGINT | Forwarded to the child; quickstacks waits for it to exit |
| SIGHUP | Interrupt, as SIGINT | Forwarded to the child |

Before an interactive child starts, the caller must flush buffered output so the user
sees quickstacks's last lines before the agent takes the screen. `Output` gains a
`flushNow` that writes and empties the result buffer; `main` then has nothing left to
flush at the end. What exit status a command reports after an interactive child is the
command's decision (1.4 decides it for handoff).

Why not `exec`: Node has no `exec(3)`. Spawning and waiting is the only option, so the
policy above is what keeps Ctrl+C belonging to the agent.

### Failure modes

| Situation | Tag | Exit | What the caller sees |
|---|---|---|---|
| A step's command isn't installed | Caller decides (verify: step failure, kind `env`) | 5 from verify | `Finished.exitCode` 127 with `SpawnFailed` distinguished |
| A child ignores SIGTERM | none | as interrupted | Killed after 5 s with SIGKILL |
| stderr closed while printing progress | none | unchanged | Progress stops; the command continues |
| A `keepsResult` failure with stdout closed | `BrokenPipe` | 0 | Quiet, as today |

## Files and areas touched

`packages/cli/src/errors.ts`, `src/main.ts`, `src/services/output.ts`, new
`src/services/processes.ts` (and `src/platform/process.ts` if needed), `src/bin.ts`,
`src/config.ts` (captured `PATH`, environment builder for children), `src/runtime.ts`
(`AppLayer` adds `Processes`), `tests/helpers/cli.ts` (a `Processes` layer that runs
real processes), `tests/errors.test.ts`, new `tests/processes.test.ts`,
`tests/runtime.test.ts`, `.claude/rules/cli/cli.md` (the updated output contract),
`AGENTS.md` (Error handling section).

## Acceptance tests

- Errors: a program injected through `main(args, program)` failing with each tag exits
  with the table's code; the envelope includes `details` only for tags that declare it;
  encoding details with an extra property fails the test.
- Keeps result: a program that writes a result then fails with `VerifyFailed` leaves
  the result on stdout and the envelope as the last stderr line, in `--json` and human
  mode; with `BadInput` instead, stdout is empty.
- Progress: in human mode, a progress line is on stderr before the program finishes
  (assert with a program that writes progress, then blocks on a `Deferred` the test
  completes after reading stderr); in `--json` mode stderr contains only the envelope.
- Processes: `run` of `sh -c 'exit 3'` returns 3; a command printing 10,000 lines
  returns the last 60; a timeout kills a `sleep 60` and reports `timedOut`; a `start`ed
  process that spawns a grandchild leaves neither running after its scope closes
  (checked by pid); `which` finds an executable in a temp `PATH` and ignores a
  non-executable file of the same name.
- Signals (subprocess tests in the style of `tests/dev-script.test.ts`): a fixture
  program under the real platform layer runs `interactive` on a Node child that traps
  SIGINT and writes a marker file; sending SIGINT to the process group leaves the
  parent running and the child handles it; SIGTERM to the parent reaches the child.
  Without a foreground child, SIGINT during a `start`ed process exits 130 with the group
  killed; a second SIGINT during a slow finalizer exits at once.

## Exit criteria

- `bun run check` green from the repo root, on Linux and macOS in CI.
- `AGENTS.md` Error handling section describes exit 5, `details`, and results kept on
  `VerifyFailed` and `VerifyChanged`.
- `.claude/rules/cli/cli.md` describes `Output.progress` and `flushNow`.
- A2-A4 recorded as answered in the README decisions log once the maintainers agree.

## What this plan may get wrong

- `effect/process` may not expose detached process groups or signal forwarding. Check
  the installed types first; the fallback is the platform adapter described above.
- Ignoring SIGINT while an interactive child runs assumes the terminal sends it to the
  whole foreground process group, which is true when quickstacks was started from a
  shell. When an agent or a script sends SIGINT to quickstacks's pid only, the child
  never sees it. The policy may need to forward SIGINT when the signal didn't come from
  the terminal, which Node can't tell apart; test the agent-launched case explicitly.
- Keeping results on failure changes a contract the base documents and tests. Update
  every test that asserts "stdout empty on failure" to name the tags it covers, rather
  than weakening it.
