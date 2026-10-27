# Phase 4.2c: Directory browsing

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | The directory can be browsed, not only looked up: sorted list views (default, most used, highest success, trending, newest), a page per tag, a page per fragment with the fragments it is most often used with, a page per agent listing the stacks that work with it, and a page kept for every stack that left the registry, with a notice and a pointer to its replacement. Every page is static HTML with no client-side JavaScript; numbers come only from 4.2a's capped, suppressed `window_metrics` |
| Traces to | The developer who starts projects often: "a stack that matches how they'd build it". The coding agent "runs `list --json`, picks a stack" (the directory is where a person checks that pick). Success row 5, "Stacks and fragments in `~/.stacks` and third-party sources" made visible. "Stacks don't rot" (a removed stack's page says so rather than vanishing) |
| Depends on | 4.2b (the Worker-rendered marker pattern and stats renderer), 4.0c (the index build), 4.0e (the directory templates, the stack pages, `OfficialNames`), 4.1d (`installs`, for install maturity in trending), D17 for the telemetry views |
| Blocks | Nothing. 4.2e adds dependency pages beside these |
| Decisions needed | D17. If declined, only the telemetry-free parts ship: the newest view, tag pages, fragment pages without stats, and removed-stack pages. [Open question 31](../risks-and-open-questions.md#open-questions-for-the-maintainers) (agent pages list stacks for one agent and never compare agents) |
| Settles | The directory's views and their orderings; the trending score; `trending` in `StatsSummary`; co-installed fragment lift; how removed stacks are recorded and shown |

## Scope

In:

- New page templates and pages in 4.0e's directory build (`packages/cli/scripts/site/`): `/browse/newest/`, `/tags/<tag>/`, `/fragments/<id>/`, removed-stack pages at `/stacks/<id>/`.
- `packages/cli/registry/removed.json`, the maintainers' record of removed entries, checked by the build.
- Worker-rendered views through 4.2b's marker pattern: `/` reordered by default sort, `/browse/most-used/`, `/browse/highest-success/`, `/browse/trending/`, `/agents/<agent>/`.
- A trending score and an additive `trending` field in `StatsSummary`.
- A co-installed fragment dimension in 4.2a's daily rollup step, shown on fragment pages as "often used with".

Out:

- Search, filters that need client-side JavaScript, pagination beyond one page per view (the catalog is small; revisit past 200 entries).
- Directory visit analytics of any kind (roadmap, Won't have).
- Dependency pages (4.2e).
- Any ordering of agents against each other: an agent page lists stacks for that agent only.

## Design

### Where this fits

4.0e builds a static page per stack and an index page, and 4.2b fills a stats marker in them from the Worker. This sub-phase adds more pages of the same two kinds: pages the build writes once from the index, the bundled registry and `removed.json`, and pages whose order depends on stats, which the Worker fills from `window_metrics` through a marker and caches for an hour. Nothing new reads raw events; every number is a 4.2a cell, already capped and suppressed.

### Views

| Path | Built by | Order | Without telemetry |
|---|---|---|---|
| `/` | Build (by name), reordered by the Worker | Stacks whose green rate is unsuppressed, by Wilson lower bound, highest first; then the rest by name | By name, as 4.0e builds it |
| `/browse/most-used/` | Worker | Effective projects in the 28-day window, highest first; suppressed counts last | Not served (assets 404) |
| `/browse/highest-success/` | Worker | Green rate point estimate, among stacks with an unsuppressed rate only | Not served (assets 404) |
| `/browse/trending/` | Worker | Trending score, among stacks that qualify (below) | Not served (assets 404) |
| `/browse/newest/` | Build | Date the entry was added, newest first | Served |
| `/tags/<tag>/` | Build, stats cells by the Worker | By name | Served without stats cells |
| `/fragments/<id>/` | Build, stats section by the Worker | n/a | Served without stats |
| `/agents/<agent>/` | Worker | Stacks by that agent's green rate Wilson lower bound (4.2a's `byAgent`), unsuppressed only | Not served (assets 404) |

Every view links to every other, so no page is a dead end. Ties break by id. The Worker views are switched by a Worker config var, `STATS_ENABLED` in `packages/api/wrangler.jsonc` (`"true"` only on the D17 path, after 4.2a's tables exist). When it isn't `"true"`, the Worker doesn't handle `/browse/most-used/`, `/browse/highest-success/`, `/browse/trending/` or `/agents/*`; they fall through to the static assets layer, which has no file there and returns its 404, and `/`, tag and fragment pages are served as built with their markers left empty. 4.2e's dependency pages use a second var, `DEPS_ENABLED`, the same way.

An agent page answers "which stacks work with the agent I use", which is a ranking of stacks for one agent. It never shows two agents' numbers side by side, and no page lists agents in order of anything ([open question 31](../risks-and-open-questions.md#open-questions-for-the-maintainers)). The stack page's per-agent breakdown is 4.2b's section, listed alphabetically by agent.

### When an entry was added

The build takes an entry's added date from git: the commit date of the first commit that added its definition file (`git log --diff-filter=A --format=%cI -- <entry>/STACK.md`), run through `Processes` like the build's other git reads. An index-only entry uses the same rule on its source path. The date is the content's age, not its popularity, so the newest view needs no telemetry and no `installs` table.

### Removed entries

`packages/cli/registry/removed.json`, edited by the maintainers in the change that removes an entry:

```json
{ "schemaVersion": 1,
  "entries": { "old-stack": { "kind": "stack", "removedAt": "2027-03-01",
                              "replacedBy": "new-stack", "reason": "Merged into new-stack" } } }
```

The build fails if an id in 4.0e's `OfficialNames` (every id any released CLI version or index has shipped) is in neither the current registry, the index nor `removed.json`, or if `replacedBy` names an id that isn't current. So a removed stack can't silently lose its page. Its page at `/stacks/<id>/` keeps the last static content the build can produce from the last release tag that shipped it (name, description, tags, verify steps, last ledger run), and opens with "Removed from the registry on <date>: <reason>. Use <replacedBy> instead." and the copy command for the replacement, never for the removed id. With telemetry, the stats section shows the last published window rows, labelled with their `through` date. `reason` is plain text the maintainers write, escaped like every other value.

### Trending

For each stack, from 4.2a's rows: `last7` is the effective project count in the 7-day window ending at the last finalized day, and `prior28` is the effective count in the 28-day window ending 7 days before that.

```
score = (last7 + 5) / (prior28 / 4 + 5)
```

The `+ 5` terms keep a stack going from 1 to 3 projects from looking like a surge. A stack qualifies only when `last7` is at least 10, counted on the capped effective sample (so one install or one network can't create a trend) and on mature installs only (4.1d's `installs`: an install first seen less than 24 hours before a project's scaffold doesn't count, which 4.2a already applies). `/browse/trending/` lists qualifying stacks with a score of at least 1.5, highest first.

`StatsSummary` entries gain an additive field, decoded as optional so 4.2b's CLI keeps working against an older API:

```json
"trending": { "value": true, "score": 1.8, "suppressed": false }
```

`value` is true when the stack qualifies and its score is at least 1.5. Below `last7` 10 it comes back `{ value: null, suppressed: true }`. The CLI ignores it; it exists for the trending view and so a later client can read it without a schema change.

### Often used with

The daily rollup step (4.2a) gains one dimension, `cooccur`, over each project's final fragment set (defaults minus `--without`, plus `--with`). For a fragment A and another fragment B within one stack:

```
lift(A, B) = P(B in set | A in set) / P(B in set)
```

computed over the capped projects of the 28-day window. A pair is shown only when the projects containing both reach an effective sample of 5, and only when lift is above 1. Because the set is the final one, this covers both "attached together" and "kept together". The fragment page shows up to three such fragments, highest lift first, with the stack each applies to.

### Fragment and tag pages

A fragment page has the fragment's name, description, the stacks it applies to (from its frontmatter), whether each stack includes it by default, the files it ships (paths only), the verify steps it adds (name, phase, layer, command), its last ledger run through a stack that included it (the same rule as 3.1a's `lastRun`), a link to its source, and the copy command `npx quickstack new <stack> --with <id>` for each stack it applies to. With telemetry, the Worker fills its stats marker from `/v1/stats/fragments/:id`'s numbers and the "often used with" list.

A tag page lists every current stack and fragment carrying that tag, by name, with the same cells as `/`. Tags come from entry frontmatter. A tag becomes a path segment, so the build fails on a tag that isn't `^[a-z0-9-]+$` and names the entry; `validate` has no such rule today, and adding one is a format change for 1.5's owner to consider, not this sub-phase's.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/scripts/site/` | Templates for browse, tag, fragment and removed-stack pages; the added-date reader |
| `packages/cli/scripts/build-index.ts`, `scripts/site/` | Writes the new pages; checks `removed.json` against `OfficialNames` |
| `packages/cli/registry/removed.json` | New, empty `entries` |
| `packages/api/src/handlers/directory.ts`, `src/stats/render.ts` | Worker views and markers |
| `packages/api/src/stats/trending.ts`, `src/stats/cooccur.ts` | Score and lift |
| `packages/api/src/stats/rollup.ts` | The `cooccur` dimension in the daily step |
| `packages/format/src/stats.ts` | `trending` on summary entries (additive) |
| `packages/api/wrangler.jsonc` | Routes for `/browse/*` and `/agents/*` before assets; the `STATS_ENABLED` var |
| Tests in both packages | New |
| `AGENTS.md`, the directory's about text | The views, the trending score and lift in the words above |

## Acceptance tests

- The build over a fixture registry writes `/browse/newest/` ordered by the fixture repo's commit dates, a tag page per tag, and a fragment page per fragment, each with no `<script>` and the expected copy commands.
- A fixture where `OfficialNames` holds `old-stack` and the registry doesn't: the build fails naming it; with a `removed.json` row it succeeds, `/stacks/old-stack/` carries the notice and the replacement's copy command, and no page contains `npx quickstack new old-stack`. A `replacedBy` naming a missing id fails the build.
- Seeded `window_metrics`: `/` orders stacks by Wilson lower bound with suppressed ones after by name; `/browse/most-used/`, `/browse/highest-success/` match hand-sorted fixtures; ties break by id.
- Trending: `last7 = 12`, `prior28 = 8` gives score `17 / 7`, about 2.43, listed; `last7 = 9` not listed and `trending.suppressed: true`; 12 projects from one install count 3 and don't qualify.
- Lift over a seeded window matches a hand computation; a pair with an effective sample of 4 is not shown.
- `/agents/claude/` lists only stacks with an unsuppressed `claude` breakdown, and contains no other agent's numbers.
- With `STATS_ENABLED` unset or `"false"`: `/browse/trending/` and `/agents/claude/` return the assets layer's 404, and `/browse/newest/`, tag, fragment and removed pages are served.
- A `reason` or tag containing `<` in a fixture is escaped or rejected.
- 4.2b's CLI decodes a summary with and without `trending`.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- One manual deploy (4.0e's deploy procedure) shows every view, and `build:index --check` passes.

## What this plan may get wrong

- With a handful of stacks, sorted views and trending say little. They are cheap once 4.2a exists, but if the catalog stays small, ship only newest, tags, fragment and removed pages and leave the Worker views unbuilt.
- The trending constants (`+ 5`, the 10-project floor, the 1.5 threshold) are guesses. They are config, applied at render time.
- Git commit dates as added dates assume the build runs in a full clone. A shallow clone gives the clone date; the build checks for a shallow repository and fails rather than writing wrong dates.
- An agent page is a ranking of stacks per agent, which some readers will still read as agents compared. Open question 31 is the maintainers' call; if they say no, drop `/agents/*` and keep the stack page breakdown.
