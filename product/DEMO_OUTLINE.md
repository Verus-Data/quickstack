# Demo outline

Status: DRAFT 2026-10-26 — proposed three-minute Loom; record only after the demonstrated workflow works.

## Story

**quickstacks is the product. A Rho transaction-monitoring agent makes its value visible.**

Show the cost of repeated setup, the reusable build context, verification, and a useful application result. Keep the terminal readable and the application simple enough to understand immediately.

Companion files: [pitch](PITCH.md), [preparation](PREP.md), [problem statement](PROBLEM_STATEMENT.md).

## Example request

> Build a Rho transaction-monitoring agent that flags charges above $500 for review and explains each flag. Use read-only sandbox transactions.

Follow-up:

> Also detect potential duplicate charges within seven days and explain each flag. Update the tests.

For this demo, duplicate candidates have the same merchant, amount, and currency within a rolling seven-day period. Exclude repeated copies of the same transaction ID. Define timestamp boundaries and transaction statuses before implementation.

The $500 threshold is a review rule, not a finding of fraud. Read-only means the demonstration does not create payments or move money.

## Three-minute recording

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00–0:15 | Empty project next to a short setup checklist | “Every new agent idea starts with the same setup work: dependencies, tests, lint, and explaining your standards again.” |
| 0:15–0:30 | Rho example request | “Let's build a transaction-review agent. The useful part is spotting charges worth reviewing. First, it needs a reliable foundation.” |
| 0:30–0:55 | Actual quickstacks invocation, selected stack, generated brief | “quickstacks turns a reusable stack into instructions and acceptance checks for the coding agent I already use.” |
| 0:55–1:20 | Coding agent reads brief; show concrete setup decisions and resulting files | “The stack preserves the decisions I want repeated. The agent handles current dependencies and configuration.” |
| 1:20–1:40 | Real verification output and a representative test | “Starting the server isn't enough. Here are the checks that define working, and the result of running them.” |
| 1:40–2:05 | Application displays sandbox transactions and a flagged charge | “This charge exceeds our review threshold. The agent explains the flag using the transaction's actual fields.” |
| 2:05–2:30 | Follow-up request, changed logic, and updated tests | “Now add possible duplicates within seven days. We change the behavior and test the new requirement.” |
| 2:30–2:45 | Updated application result; deployed URL if available | “The updated result is working here. The same foundation supports the next iteration.” |
| 2:45–3:00 | Brief, checks, and result together | “Write your setup once. Give your agent a clear target. Spend the next project building the product.” |

Trim to the event's verified video limit before recording. Three minutes is a production target, not a confirmed submission rule.

## The visual payoff

Show a successful check followed by the corresponding application behavior. Then add the duplicate rule, rerun meaningful checks, and show the new result.

Use a small deterministic test fixture for boundary cases. For example, two distinct transaction IDs with the same merchant, amount, and currency six days apart should become a duplicate candidate. Label synthetic records as fixtures; do not describe them as transactions retrieved from Rho.

If recording uses real sandbox responses, choose the visible examples from the actual response. Do not invent API fields, balances, or live transaction results.

## What belongs to which tool

| Component | Role |
| --- | --- |
| quickstacks | Prepare reusable stack context, the brief, and verification requirements as implemented |
| User's coding agent | Build the project, run tools and checks, diagnose failures |
| Rho sandbox | Supply read-only transaction data through a verified available endpoint |
| Application | Evaluate review rules and present explanations |
| Deployment tools | Publish the application if a working deployment path exists |

## Capture requirements

- Use exact commands verified against the recording commit. Do not present proposed CLI syntax as working.
- Capture the initial request, useful generated context, test result, application result, and follow-up change.
- If a check fails naturally, show the coding agent fixing the cause and rerunning it. Do not manufacture a failure and imply it occurred naturally.
- Label cuts, accelerated sections, cached results, and prebuilt portions. Keep elapsed build time distinct from video length.
- If deployment is demonstrated, open the returned URL and execute a fresh request. A dev server or static screenshot does not establish deployment.
- Use a neutral project name such as rho-review. Exclude photo, resale, and marketplace product examples.

## Submission positioning

For an agent-focused submission, demonstrate the coding agent's actual tool use and verification loop, and distinguish it from the deterministic CLI. For a Rho submission, show the actual sandbox request and resulting transaction-review behavior.

Confirm current track rules and dual-entry eligibility from the organizer before claiming either qualification. These are presentation angles, not a verified eligibility assessment.

## If the full workflow is unfinished

Show the working portion and name the remaining steps accurately. A fixture-backed local prototype can illustrate the workflow, but must be labeled as such and does not demonstrate a live Rho integration, deployment, or completed quickstacks product loop.
