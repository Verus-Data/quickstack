---
paths:
  - "packages/cli/src/**"
  - "packages/cli/tests/**"
  - "packages/cli/scripts/**"
  - "packages/cli/e2e/**"
---

# Verification

## A clean exit is not a pass

A run that did nothing and a run that succeeded both exit 0. After `bun run check`, read the output: confirm the Vitest file and test counts are what you expect for the change (a new test file shows up in the count) and that the e2e section actually compiled the binary and ran its tests. When work is done by a subprocess, check what the subprocess printed, not the wrapper's status.

## Revert-verify every new regression test

A test that passes with and without the fix isn't testing the fix. Reintroduce the bug by hand by editing the source, run the scoped test (`bun run test:unit tests/<file>.test.ts` in `packages/cli/`), confirm it fails with the message you expect, then edit the fix back. Edit rather than use git, so nothing is discarded and the destructive-command hook stays out of it. If the revert doesn't go red, fix the test before moving on.

## A green commit is not a complete commit

Lefthook's pre-commit formats and restages safe fixes, which can leave part of the change in the working tree while the commit itself passes. Right after any hook-running commit, run `git status --porcelain`. Non-empty output means something didn't land; stage it and amend.

## Run the real command

For any CLI change, run the changed command in human and `--json` modes as `rules/cli/cli.md` "Verifying UX" describes. Tests through `runCli` don't cover the compiled binary's startup or the dev wrapper.

When something fails, read the logs AGENTS.md "Debugging" names before guessing.
