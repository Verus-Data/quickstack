---
schema_version: 1
id: ci-github
kind: fragment
needs_own_repo: true
category: ci
name: GitHub Actions CI
description: A GitHub Actions workflow that runs the project's own package scripts on every push and pull request, with SHA-pinned actions and least-privilege permissions.
tags: [ci, github]
applies_to: []
tools: [git]
decisions:
  - "Runners: ubuntu-latest (default) or self-hosted labels."
  - "Required check: one aggregate ci-ok job (default)."
  - "CI runs the coverage target instead of plain tests (default: yes)."
---

# GitHub Actions CI

Write `.github/workflows/ci.yml`. Check each action's latest major tag before writing the workflow; versions written from memory run two majors behind.

## What to add

- **Triggers**: `push` to the default branch, `pull_request`, `workflow_dispatch`; never `pull_request_target`. **Permissions**: top-level `contents: read`, more only at job level.
- **Jobs call the project's package scripts**, never re-implemented inline; a CI-only check gets a script first. Official setup actions, versions read from the project, frozen-lockfile installs.
- **Generated-code drift**: if generated code is committed, regenerate and fail on `git diff --exit-code`.
<!-- quickstacks:when preset=default -->
- **Concurrency**: group per workflow and ref, `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` (cancelling on the default branch can let an untested commit reach deploy).
- **Pin actions by full commit SHA** with the tag in a comment, resolved with `git ls-remote --tags https://github.com/<owner>/<repo>` (dereference annotated tags). Never invent one; if you can't resolve it, list it under Pending user actions. `timeout-minutes` on every job.
<!-- quickstacks:end -->
<!-- quickstacks:when preset=sandbox -->

Sandbox: keep the workflow minimal, with `timeout-minutes` per job. Major-tag action refs are fine; list SHA pinning under Deferred.
<!-- quickstacks:end -->

Use one sequential job named ci-ok for this project, unless the stack's CI notes split the work into jobs; then a final `ci-ok` job (`needs:` all, `if: always()`) is the required check.
<!-- quickstacks:when tag=scripts -->
Call the project's package scripts: frozen install, lint, typecheck, coverage or test, and its remaining check/build steps. Use the declared commands instead of copying runner details into CI.
<!-- quickstacks:end -->
<!-- quickstacks:when tag=bun -->
Use Bun's setup action with the packageManager version from package.json.
<!-- quickstacks:end -->
<!-- quickstacks:when tag=node -->
Set up Node from .node-version where present, or the project's documented runtime version.
<!-- quickstacks:end -->

Before finishing, run `actionlint` if installed and make sure every command the workflow calls passes locally.

## AGENTS.md

A short **CI** section: workflow path, what each job runs, the required check, and how to bump pinned actions.
