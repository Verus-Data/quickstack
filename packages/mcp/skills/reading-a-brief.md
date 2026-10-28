---
name: reading-a-brief
description: How to read and carry out a .quickstacks/BRIEF.md after quickstacks new
---

# Reading a brief

After `quickstacks new <stack> <dir>`, the CLI writes `.quickstacks/BRIEF.md`
into the project. That brief is the task: carry it out until `quickstacks
verify` exits 0 with outcome green.

## Structure

The brief names the stack, fragments, preset, target agents, and the files
quickstacks wrote. Then comes **Your job**: a one-paragraph task statement.
**Versions** says nothing is pinned — let the package manager resolve. **Ground
rules** cover generators, git, and keeping `AGENTS.md` true. **Decisions**
lists what to ask the user once. **Dependencies and tools** names packages by
role, not version. The **Stack** section describes the architecture, layout,
and setup. **Definition of done** is the verify table.

## Working the brief

1. Read it end to end before writing code.
2. Ask the user about the **Decisions** in one message, giving each default.
3. Install, build, and run the dev commands yourself; fix their warnings.
4. Run `quickstacks verify` from the project root in a loop. Read the step
   name and output tail it reports, fix the code, run again.
5. If verify reports `VerifyChanged`, stop — only the user can accept that.
6. Keep `.quickstacks/NOTES.md` under **Findings** for anything ambiguous.

## What not to do

- Don't edit `.quickstacks/manifest.json`.
- Don't weaken verify steps or skip tests to get green.
- Don't pin versions from memory; check installed types and docs.
- Don't run a generator into the populated project root.