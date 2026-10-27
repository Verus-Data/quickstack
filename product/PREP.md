# Demo preparation

Status: DRAFT 2026-10-26 — execution checklist for the proposed demo.

## Objective

Record one clear end-to-end example: reusable stack → coding-agent build → meaningful checks → Rho transaction-review result → requirement change → updated checks and result.

Current repository state is a CLI foundation with doctor and version support. The preparation below describes work to complete and verify; unchecked items are not shipped capabilities.

Read [DEMO_OUTLINE.md](DEMO_OUTLINE.md) for the recording sequence and [PITCH.md](PITCH.md) for narration.

## 1. Freeze the scope

- [ ] Read the current handoff, settled decisions, and problem statement.
- [ ] Confirm the implemented CLI commands and select a supported stack.
- [ ] Keep the CLI's role consistent: prepare context and verification requirements; the user's coding agent does the implementation.
- [ ] Build one transaction-review screen with explanations.
- [ ] Use the initial rule: charges above $500 need review.
- [ ] Use one follow-up: possible duplicates within seven days.
- [ ] Exclude payment creation, money movement, and unrelated product ideas.
- [ ] Verify organizer video limits, deadlines, submission requirements, and dual-track eligibility.

## 2. Establish the Rho integration

- [ ] Confirm access to the sandbox and identify the documented read-only transaction endpoint.
- [ ] Check authentication, pagination, available fields, amount units, currency, timestamps, and transaction statuses.
- [ ] Make one successful request and retain a redacted response for debugging.
- [ ] Configure credentials through the environment; keep them out of the repository and recording.
- [ ] Make missing credentials and upstream failures visible and actionable.
- [ ] Label fixture-backed mode clearly if live access is unavailable.

Rho records and synthetic test fixtures are separate evidence sources. Do not claim fixture behavior establishes a working API integration.

## 3. Prepare the reusable foundation

- [ ] Capture the intended structure, tooling, environment requirements, and definition of done in the stack and brief.
- [ ] Include concrete verification requirements for install, lint, typecheck, tests, and a server probe where applicable.
- [ ] Have the coding agent build from a fresh directory using that context.
- [ ] Record manual interventions and any ambiguity that required developer input.
- [ ] Improve the reusable instructions when a setup mistake exposes missing guidance.
- [ ] Confirm checks test the result and have not been replaced with no-op targets.

Use actual generated filenames and supported CLI syntax in recording notes. Proposed commands in the roadmap are not a tested quickstart.

## 4. Test the application behavior

| Case | Expected result |
| --- | --- |
| Charge of $499.99 | No threshold flag |
| Charge of exactly $500 | No threshold flag under “above $500” |
| Charge of $500.01 | Threshold flag with a factual explanation |
| Two distinct IDs; same merchant, amount, currency; six days apart | Duplicate candidate after the follow-up |
| Same pair more than seven days apart | No duplicate candidate under the seven-day rule |
| Same transaction ID repeated by pagination or ingestion | Deduplicated; not treated as two charges |
| Same merchant and amount, different currencies | Not an exact duplicate candidate |
| Missing required data | Explicit incomplete-data result; no invented values |
| Authentication or API error | Visible error; no fabricated successful results |

- [ ] Define whether exactly seven days is included and add that boundary test.
- [ ] Normalize amount units and timestamp handling against the actual API.
- [ ] Restrict the $500 rule to USD unless conversion behavior is explicitly implemented and tested.
- [ ] Define which transaction statuses count; exclude credits/refunds from a charge rule unless specified otherwise.
- [ ] Preserve the explanation's source transaction IDs so the result is inspectable.
- [ ] Run the follow-up tests before and after the implementation change.

These are deterministic review signals. If an LLM adds explanations or investigation steps, test that it stays grounded in the supplied transaction evidence.

## 5. Verify the run and deployment

- [ ] Run the repository's required checks when implementation changes are made.
- [ ] Run the generated application's actual acceptance checks.
- [ ] Record the exact source revision, selected stack, coding agent, and model.
- [ ] If deployment is in scope, configure its environment and publish the tested application.
- [ ] Open the deployed URL and execute a fresh transaction-review request.
- [ ] Repeat verification and the remote request after the follow-up change.
- [ ] Distinguish sandbox API access, local execution, and remote deployment in all claims.

Documentation-only edits need a content and link review; do not describe that as application test coverage.

## 6. Measure before claiming a speedup

Compare a bare coding-agent setup with stacks using the same task, agent/model, acceptance checks, credentials, and starting conditions.

| Measure | Bare coding agent | With stacks |
| --- | --- | --- |
| Time to first passing acceptance checks | Not measured | Not measured |
| Time to verified remote result, if deployed | Not measured | Not measured |
| Manual interventions | Not measured | Not measured |
| Checks passed / required | Not measured | Not measured |
| Agent/tool cost, if recorded | Not measured | Not measured |

- [ ] Define timing start and stop before running.
- [ ] Count brief-writing and stack-authoring effort separately; do not hide it.
- [ ] Record failed runs and environment/cache differences.
- [ ] Repeat runs before making general claims; identify a single run as a single run.
- [ ] Use baseline time ÷ stacks time for a time speedup only when both reach the same result.
- [ ] Report incomplete runs as incomplete, not as arbitrary speedup estimates.

## 7. Record and package

- [ ] Prepare readable terminal text and a clean application screen.
- [ ] Record the request, brief, real checks, initial result, follow-up, and updated result.
- [ ] Capture a backup take and retain the uncut evidence locally.
- [ ] Mark accelerated build sections and distinguish elapsed time from video length.
- [ ] Keep narration synchronized with what is actually visible.
- [ ] Add captions; prioritize intelligible speech and legible evidence over effects.
- [ ] Check the final Loom permissions from a signed-out session.
- [ ] Verify submission links, repository access, live URL if applicable, and organizer requirements.

## Ready-to-record gate

Proceed when the demonstrated commands work from a fresh start, the test cases pass, the data source is labeled, and every capability in the narration can be shown.

If a capability is unfinished, revise the script to the working scope. Keep intended behavior and observed results distinct.
