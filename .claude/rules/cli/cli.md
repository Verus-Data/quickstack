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

Every command takes `--json` and writes exactly one result object to stdout, and that object decodes with the command's own Schema in `src/schemas/`. On failure stdout is empty, and the last stderr line is one envelope, `{ error: { tag, message, retryable, details? } }`. The planned exception is a keeps-result tag (phase 0.3a), whose report stays on stdout because a failing verify is what the agent most needs to read.

Exit codes are the branch an agent takes, so each one means a single next action: 2 fix the input, 3 fix the config, 4 retry later, 5 read the verify report (planned in 0.3a), 6 ask the human, 130 the run was stopped. A published exit code never changes meaning. Pick the tag by what the caller should do next, not by where the failure happened.

Messages are fixed per tag so agents can match on them. Context goes in a closed `details` struct holding only values the CLI produced or arguments the caller passed, never file contents, environment values or secrets. Don't interpolate into the message.

No interactive prompts when an agent is detected or stdin is not a TTY. Offer a flag (`--yes`) instead. Anything that needs a human's confirmation refuses with `PermissionDenied` under an agent (roadmap "Trust model", point 4) rather than asking.

Output order is deterministic: sort lists by id, never by filesystem or map iteration order, so two runs diff cleanly. A mistyped command or id gets a did-you-mean from the one shared helper (`core/suggest.ts::closest`, planned in 0.3a), never a local edit-distance function. Help text documents every flag and argument, because the agent reads `--help` cold and has nothing else.

No colors, spinners or cursor movement; respect NO_COLOR and pipes. Progress goes to stderr in human mode only and never changes the exit code. A human-mode failure ends with a `Next:` line saying what to do.

## Error handling

Load `ce:handling-errors` when adding or mapping errors. It defers to this rule where they overlap, and this repo overrides it in four places:

- Typed failures are `Schema.TaggedError` classes in `errors.ts`, carried in Effect's error channel. No try/catch for control flow and no separate Result type.
- "Put what, why and context in the message" becomes "fixed message per tag, context in `details`".
- "Log once at the boundary" is already how `main.ts` works. Don't log a failure where it's raised.
- Defects are logged as their class and stack frames, never their message, because a message can carry user data.

AGENTS.md "Error handling" and `errors.ts::exitCode` / `errors.ts::retryable` are the exit and retry tables; don't restate them. Phase 0.3a replaces both with `errorTable`, adds exit 5, kept results, `Output.progress` and `Output.flushNow`. An agent executing it extends this rule in the same commit, including the exception that once `flushNow` runs, stdout is no longer empty on failure for that invocation.

## Verifying UX

Run the changed command in both human and `--json` modes through `bun run dev` or the compiled `./dist/quickstacks`, on success and on at least one failure. Pipe the JSON through a decoder (`bun run dev <cmd> --json | jq -e .` at minimum, or decode with the command's Schema) and check `$?` before calling it done. Read the human output as an agent would: could you take the next step from it alone?
