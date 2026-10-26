# Run notes

Status: DRAFT 2026-10-26. Holds one note per recorded run; empty until the MVP gate
(1.6b). The gate runs are also the first evidence for the D5 brief budget, which is a
hypothesis until they record brief size next to time to green.

Each gate or bench run gets a file named `<date>-<stack>.md` (add `-<n>` for a second run
the same day). The ledger (`packages/cli/registry/runs.json`, from
[2.0c](../phases/phase-2.0c-run-ledger.md)) is the machine-readable copy;
these notes are what a person reads.

Every note records the fields below; 2.0c's ledger import skips a note that lacks a required one:

| Field | What |
|---|---|
| Stack and fragments | The composition, with preset |
| Repo commit | The quickstacks commit the CLI and registry were built from, so 2.0c can recompute the fingerprint |
| CLI | How it was run: the packed tarball's file digest, or `npx quickstacks@<version>` |
| Agent | Agent and version, interactive or headless |
| Brief size | `briefWords` and `fixedWords` from `new --json` |
| Times | `new` to first passing `test`-layer step, `new` to first green `verify` (from the state record) |
| Verify count | Number of `verify` runs in `runs.jsonl` |
| Interventions | Lines under `## Asked` in `.quickstacks/NOTES.md`, and anything the maintainer typed |
| Outcome | `green`, `partial`, `failed`, `infra`, with `tamperCheck` |
| Findings | The `## Findings` lines worth acting on, each with the fix it led to |
| Final verify record (optional) | The last line of `.quickstacks/state/runs.jsonl`, pasted as JSON; 2.0c's import fills `run` from it |
| Agent minutes (optional) | Wall-clock minutes the agent ran; 2.0c's import fills `agentMinutes` from it |
