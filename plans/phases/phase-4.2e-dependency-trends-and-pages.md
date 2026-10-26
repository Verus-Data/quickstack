# Phase 4.2e: Dependency trends and pages

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | The rollup turns 4.2d's dependency reports into per-dependency and per-ecosystem numbers (how many projects use it, which majors, how that is moving, what it is used with, how it does per stack), under 4.2a's caps, suppression and publishing gate, and the directory shows them on static, Worker-filled pages and in a dependencies section on each stack page |
| Traces to | Assumption 2, "version-less prose rots much more slowly than versioned templates": a stack author sees which majors agents install today for their stack, and when that shifts, without rerunning anything. The stack author: "a way to know a stack still produces a working project without running it by hand" |
| Depends on | 4.2d (the dependency reports and tables), 4.2a (the rollup, caps, suppression, gate and lease), 4.2c soft (page templates and the browse links; without it the pages stand alone) |
| Blocks | Nothing |
| Decisions needed | D25 and D17, through 4.2d. The thresholds below reuse 4.2a's; any new one is listed here for the maintainers |
| Settles | Dependency metrics and their definitions, transitions, co-installed dependency lift, the dependency pages, and that no dependency route exists |

## Scope

In:

- New dimensions in 4.2a's daily rollup step: `dep`, `dep_major`, `dep_stack`, `dep_transition`, `dep_cooccur`, `ecosystem`.
- Pages `/deps/`, `/deps/<ecosystem>/`, `/deps/<ecosystem>/<name>/`, rendered by the Worker from `window_metrics`, and a dependencies section on `/stacks/<id>/` through a second marker.

Out:

- Any API route for dependency stats. No client reads one: the CLI doesn't show dependency numbers, and the pages render from `window_metrics` in the Worker like 4.2b's stats sections. Add a route when a named client needs it.
- Dependency numbers in `list --json` or `show`.
- Advisories, licenses or any data about a dependency that doesn't come from these reports.

## Design

### Where this fits

4.2d stores which allowlisted dependencies each project reported, with a per-project history in `project_deps`. This sub-phase computes from that history only. It adds no table beyond `window_metrics` rows and changes no rule of 4.2a's.

### Definitions

| Term | Meaning |
|---|---|
| Reporting project | A 4.2a project (mature install, not excluded) with at least one `project_deps` row whose `last_seen_day` is in the window |
| Uses X | A reporting project with a row for dependency X seen in the window |
| Major share | Among projects using X, the share on each major, by the row with the latest `last_seen_day` |
| Adoption | A project that reported in an earlier window without X and reports X in this one |
| Drop | A project that reported X in an earlier window, reports in this one, and no longer reports X |
| Major transition | A project whose rows for X show major A, then major B with a later `first_seen_day`, with B seen in this window |

Only 28-day windows over finalized days, as in 4.2a. Adoption, drop and transitions compare with any earlier report of the same project, which `project_deps` keeps past the 90-day raw prune.

### Metrics

| Question | Metric | Shown on |
|---|---|---|
| Who uses it | Reporting projects using X; share of reporting projects per stack using X | Dependency page; stack page section |
| Which version do agents install | Major share for X, overall and per stack | Dependency page; stack page section |
| Is it moving | Adoptions, drops and major transitions (A to B) per window, with the daily series of 28-day values | Dependency page |
| What goes with it | Co-installed lift `P(Y | X) / P(Y)` over reporting projects, shown when both are used by an effective sample of 5 and lift is above 1, top five | Dependency page |
| Does it work | Green rate of the stack's projects using X against those not using X, per stack, only when both cells pass 4.2a's rate thresholds | Stack page section |
| Ecosystem | Reporting projects per ecosystem; top dependencies by projects; recent major transitions | `/deps/<ecosystem>/` |

Every count and rate uses 4.2a's install cap and effective sample, its suppression rules and its publishing gate; which pages answer is set out under Pages below. Every page says the numbers describe "quickstacks projects", not the ecosystem.

