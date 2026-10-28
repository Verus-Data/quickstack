# RFC: Finish the agent-first stacks submission

Status: DRAFT 2026-10-28 (final proposal; implementation has not started under this RFC)

## Recommendation

Finish the published discovery-to-build loop before adding features. Ship compatible
search contracts, make evidence and recovery clear to agents, improve the seed's
realism, expose the existing dependency experience, and record a fresh build using
the released CLI. The submission should demonstrate a useful project built from a
chosen recipe, with meaningful checks and an inspectable result.

This RFC orders the remaining work across this repository and `stacks-api`. It is
the submission queue; the linked phase plans still own their detailed contracts.
It does not mark old phases complete or change settled decisions in
[README.md](README.md#decisions-log). Implementation agents update the relevant
phase records as they close each item.

The user explicitly wants agent-first CLI/API behavior and realistic, high-quality
seed data. Seed labeling is outside this work. Preserve the existing CLI trust,
telemetry-consent, suppression and disclosure contracts.

## Problem and intended experience

The [problem statement](../product/PROBLEM_STATEMENT.md) asks for a consistent,
current, tested setup without an afternoon of repeated agent instructions. The
core composition, brief and verification loop exists. The remaining friction is
between source, published artifacts and the hosted service, and in interpreting
the evidence used to select a recipe.

The primary user is a coding agent acting for a developer. It should discover the
workflow from help or structured output, search in the developer's words, explain
fit and one tradeoff, inspect a recipe, scaffold, follow the brief and verify.
An empty result or failed check must leave a useful next action. A developer using
the website should reach that same workflow through a working copyable prompt.

The experience should be guided and transparent. Existing structured results,
schemas, error envelopes and static page disclosures are the patterns to extend.
No new agent protocol, recommendation service or UI redesign is required.

## Evidence and limits

The October 28 audit exercised the npm package, source CLI, live read endpoints at
`https://stacks.steamfield.io`, and browser flows. Recheck this baseline in R0;
other agents are landing work while this plan is written.

| Observed gap | Source or existing owner |
| --- | --- |
| Published CLI 0.3.1 lacks search and hosted stats; source has newer functionality under the same version | `packages/cli/package.json`, `src/cli.ts`; phase 1.6c |
| Live search uses older penalty encoding; source rejects it and falls back locally | `packages/format/src/search/schema.ts::SearchResponse`, CLI `core/search/remote.ts::remoteSearch`; phase 4.5e |
| Live nonsense search returns unexplained zero-score hits; search stats are null despite available detail metrics | `stacks-api/apps/api/src/services/Search.ts`; newer ranking/evidence work already exists in source |
| Search omits the content comparison that `show` provides for historical runs | CLI `core/search/input.ts::searchInput`, `core/show.ts::showReport`; phase 4.5c |
| Guide prose, help footer and structured command list teach different entry paths | CLI `core/guide.ts::guideText`, `guideCommands`, `helpFooter` |
| Default seed has sparse dependency evidence and first-step-only failures | `stacks-api/scripts/seed/{profile,events,simulate}.ts`; phase 4.2g |
| Dependency landing page returns 404; canonical URLs use `example.com`; clipboard failure leaves text collapsed | `stacks-api/apps/web`, `scripts/production.ts`; phases 4.0e, 4.2e, 4.2f |
| Default remote index and telemetry endpoints are unset; trusted index keys are empty | CLI `src/bin.ts`, `src/config.ts`; format `src/index-keys.ts`; phases 4.0c/d, 4.1e |

Already working in the sampled flows: scaffold JSON identifies the project and
brief; verify reports step failures and next actions; website filters survive
sorting and Back; sandbox selection updates copied text; prompt access works
without JavaScript; sampled pages fit a 390-pixel viewport. Preserve these behaviors.

This audit did not certify every generated application, production ingest, or full
accessibility compliance. Existing [library QA](qa-gap-closure.md) found omissions
after green verification. A fresh demo must inspect assertions and behavior as
well as the final exit code.

## Scope and execution order

P0 is required for this submission. P1 follows submission or can land earlier
without delaying P0. P2 requires its stated trigger. These priorities apply to
outcomes, not to every item in the older roadmap.

| ID | Priority | Deliverable | Owner | Depends on | State |
| --- | --- | --- | --- | --- | --- |
| R0 | P0 | Current release baseline and demo acceptance brief | Release coordinator | None | Open |
| R1 | P0 | Compatible search and clear agent contracts | CLI/format + API agents | R0 | Open |
| R2 | P0 | Realistic active seed with a quality report | API agent | R0; final catalog before final generation | Open |
| R3 | P0 | Fresh proof for the demonstrated recipe | CLI/recipe agent | R0; R1 candidate for discovery rehearsal | Open |
| R4 | P0 | Usable hosted decision and handoff pages | Web agent | R0; R2 output for final QA | Open |
| R5 | P0 | Coordinated release and deployed acceptance run | Release coordinator | R1, R2, R3, R4 | Open |
| R6 | P0 | Recorded demo, reconciled plans and submission package | Demo owner | R5; preparation starts at R0 | Open |
| R7 | P1 | Signed remote-only recipe discovery and installation | CLI/format + release coordinator | R5, current proofs for published stacks | Open |
| R8 | P1 | Live telemetry collection and operations acceptance | API + release coordinator | R5, trusted allowlist and launch prerequisites | Open |
| R9 | P1/P2 | Scheduled proof and evidence-led product follow-up | Maintainers | R6; triggers below | Open |

Start R0 now. After its baseline is recorded, R1, R2 and R4 may proceed in parallel;
R3 can prepare the selected recipe and environment alongside them. Finish code
and recipe corrections before freezing artifacts for R5. Publish and deploy in
the order specified there. R6 is the last submission check.

Each owner records completion evidence in
`plans/runs/2026-10-28-submission-readiness/` in this repository. Use `baseline.md`,
`contracts.md`, `seed-quality.md`, `recipe-proof.md`, `web.md`, `release.md` and
`submission.md` respectively. Record commands, versions, inputs, outcomes and
remaining limits; omit credentials and machine-specific home paths. Create these
files as work runs, never prefill successful outcomes.

## R0. Establish the release baseline

**Outcome:** every agent works toward the same versions, catalog and demo.

Read both repositories' instructions, their current status, the phase 4 handoff,
and the API operations guide. Check npm's latest CLI/format releases, local
package versions, deployed search shape and health, and existing completed work.
Specifically inspect the newly landed incremental integrity and bounded rollup
work before scheduling more seed-performance changes.

Choose `python-react --sandbox` as the default demo composition because it matches
the site's current example. Use a small local expense-tracker slice: create an
expense through the UI/API and see it in a list or total. Keep persistence and
authentication out unless the organizer requires them. Record the chosen
fragments, agent/model, required tools and a focused behavior check before building.
If the organizer requires a sponsor integration, the demo owner resolves that
requirement before R3; do not silently add the older transaction-review scope.

Record organizer deadline, timezone, video limit, required links, repository-access
rules and sponsor eligibility in `submission.md`, using organizer sources supplied
or found by the demo owner. Unknown requirements remain explicit blockers to R6;
they do not block R1, R2 or R4.

**Done when:** `baseline.md` records the observed release matrix and the intended
submission catalog, and `submission.md` identifies the demo scope and outstanding
organizer requirements. Already-fixed audit items are closed with evidence.

## R1. Finish search and agent-facing contracts

**Outcome:** an agent can choose, interpret evidence and recover using the public
interface alone.

Keep shared wire schemas and ranking in `packages/format`; CLI orchestration stays
in `packages/cli`; HTTP parameter validation stays in `stacks-api/packages/contract`.
The API consumes the published format package, never another checkout's source.
Extend the existing contracts and update the roadmap's shared-contract table with
any change. Preserve the existing columnar API encoding and decoded CLI results.

1. Align the API with format 0.4.0 or the next release required by this work. Reuse
   the landed positive-hit ranking and API stats-evidence code. Do not reimplement
   those fixes. No-match results must have empty lists when no candidate has a
   positive explained match; partial matches remain possible and are qualified.
2. Make ledger freshness explicit in search using the same content comparison as
   `show`. Add an optional content-match indicator to the shared search evidence;
   missing means unknown, not current. Only a passing run with matching content
   may act as current proof or a proof-based tie-breaker. Historical runs remain
   inspectable. The API must not invent a passing record when the index has none.
3. Keep aggregate usage outcomes separate from recipe proof. Populate search stats
   from the existing published summary, respecting suppression. Describe their
   population/window and aggregate scope in schema descriptions and agent guidance;
   do not imply a sandbox selection has a configuration-specific success rate.
4. Put search in `guideCommands` and make root help, guide prose and examples teach
   the same search/show/new/verify loop. Retain `list` for browsing and recovery.
   Add a structured next action for no-match CLI results, using existing result
   conventions, without changing a successful empty search into an error exit.
5. Make API search `BadInput` identify the bad parameter, expected form and safe
   correction, as stats already does. Express q/kind/limit constraints in OpenAPI.
   Do not echo or log the search text in error details. Retain the deadline,
   fallback, opt-outs and backoff behavior; distinguish fallback in public output.

**Done when:** contract fixtures round-trip through the packaged CLI and API;
strong, partial and nonsense queries behave correctly; suppressed/absent stats
remain absent; matching, changed and unknown ledger evidence are distinguishable;
local overrides still win. Invalid q/kind/limit/unknown-key requests give actionable
400 responses. A fresh agent can discover search and recover from no match without
reading source. Confirm offline/API-failure recovery as well as API success.

**Compatibility:** before changing an existing field, inventory published consumers
in R0. Prefer additive fields. A package version bump alone does not version an
HTTP route; retain decoding for supported deployed clients or introduce an explicit
route version if required. Test the previous npm CLI against the new service.

## R2. Produce a realistic active seed

**Outcome:** the data supports believable decisions and exercises sparse and rich
states without changing publication thresholds.

Keep deterministic generation through the existing ingest, integrity and rollup
pipeline. Extend the active profile rather than creating a second seeding system.
Version the profile when distributions change and record seed, anchor date, input
digest and profile in the quality report. Use frozen, reviewed dependency-version
fixtures; generation itself stays offline.

| Gap | Design direction | Acceptance evidence |
| --- | --- | --- |
| Dependency evidence is almost entirely suppressed | Use the active population and eligibility rules; retain a sparse tail | At least five named npm packages, including `react` and a scoped package, have publishable counts and useful detail; at least one sparse package remains suppressed |
| Failures concentrate on install | Use actual manifest phase/layer metadata and weighted eligible failure steps | Selected stacks show install, test and another applicable failure layer across the population; setup failures skip work that could not have run |
| Every verify is full and unchanged | Add deterministic environment-blocked, partial and changed-step cohorts alongside ordinary failed-then-green retries | Each cohort survives the intended ingest classification; changed-step refusal invents no executed steps; telemetry outcomes remain valid under the existing schema |
| Every project is a new install | Generate a bounded install population with repeat projects over time | A stable cohort creates multiple projects; the per-install contribution cap and maturity rules are exercised, with no cap bypass |
| Dependency majors are arbitrary | Use package-specific plausible majors and dated upgrade eligibility | No hash-generated nonexistent majors; repeat reports only transition along the reviewed fixture's allowed edges |
| Timing and project histories can disagree | Generate ordered project events with plausible per-stack timing, failure recovery and matching composition metadata | First test precedes or equals first green; cumulative durations and skipped steps are plausible; repeated reports preserve project identity |

Retain the existing rising, falling, new-entry and regression/recovery stories,
agent/preset variation, weekday effects and a no-verify cohort. These are scenario
fixtures, not estimates of real adoption. Do not force every metric to publish or
make every stack successful.

Run a bounded active sample first, inspect counts and runtime, then run the full
profile using the final catalog. Inspect resulting API responses and website
charts together: a popular stack, a sparse stack, the regression story, a fragment,
and the five selected dependencies. Record expected versus observed behavior.
If performance remains a blocker, profile the landed maintenance changes first;
do not optimize based only on the earlier handoff note.

**Done when:** the report demonstrates the scenarios above, repeat generation with
fixed inputs is deterministic, integrity rejects deliberately invalid fixture
events, and local container maintenance stays healthy during generation/serving.
Seed preparation must not replace the deployed database. R5 owns that operation
and its backup/restore procedure.

## R3. Refresh the demonstrated recipe's proof

**Outcome:** the demonstrated composition has current, inspectable evidence.

Use the current packed candidate in a disposable directory with isolated CLI state.
Check tool executability, not just PATH presence; the audit encountered an installed
but unusable Go shim. Have a fresh agent build the R0 composition from the generated
brief, then run the required verify steps. Inspect real assertions and exercise the
R0 behavior check. Fix recipe omissions in the recipe and repeat affected checks.

Record scaffold time separately from agent time to first green, cache conditions,
manual interventions, model, preset and fragments. Use existing bench/ledger import
tools to record eligible recipe runs. An application-specific behavior test is
additional demo evidence, not a substitute for the recipe's declared checks.

Generate the final proof after recipe edits stop. Verify that its fingerprint
matches what the candidate package ships. Preserve older records as history.
The sandbox demo proof does not automatically satisfy a default-composition
publication rule; run that composition separately when the index policy requires it.

**Done when:** the demonstrated recipe has a fresh matching run, meaningful behavior
evidence and no unresolved setup blockers. Releasing a changed recipe invalidates
this closure until the affected proof is refreshed. R6 repeats the user-facing
journey with the actual npm release.

## R4. Close the website's decision and handoff gaps

**Outcome:** the website exposes the working product and gives the agent a usable
next step.

Enable the existing dependency pages through the deployment's build settings and
data source. Check the complete alphabetical directory, scoped-package paths,
detail pages, suppression/empty states and links back to recipes. Use the current
metric meanings; do not manufacture adoption/drop rates or denominators. Preserve
the accepted directory-decision RFC in `stacks-api/docs/specs/` and record any
remaining broader dependency-analysis work under R9.

Set the canonical site origin to `https://stacks.steamfield.io` and verify generated
canonical and sharing URLs on home and detail pages. On clipboard failure, open
the relevant prompt disclosure and provide an actionable, announced fallback.
The selected full/sandbox prompt must remain consistent across keyboard, copy and
no-JavaScript use.

Make the fit-filtered catalog reachable from the primary browsing flow. Preserve
the working filter/sort/Back behavior; keep analytics views available without
forcing someone choosing a recipe to traverse charts first. Reuse existing pages
and navigation rather than adding a search UI or comparison builder.

**Done when:** `/deps/` and the selected detail pages return 200, the R2 scenarios
render usefully, and keyboard/mobile/no-JavaScript/clipboard-failure checks pass.
Smoke every advertised link and copied command against the R5 candidate. Review
focus visibility, accessible names and chart data-table access on those journeys.

## R5. Release a compatible, reproducible submission

**Outcome:** a clean npm install behaves like the tested candidate against the live
API, without a source checkout or undocumented environment variables.

The release coordinator freezes the format version, CLI version, API build,
catalog/bundle digests, seed profile and static-site build inputs in `release.md`.
Use fresh cache/state for API-success checks and a separate profile for backoff
checks; a prior failed search must not hide a successful redeployment.

Release order:

1. Finish R1 and recipe edits, then build and gate the exact candidate trees. Publish
   the final shared format version. If dependency installation requires an earlier
   format publish during R1, record it and publish the final version before rollout.
2. Upgrade the API's declared format dependency and regenerated lockfile. Build the
   API, catalog assets and R4 site against the final contracts. Verify existing
   published consumers before deployment; do not loosen validation to mask drift.
3. Complete R2 generation against those catalog inputs. Follow the existing API
   operations procedure to snapshot the current store/assets and record a tested
   restore path before replacing the demo store. Serialize seed and application
   deployments. Load the final dataset, run maintenance and rebuild static stats
   pages from that dataset so site and API agree.
4. Deploy the API/assets/site and verify health, maintenance freshness, search
   decoding, stats evidence and dependency routes from outside the host.
5. Publish a new CLI version with the current search/stats behavior and agent fixes.
   Test the actual npm artifact in an isolated directory, using the website prompt.
   Record exact published versions and the install command used for the demo.

The submission uses recipes available in this released CLI. Check every id promoted
by the website and returned by the intended discovery queries against `show` and
scaffold resolution. The selected demo recipe must agree with the hosted recipe
content. Until R7 is complete, keep the hosted submission catalog aligned with the
release and do not advertise remote-only acquisition. If an advertised recipe
cannot resolve, fix catalog/release alignment before closing R5.

Default telemetry remains off until R8's launch checks pass. Search/stats readiness
does not imply collection readiness. Keep remote-index trust validation intact;
this release does not solve missing trust by accepting unsigned remote entries.

**Done when:** installed CLI search reports `ranking: api` and `remote: used` with
valid evidence; nonsense searches offer recovery without irrelevant padding;
`show/new/verify` work for the demonstration; local/offline fallback and previous
published-client compatibility pass; hosted pages match the dataset and recipe.
On failure, withhold the new npm release or deploy a compatible service fix. Record
rollback versions; never rewrite an already-published npm version.

## R6. Finish the submission and reconcile the plans

Run the full recorded journey with the npm version from R5, a fresh directory and
the R0 scope. Show the agent's choice, generated brief, useful application behavior,
meaningful assertions, full required verification, elapsed time and interventions.
Demonstrate changed-command refusal only in a disposable copy. Any skipped step or
unresolved implementation omission is a failed demo acceptance check, not green.

Bring `product/DEMO_OUTLINE.md`, `PITCH.md` and `PREP.md` into agreement with the
recorded scope. Refresh stale status summaries in this plan's handoff, README and
relevant phase files, plus `stacks-api/docs/product/README.md` and `AGENTS.md`.
Update the canonical problem statement's implementation facts, then refresh its
API copy; preserve its unvalidated product hypotheses. Do not mark canary,
community adoption or longitudinal claims proven by a single run.

**Done when:** the video fits verified organizer requirements; installation, live
site, source-access and submission links work for the intended reviewer; the demo
can be repeated from the recorded instructions; all P0 rows have linked closure
evidence. The submission owner performs any final external submission action.

## R7. Launch signed remote recipe distribution next

Follow phases [4.0c](phases/phase-4.0c-registry-index.md) and
[4.0d](phases/phase-4.0d-cli-remote-origin.md) and their acceptance details.
A release coordinator provisions the maintainer
signing key outside the repository and publishes its public key through
`INDEX_PUBLIC_KEYS`. Build and serve the signed index and allowlist using the
existing proof eligibility rules. Refresh current default-composition proofs for
the stacks intended for that index; preserve the bundled catalog independently.

Configure the official remote-index origin in the CLI. Use the same signed
publication for API search and recipe resolution. Test a signed fixture entry
absent from the CLI bundle through search/show/new, plus local shadowing, invalid
signatures, incompatible formats, unavailable bundles and offline cache behavior.
Use a controlled test server for invented entries, not the public catalog.

**Done when:** a released client can discover and fetch a newer eligible recipe
without environment overrides, and cannot fetch an untrusted or tampered one.
This is a prerequisite for advertising catalog growth independent of CLI releases.

## R8. Enable the telemetry feedback loop next

Execute the existing [4.1e launch runbook](phases/phase-4.1e-telemetry-launch-and-runbook.md)
and the [4.2d dependency telemetry acceptance](phases/phase-4.2d-dependency-telemetry-client-and-ingest.md).
Reuse the smoke identities and query tools already built. Confirm the reviewed
signed allowlist, notice/opt-out behavior, real storage/archiving, retention,
maintenance health, alert destination and restore procedure before shipping a
default telemetry endpoint. Preserve source-build and CI exclusions.

Keep this live-collection launch separate from R5's demo-store deployment. The
launch owner follows the runbook's store-transition procedure; a demo seed reload
must not later overwrite collected usage. This is an operational data-lifecycle
boundary, not a seed-labeling task.

**Done when:** the production smoke sequence and dependency-v2 rerun pass, alerts
reach their owner, notices/opt-outs work in the packaged client, and a compatible
CLI release enables the endpoint. R8 can run before submission only if it does not
delay P0 or disturb the demo dataset.

## R9. Follow-up work and explicit deferrals

| Priority | Work | Start condition / exit |
| --- | --- | --- |
| P1 | Scheduled canaries (phase 5.1) | Provision the planned isolated runner and credentials; a scheduled current-recipe run records proof and surfaces failures. Manual bench runs bridge the gap. |
| P1 | Wider library proof | After the demo, refresh the remaining compositions in batches; inspect generated behavior as well as verify. Feed recipe corrections back into R7 publications. |
| P2 | Dependency decision cohorts | Use the accepted directory RFC's separate data milestone: producer-defined eligible populations, outside-default adoption, valid drop denominators and comparable categories. Do not infer these from installed counts. |
| P2 | Community contribution and third-party sources | Start with external author demand and the roadmap's trust requirements; measure whether an outside author can create and validate a recipe. |
| P2 | Embeddings, MCP and Workers migration | Apply their existing phase start conditions. None is needed for the CLI-led submission. |

Accounts, ratings, an AI recommendation chat, automatic agent execution and a new
comparison builder are outside this RFC. Keep new feature ideas out of P0 unless
they close a reproduced blocker to its stated journey.

## Verification and handoff rules

Use scoped regression tests during implementation, then each repository's full
gate once on its final candidate, following its AGENTS.md and rr setting. Read
pass/fail/skip counts. Do not run parallel whole-suite gates on the same host.
Cross-repository contract checks must use the packed/published artifacts. Live
checks complement fixture tests; production event writes belong only to the
documented R8 smoke procedure.

Before taking a row, read its existing phase plan and current code. Claim one row
in HANDOFF, leave unrelated changes alone, and record what was reused versus added.
If implementation changes a public contract, update its single owner and tests,
then follow the release dependency order. Close a row only when its evidence exists;
otherwise state the missing check and leave it open. Continue with an independent
row when credentials or organizer details block the current one.

This RFC supplies the product scope, high-level design and completion conditions.
Implementation contracts should name the touched modules and scoped tests without
repeating or widening these requirements. A web design pass should preserve the
current visual system and focus on discovery, copy recovery and dependency states.

## What this plan may get wrong

- Publication and deployment can move during implementation. R0 revalidates the
  audit; completion evidence takes precedence over old status prose.
- Seed volume may not overcome eligibility suppression. Diagnose maturity,
  population and dependency reporting before increasing scale or changing a gate.
- A fresh demo may expose a recipe defect after the release candidate is built.
  Return to R3, refresh proof and release a new version; do not edit demo output.
- Organizer requirements are not yet established in this RFC. R0 assigns an owner
  and R6 remains blocked until those requirements are verified.

## Review record

One ce:devils-advocate review is pending. Record its substantive findings and their
disposition here before handing back the final proposal.
