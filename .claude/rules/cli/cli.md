---
paths:
  - "packages/cli/src/**"
  # Phase files specify command behavior, exit codes and envelopes, so the UX
  # contract has to be in context when one is written or executed, not only
  # when the code is edited afterwards.
  - "plans/phases/**"
---

# CLI UX contract

## Who the user is

The CLI's first-class user is a coding agent (PROBLEM_STATEMENT, "Who has it": the CLI's main reader). It runs `list --json`, picks a stack, runs `new`, reads the brief, and loops on `verify` until it's green. A human at a terminal is the fallback. Design every command for the agent first, then make human mode a readable rendering of the same result. The two modes never behave differently; only the rendering changes.

## What good agent-facing UX means here

Every command takes `--json` and writes exactly one result object to stdout, and that object decodes with the command's own Schema in `src/schemas/`. On failure stdout is empty, and the last stderr line is one envelope, `{ error: { tag, message, retryable, details? } }`. Two exceptions: a keeps-result tag (`errorTable` row with `keepsResult: true`: `VerifyFailed`, `VerifyChanged`, `ValidationFailed`) flushes its report to stdout before the envelope, because a failing verify or validate report is what the agent most needs to read; and once `Output.flushNow` has run, what it flushed stays on stdout even if the command later fails. A keeps-result command writes its report before failing; `main` never invents one.

Exit codes are the branch an agent takes, so each one means a single next action: 2 fix the input, 3 fix the config, 4 retry later, 5 read the verify report on stdout, 6 ask the human, 130 the run was stopped. A published exit code never changes meaning. Pick the tag by what the caller should do next, not by where the failure happened.

Messages are fixed per tag so agents can match on them. Context goes in a closed `details` struct holding only values the CLI produced or arguments the caller passed, never file contents, environment values or secrets. Don't interpolate into the message. Declare it as `details: Schema.optionalKey(<Struct>)` on the tag's TaggedError fields and add the tag's case to `errors.ts::encodeDetails` and `errors.ts::detailLines` (both list every tag, so a new tag forces the choice). Construction drops keys the schema doesn't name; `Output.error` encodes closed, so only a details object mutated after construction becomes a Defect. Human mode shows the lines `detailLines` picks.

No interactive prompts when an agent is detected or stdin is not a TTY. Offer a flag (`--yes`) instead. Anything that needs a human's confirmation refuses with `PermissionDenied` under an agent (roadmap "Trust model", point 4) rather than asking.

Output order is deterministic: sort lists by id, never by filesystem or map iteration order, so two runs diff cleanly. A mistyped command or id gets a did-you-mean from the one shared helper, `core/suggest.ts::closest` (up to three names within edit distance 2, transpositions count once, ties alphabetical ignoring case). Never write a local edit-distance function. `main` maps an unknown subcommand to `Usage` with `details: { command, suggestions }`, and human mode prints `Did you mean: doctor?` under the message. effect/cli computes its own `UnknownSubcommand.suggestions` (plain Levenshtein, case-sensitive); `main` discards them in favor of `closest`. Help text documents every flag and argument, because the agent reads `--help` cold and has nothing else.

Commands run processes only through `services/processes.ts::Processes`: `run` and `start` for shell steps (own process group, stdin closed, bounded tail), `exec` for a program on user-supplied values (argv, never a shell), `interactive` to hand the terminal to an agent (call `Output.flushNow` first), and `which` as the only PATH search. Build a child's environment with `AppConfig.childEnv`. Node process APIs (`process.kill`/`on`/`exit`, `node:child_process`, `@effect/platform-node`) belong only in `bin.ts` and `src/platform/`; the Grit boundary rule enforces it. A signal stops a command with exit 130 after cleanup; while an interactive child runs, Ctrl+C is the child's (AGENTS.md "Error handling" has the policy).

No colors, spinners or cursor movement; respect NO_COLOR and pipes. Progress goes through `Output.progress`: stderr, human mode only, unbuffered, never fails or changes the exit code (it stops writing after the first failed write). `Output.flushNow` is for handing the terminal to a child (1.4): human mode writes buffered results now; JSON mode still writes its one result at the end. A human-mode failure ends with a `Next:` line saying what to do.

## Error handling

Load `ce:handling-errors` when adding or mapping errors. It defers to this rule where they overlap, and this repo overrides it in four places:

- Typed failures are `Schema.TaggedError` classes in `errors.ts`, carried in Effect's error channel. No try/catch for control flow and no separate Result type.
- "Put what, why and context in the message" becomes "fixed message per tag, context in `details`".
- "Log once at the boundary" is already how `main.ts` works. Don't log a failure where it's raised.
- Defects are logged as their class and stack frames, never their message, because a message can carry user data.

AGENTS.md "Error handling" and `errors.ts::errorTable` are the exit, retry and kept-result tables; don't restate them. A new tag adds its class to `errorClasses`, its row to `errorTable` and its line to the roadmap's Error tags table. A closed stdout (`BrokenPipe`) is quiet and exits 0, except after a keeps-result tag, which keeps its exit so a failed verify piped into `head` never reads as a pass.

## Verifying UX

Run the changed command in both human and `--json` modes through `bun run dev` or the compiled `./dist/quickstacks`, on success and on at least one failure. Pipe the JSON through a decoder (`bun run dev <cmd> --json | jq -e .` at minimum, or decode with the command's Schema) and check `$?` before calling it done. Read the human output as an agent would: could you take the next step from it alone?
