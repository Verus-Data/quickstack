---
name: quickstack
description: Start a new project from a stack or add fragments to an existing repo, then drive it to a verified working state. Use for project setup, tests, lint, CI and agent configuration, or when the user mentions quickstack.
---

# quickstack

## When to use it

Use quickstack for a new project from nothing, or when the user asks for a project set up properly. For an existing repo, use `<cli> add <fragment...> --json` to apply fragments without restructuring it. Use `list --json` to choose fragments; inside a quickstack project, `project.addable` lists those that fit.

A stack is a recipe: dependencies by role, starter files, agent guidance and a definition of done. A fragment is one capability a stack can include, such as CI or a database. The CLI writes the brief; you build the project with current versions.

## How to run it

Use `stacks` if it is on PATH, otherwise `npx -y @steamfield/stacks@latest`. Below, `<cli>` means that command. After `new`, use exactly the command the brief gives for verify: it is the same version that wrote the project. `<cli> <command> --help` lists a command's flags, exit codes and examples.

With `--json`, a command writes one result to stdout. On failure the last stderr line is `{ "error": { "tag", "message", "retryable", "next", "details" } }`: branch on the exit code (2 fix the input, 3 fix the config, 5 read the verify report on stdout, 6 ask the user) and do what `next` (in text output, the `Next:` line) says. `<cli> schema <name>` prints the JSON Schema of a `--json` result.

## Pick a stack

Run `<cli> list --json`. Pick the stack whose description and tags match the request, and read a candidate with `<cli> show <id> --json` when the description isn't enough. Tell the user which stack and why in one sentence, and name a close second when there is one. Never pick an untrusted entry (`trusted: false`) unless the user named it; if they did, confirm with them before continuing. If nothing fits, say so instead of forcing a match.

## Start it

Run `<cli> new <stack> <dir> --json`; use `<cli> new <stack> <dir> --sandbox --json` when the user wants the fastest path to something running locally. Add `--dry-run` to preview the files and brief size without writing anything.

After `add`, read the same brief, merge the contributions parked in `.quickstack/incoming/` while keeping the project's choices, then delete incoming files once merged. Verify checks the whole manifest.

Read `.quickstack/BRIEF.md`. The brief is the whole task: follow it in order, and ask the user only what it tells you to ask. Use current docs and official generators rather than remembered flags or config formats.

## Loop to green

Run `<cli> verify` from the project root with your shell tool's longest timeout. Read the failing step's name, command and output tail; fix the code or config it exercises, never the step, and run it again. Done is exit 0 with outcome `green`.
## Never weaken verify

Don't edit `.quickstack/manifest.json`. Never edit the steps or weaken the definition of done: don't make commands pass without doing their job, skip tests, lower lint settings until they report nothing, or serve a stub instead of the app.

If verify fails with `VerifyChanged`, stop. Don't edit the steps back and forth, and don't run `<cli> verify --accept-changes` yourself: it refuses agents. Tell the user which steps or settings changed and that only they can accept the changes from their own terminal, or undo them. Then wait.

## Finish

Follow the brief's after-green list, including manual QA and checking the project documentation. Then summarize for the user: the stack and why, the decisions taken with their defaults, anything left undone, and where the brief's problems were noted (`.quickstack/NOTES.md`).
