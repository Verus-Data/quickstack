# Gate run: sample, 2026-10-27

Synthetic gate run for the ledger import tests.

| Field | Value |
|---|---|
| Stack and fragments | `sample`, no added fragments, preset `sandbox` |
| Repo commit | `{{COMMIT}}` |
| CLI | `quickstacks@0.1.0`, compiled dev binary from `bun run build` at that commit |
| Agent | Claude Code 2.1.311, headless (`claude -p`) |
| Brief size | `briefWords` 123, `fixedWords` 45 |
| Times | first passing `test`-layer step 1.5 min, first green `verify` 2.5 min |
| Verify count | 2: the agent's own run, then the independent one |
| Interventions | None. `## Asked` is empty and nothing was typed after the prompt |
| Outcome | `green`, `tamperCheck: "full"` (independent `verify --json` exit 0) |
| Agent minutes | 2 |

## Findings

- No findings requiring a change.

## Run record

Final verify record:

```json
{"schemaVersion":1,"at":"2026-10-27T09:02:30.000Z","cli":"0.1.0","agent":"none","outcome":"green","scope":"full","tamperCheck":"full","acceptedChanges":false,"durationMs":20,"secondsSinceCreated":150,"steps":[{"name":"test","phase":"check","layer":"test","status":"passed","exitCode":0,"durationMs":20}]}
```
