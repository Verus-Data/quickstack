---
schema_version: 1
id: rr
kind: fragment
category: tooling
name: rr remote test runner
description: Configures rr (github.com/rileyhilliard/rr) so the project's test, lint, and build commands can run on remote machines over SSH, with a committed .rr.yaml of named tasks, an AGENTS.md section, and the rr Claude Code plugin.
tags: [testing, remote, ssh]
applies_to: []
requires_tools: [rr]
tools: [rr]
merge: [.claude/settings.json]
decisions:
  - "Which rr hosts the project should use (default: every host in the user's ~/.rr/config.yaml, by leaving hosts out of .rr.yaml). If the user has no hosts configured, write .rr.yaml anyway and record host setup under Pending user actions."
  - "Fall back to running locally when no host is reachable (default: no; a run that can't reach a host fails loudly rather than quietly using the laptop)."
verify:
  - name: rr-config
    layer: check
    run: rr tasks
---

# rr remote runner

rr runs the project's existing commands on SSH hosts; every command must also work locally, and `stacks verify` runs locally. Write the committed `.rr.yaml`; leave personal `~/.rr/config.yaml` to the user.

## What to add

Run `rr init --help` and read the installed rr skill or docs for the current `.rr.yaml` schema. Add tasks wrapping local test and lint commands, per-area tasks and a parallel task for monorepos. Single-command tasks take scoped arguments after `--`; use `{args}` for commands containing pipes or `&&`. Avoid built-in task names (`run`, `exec`, `sync`). List remote toolchains and package managers in `require:` and install locked dependencies on each host. Check a Node host against `.node-version`; report a mismatch and ask for an update. Omit `hosts:` unless the user requests specific hosts. Add custom `sync.exclude` only if needed; it replaces defaults, so repeat exclusions for `.git`, `.venv`, `node_modules`, caches and agent directories.

If hosts are configured, run `rr doctor` and a real task end to end; `rr provision` can install missing host tools. Otherwise list host setup (`rr host add`, then `rr doctor`) under Pending user actions in AGENTS.md. Do not invent hosts.

The Claude adapter enables the rr plugin and allows read-only rr commands. Keep remote execution prompting unless the user requests allow rules for project tasks. Its shipped rule points at the rr skill.

## AGENTS.md

After Testing, document the `.rr.yaml` tasks in a table with local equivalents, scoped use (`rr test -- <path or filter>`), full-suite use, and the final stderr result's `details.failures`, `details.no_tests` (zero tests is not a pass) and `details.log_file`. Include `rr doctor` and `rr unlock <host>` for diagnosis. Add rr to Commands as an optional way to run the same tests.

## Verify

`rr-config` runs `rr tasks` locally to validate `.rr.yaml`; no verify step needs a reachable host.
