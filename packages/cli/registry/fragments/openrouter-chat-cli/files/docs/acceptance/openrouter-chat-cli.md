# CLI chat acceptance

Implement `tests/app-acceptance.test.ts` with the Node Vitest runner. Verify runs
it separately, as well as TUI, PTY, dry-run eval and compiled app suites. Use the
actual provider against owned local HTTP stubs; no live keys or own-module mocks.

## Model picker and terminal behavior

The smoke and compiled PTY flow must open the picker, type a search, observe the
filtered set, select a model different from the default and send a message. Assert
the selected model in the actual stub request and rendered reply metadata. Clear
the search to restore the list; cover no matches and discovery failure/default.
Opening and closing the picker alone is insufficient. Assert focus restoration,
Stop preserving a partial reply, tool pending/done/failed states, Ctrl+C exit 0,
alternate-screen restoration, and no remaining owned process. Use the real test
renderer for UI states and a PTY for keyboard/native lifecycle behavior.

## Evals and paid-tool isolation

Follow [report v1](../eval-report.md) for the exact camelCase fields, null
propagation, per-model aggregates and `--dry-run --models <csv> --report <path>`
protocol in `scripts/eval.ts`. The shared `bun scripts/check-eval-dry-run.ts`
checkpoint independently checks the saved report for two local models. Add
`.eval/` to `.gitignore`; preserve the checker and test the app's real runner and
scorers separately. Verify checks report consistency, not model quality.

Keep `eval` and `record:openrouter` scripts present. Both refuse a missing key
before any provider request; tests count requests to a local stub to prove it.
`eval --dry-run` is the explicit exception: it starts its own local stub and never
uses an inherited key/base URL. Exercise the same runner, scorers and report
writer as live eval, and validate report content before returning success.

Each case records requested model, case id, pass/fail/error/truncated verdict,
finish reason, latency, input/output tokens, cost, actual served model and provider
(explicit null when unavailable, never guessed). Aggregate per-model verdict
counts, tokens/cost totals and median latency. Persist timestamped JSON files in
an ignored results directory and print their paths. Test file naming and decoded
values, not only process exit. All configured cases must appear exactly once;
missing fields, empty cases, failures/errors and no passes must fail the run.

Unit-test pure scoring for pass/fail/error/truncated cases independently of the
runner. A never-finishing stub must hit a per-case deadline, abort its request,
record an error and exit nonzero; the next case/model must not inherit state.
Compare totals and median against deterministic fixtures, including multiple
models and even-sized latency samples. Canned responses test plumbing, not model
quality. Never fabricate paid-provider recordings; absent real fixtures remain
an explicit replay skip and Pending user actions item, while stub acceptance runs.

Also retain exact schema-wire assertions, retry-before-output only, safe upstream
401/402/404/429/5xx mapping, bounded timeout/cancellation, persistence/export, and
MCP EOF with an in-flight response. Terminal/platform and real-provider
compatibility conclusions remain limited to the environments actually exercised.