The stack page section is the reason this exists: it tells a stack author, for example, that most of their stack's projects now land on a new major of the framework the prose describes, and whether those projects go green as often. 2.2's rot checks look at the entry; this looks at what agents actually built from it.

### Pages

- `/deps/`: one link per ecosystem with its project count.
- `/deps/<ecosystem>/`: top 50 dependencies by reporting projects, recent major transitions, links to each dependency page.
- `/deps/<ecosystem>/<name>/`: the metrics above, the stacks whose projects use it most, and the computed and through dates.
- `/stacks/<id>/`: a `<!-- quickstacks:deps -->` marker added to 4.0e's template, filled with the stack's top dependencies, their major shares and the with-and-without green rates.

All are rendered by the Worker with the same plain marker replacement as 4.2b, every value escaped (package names come from the allowlist, but are escaped anyway), `Cache-Control: public, max-age=3600`, no client-side JavaScript. Which dependency pages answer, decided here:

| Case | Response |
|---|---|
| Name not on the current allowlist | 404 `NotFound` envelope |
| Allowlisted name, publishing gate not met | 200 with 4.2b's fixed sentence, "Not enough runs yet to publish numbers for this dependency." |
| Allowlisted name, gate met, every cell suppressed (including a name no project reported) | 200 with the same fixed sentence |
| Allowlisted name, gate met, some cell published | 200 with the published cells, suppressed ones shown as hidden |

The pages are switched by the `DEPS_ENABLED` Worker config var in `packages/api/wrangler.jsonc`, the same way 4.2c's views use `STATS_ENABLED`: when it isn't `"true"`, the Worker doesn't handle `/deps/*`, the paths fall through to the assets layer's 404, and the stack page's deps marker is left empty.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/api/src/stats/deps.ts`, `src/stats/rollup.ts` | Dependency dimensions in the daily step |
| `packages/api/src/handlers/deps.ts`, `src/stats/render.ts` | Pages and the stack page section |
| `packages/cli/scripts/site/` | The `quickstacks:deps` marker in the stack page template |
| `packages/api/wrangler.jsonc` | `/deps/*` routes before assets; the `DEPS_ENABLED` var |
| `packages/api/tests/deps-stats.test.ts` | New |
| `AGENTS.md`, the directory's about text | Definitions in the words above |

## Acceptance tests

- Over seeded `project_deps`: projects using a dependency, major shares, adoption, drop and transition counts match hand computations; a project reporting the same major twice counts once.
- A project whose first report was 120 days ago (raw events pruned) and whose latest shows a new major counts as a transition.
- One install with 20 projects using X counts 3; a dependency with an effective sample under 5 is suppressed on every page.
- Lift over a seeded window matches a hand computation; a pair under the sample floor is not shown.
- The with-and-without green rate appears only when both cells pass the rate thresholds.
- Before the publishing gate is met, `/deps/npm/react/` shows the fixed sentence.
- An allowlisted dependency no project reported, after the gate is met, shows the fixed sentence; a name not on the allowlist returns 404; with `DEPS_ENABLED` unset, `/deps/npm/` returns the assets 404; a name with `<` in a fixture is escaped; no response contains `<script>`.
- No route under `/v1/` returns dependency numbers.
- Under the local Workers runtime, the daily trigger writes the dependency rows and `/deps/npm/` renders them with the cache header.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- The directory's about text and `AGENTS.md` define every dependency metric.

## What this plan may get wrong

- With few stacks and a 7-day report spacing, dependency cells will be small for a long time. The gate and suppression handle that; the pages may stay at "Not enough runs yet" well after stack stats are public.
- Adoption and drop depend on projects that keep reporting. A project that stops verifying looks like neither, which undercounts drops; the definitions say so on the page.
- The with-and-without green rate invites a causal reading it doesn't support. The page states it is a comparison of projects, not an effect of the dependency.
