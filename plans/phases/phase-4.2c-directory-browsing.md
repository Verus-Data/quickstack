# Phase 4.2c: Directory browsing

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | The directory can be browsed, not only looked up: sorted list views (default, most used, highest success, trending, newest), a page per tag, a page per fragment with the fragments it is most often used with, a page per agent listing the stacks that work with it, and a page kept for every stack that left the registry, with a notice and a pointer to its replacement. Every page is a static Astro page in `stacks-api/apps/web`, built from this repository's signed index output and the stats routes; numbers come only from 4.2a's capped, suppressed `window_metrics` |
| Traces to | The developer who starts projects often: "a stack that matches how they'd build it". The coding agent "runs `list --json`, picks a stack" (the directory is where a person checks that pick). Success row 5, "Stacks and fragments in `~/.stacks` and third-party sources" made visible. "Stacks don't rot" (a removed stack's page says so rather than vanishing) |
| Depends on | 4.2b (the build-time stats fetch, the stats section and the `STATS_ENABLED` switch), 4.0c (the index build), 4.0e (the directory pages in `apps/web`, the stack pages, `OfficialNames`), 4.1d (`installs`, for install maturity in trending), D17 for the telemetry views |
| Blocks | Nothing. 4.2e adds dependency pages beside these |
| Decisions needed | D17. If declined, only the telemetry-free parts ship: the newest view, tag pages, fragment pages without stats, and removed-stack pages. [Open question 31](../risks-and-open-questions.md#open-questions-for-the-maintainers) (agent pages list stacks for one agent and never compare agents) |
| Settles | The directory's views and their orderings; the trending score; `trending` in `StatsSummary`; co-installed fragment lift; how removed stacks are recorded and shown |

## Scope

In:

- A signed `v1/directory.json` written by `build:index` in this repository: each entry's added date, and each removed entry's record and last static content. The site can't read this repository's git history or `removed.json`, so the build hands it the facts.
- `packages/cli/registry/removed.json`, the maintainers' record of removed entries, checked by the build.
- New Astro pages in `stacks-api/apps/web`, built from the index output and `v1/directory.json`: `/browse/newest/`, `/tags/<tag>/`, `/fragments/<id>/`, removed-stack pages at `/stacks/<id>/`.
- Stats-ordered pages built from the stats routes behind `STATS_ENABLED`: `/` reordered by default sort, `/browse/most-used/`, `/browse/highest-success/`, `/browse/trending/`, `/agents/<agent>/`.
- A trending score and an additive `trending` field in `StatsSummary`.
- A co-installed fragment dimension in 4.2a's daily rollup step, shown on fragment pages as "often used with".

Out:

- Search, client-side filters, pagination beyond one page per view (the catalog is small; revisit past 200 entries). Astro islands make these cheap later; nothing reads them yet.
- Directory visit analytics of any kind (roadmap, Won't have).
- Dependency pages (4.2e).
- Any ordering of agents against each other: an agent page lists stacks for that agent only.

## Design

### Where this fits

4.0e builds a static page per stack and an index page in `apps/web`, and 4.2b fills a stats section in them at site build time. This sub-phase adds more pages of the same two kinds: pages built from the index output and `v1/directory.json` alone, and pages whose order depends on stats, built from the stats routes and rebuilt after each daily rollup (4.2b). Nothing new reads raw events; every number is a 4.2a cell, already capped and suppressed.

### Views

| Path | Built by | Order | Without telemetry |
|---|---|---|---|
| `/` | Index output; ordered from `/v1/stats/summary` | Stacks whose green rate is unsuppressed, by Wilson lower bound, highest first; then the rest by name | By name, as 4.0e builds it |
| `/browse/most-used/` | Stats summary | Effective projects in the 28-day window, highest first; suppressed counts last | Not built (static 404) |
| `/browse/highest-success/` | Stats summary | Green rate point estimate, among stacks with an unsuppressed rate only | Not built (static 404) |
| `/browse/trending/` | Stats summary (`trending`) | Trending score, among stacks that qualify (below) | Not built (static 404) |
| `/browse/newest/` | `v1/directory.json` | Date the entry was added, newest first | Built |
| `/tags/<tag>/` | Index output; stats cells from the summary | By name | Built without stats cells |
| `/fragments/<id>/` | Index output; stats section from `/v1/stats/fragments/:id` | n/a | Built without stats |
| `/agents/<agent>/` | Stats detail per stack (`byAgent`) | Stacks by that agent's green rate Wilson lower bound (4.2a's `byAgent`), unsuppressed only | Not built (static 404) |

Every view links to every other that was built, so no page is a dead end. Ties break by id. The stats-ordered views are behind the `STATS_ENABLED` site switch (roadmap, Contracts: Site feature switches; on only on the D17 path, after 4.2a's tables exist). When it is off, `/browse/most-used/`, `/browse/highest-success/`, `/browse/trending/` and `/agents/*` are not built, so they return the static 404 on Node and on Workers alike, and `/`, tag and fragment pages are built without stats. 4.2e's dependency pages use a second switch, `DEPS_ENABLED`, the same way.

An agent page answers "which stacks work with the agent I use", which is a ranking of stacks for one agent. It never shows two agents' numbers side by side, and no page lists agents in order of anything ([open question 31](../risks-and-open-questions.md#open-questions-for-the-maintainers)). The stack page's per-agent breakdown is 4.2b's section, listed alphabetically by agent.

### When an entry was added

`build:index` takes an entry's added date from git: the commit date of the first commit that added its definition file (`git log --diff-filter=A --format=%cI -- <entry>/STACK.md`), run through `Processes` like the build's other git reads. An index-only entry uses the same rule on its source path. The dates go into `v1/directory.json`, signed in the same envelope as the index; the site verifies it with `INDEX_PUBLIC_KEYS` like the index and fails its build on a bad signature. The date is the content's age, not its popularity, so the newest view needs no telemetry and no `installs` table.

### Removed entries

`packages/cli/registry/removed.json`, edited by the maintainers in the change that removes an entry:

```json
{ "schemaVersion": 1,
  "entries": { "old-stack": { "kind": "stack", "removedAt": "2027-03-01",
                              "replacedBy": "new-stack", "reason": "Merged into new-stack" } } }
```

The build fails if an id in 4.0e's `OfficialNames` (every id any released CLI version or index has shipped) is in neither the current registry, the index nor `removed.json`, or if `replacedBy` names an id that isn't current. So a removed stack can't silently lose its page. `build:index` writes each removed entry's record and its last static content from the last release tag that shipped it (name, description, tags, verify steps, last ledger run) into `v1/directory.json`. Its page at `/stacks/<id>/` shows that content and opens with "Removed from the registry on <date>: <reason>. Use <replacedBy> instead." and the copy command for the replacement, never for the removed id. With telemetry, the stats section shows the last published window rows, labelled with their `through` date. `reason` is plain text the maintainers write, escaped like every other value (Astro escapes by default; no page uses `set:html`).

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

A fragment page has the fragment's name, description, the stacks it applies to (from its frontmatter), whether each stack includes it by default, the files it ships (paths only), the verify steps it adds (name, phase, layer, command), its last ledger run through a stack that included it (the same rule as 3.1a's `lastRun`), a link to its source, and the copy command `npx @steamfield/stacks new <stack> --with <id>` for each stack it applies to. With telemetry, the site build fills its stats section from `/v1/stats/fragments/:id`'s numbers and the "often used with" list.

A tag page lists every current stack and fragment carrying that tag, by name, with the same cells as `/`. Tags come from entry frontmatter. A tag becomes a path segment, so `build:index` fails on a tag that isn't `^[a-z0-9-]+$` and names the entry; `validate` has no such rule today, and adding one is a format change for 1.5's owner to consider, not this sub-phase's.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/scripts/build-index.ts` | Writes and signs `v1/directory.json` (added dates, removed entries); checks `removed.json` against `OfficialNames`; rejects bad tags |
| `packages/format/src/directory.ts`, `src/stats.ts` | `DirectoryData` schema for `v1/directory.json`; `trending` on summary entries (both additive, published before the site uses them) |
| `packages/cli/registry/removed.json` | New, empty `entries` |
| `stacks-api/apps/web/src/pages/browse/`, `tags/`, `fragments/`, `agents/`, `stacks/[id]/` | The new pages and the removed-stack variant |
| `stacks-api/apps/api/src/stats/trending.ts`, `src/stats/cooccur.ts` | Score and lift |
| `stacks-api/apps/api/src/stats/rollup.ts` | The `cooccur` dimension in the daily step |
| `packages/cli/tests/` and `stacks-api/apps/web/tests/`, `apps/api/tests/` | New, in each repository |
| `AGENTS.md`, `stacks-api/AGENTS.md`, the directory's about text | The views, the trending score and lift in the words above |

## Acceptance tests

- `build:index` over a fixture registry writes a `v1/directory.json` that verifies with the test key and carries the fixture repo's commit dates; the site built over that output has `/browse/newest/` in that order, a tag page per tag, and a fragment page per fragment, each with no `<script>` and the expected copy commands.
- A fixture where `OfficialNames` holds `old-stack` and the registry doesn't: `build:index` fails naming it; with a `removed.json` row it succeeds, the site's `/stacks/old-stack/` carries the notice and the replacement's copy command, and no page contains `new old-stack`. A `replacedBy` naming a missing id fails the build.
- Seeded `window_metrics`: `/` orders stacks by Wilson lower bound with suppressed ones after by name; `/browse/most-used/`, `/browse/highest-success/` match hand-sorted fixtures; ties break by id.
- Trending: `last7 = 12`, `prior28 = 8` gives score `17 / 7`, about 2.43, listed; `last7 = 9` not listed and `trending.suppressed: true`; 12 projects from one install count 3 and don't qualify.
- Lift over a seeded window matches a hand computation; a pair with an effective sample of 4 is not shown.
- `/agents/claude/` lists only stacks with an unsuppressed `claude` breakdown, and contains no other agent's numbers.
- With `STATS_ENABLED` off: the site build writes no `/browse/trending/` or `/agents/claude/` page and makes no stats request, the served paths return the static 404, and `/browse/newest/`, tag, fragment and removed pages are built.
- A `reason` or tag containing `<` in a fixture is escaped or rejected.
- 4.2b's CLI decodes a summary with and without `trending`.

## Exit criteria

- Acceptance tests pass; `bun run check` green from this repository's root and in `stacks-api`.
- One manual deploy (4.0e's deploy procedure) shows every view, and `build:index --check` passes, now covering `v1/directory.json`.

## What this plan may get wrong

- With a handful of stacks, sorted views and trending say little. They are cheap once 4.2a exists, but if the catalog stays small, ship only newest, tags, fragment and removed pages and leave the stats-ordered views unbuilt.
- The trending constants (`+ 5`, the 10-project floor, the 1.5 threshold) are guesses. They are API config, applied when the summary route computes `trending`.
- 2026-10-27: the plan wrote pages from `packages/cli/scripts/site/` and had the Worker render the stats-ordered views. Under D35 every page is in `stacks-api/apps/web`, so this repository now hands the site its git-derived facts as the signed `v1/directory.json`, a contract that didn't exist before. Its schema joins `packages/format`'s additive exports.
- Git commit dates as added dates assume the build runs in a full clone. A shallow clone gives the clone date; the build checks for a shallow repository and fails rather than writing wrong dates.
- An agent page is a ranking of stacks per agent, which some readers will still read as agents compared. Open question 31 is the maintainers' call; if they say no, drop `/agents/*` and keep the stack page breakdown.
