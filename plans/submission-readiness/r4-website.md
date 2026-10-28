# R4. Website decision and handoff gaps

Priority P0. Depends on R0; final QA needs an R2 sample store. Evidence: `web.md`. Works
in `stacks-api/apps/web` and `stacks-api/scripts/production.ts`.

## Outcome

The site exposes dependency pages, has correct canonical URLs, recovers from clipboard
failure, and gives someone choosing a recipe a short path to the filtered catalog. It
closes on a local production-like build; the deployed smoke is R5's.

## Read first

- `stacks-api/.claude/rules/web/astro.md`, `.claude/rules/web/styling.md`,
  `.claude/rules/workspace/testing.md`, `.claude/rules/workspace/verification.md`,
  `apps/web/README.md`, the relevant mock in `stacks-api/mocks/`.
- `stacks-api/docs/specs/2026-10-28-directory-decision-flows-rfc.md` (Accepted), especially
  "Acceptance checks" (lines 144-158). That table is this task's checklist.
- `stacks-api/docs/operations.md` "Production".
- Code: `apps/web/astro.config.mjs`, `apps/web/src/site-config.ts`,
  `apps/web/src/data/read-deps.ts`, `apps/web/src/islands/HomeExplorer.tsx`,
  `apps/web/src/islands/Directory.tsx`, `apps/web/src/pages/deps/`.
- Check R0's worktree inventory first: the Codex `ux-browse-flow` and `ux-handoff-flow`
  worktrees touched these files. Confirm their work is on `main` (it appears to be:
  commits `b74a7e9`, `0f3d6ea`) before editing.

## Steps

1. Dependency pages in production. In `scripts/production.ts` (around line 171), add
   `DEPS_ENABLED: "true"` to the env of the stats pass only (the `deploy.ts` run that sets
   `STATS_ENABLED`). Not the `--without-stats` pass: `read-deps.ts` needs `STATS_API_URL` and
   the signed allowlist and throws without them. Update `docs/operations.md:56` to say
   production has dependency pages. Add or extend a test in `tests/deploy.test.ts` that
   asserts the stats pass sets `DEPS_ENABLED`.

   The dependency pages publish the package names in the signed allowlist
   (`quickstack/packages/cli/registry/allowlist.json`). Phase 4.2e left reviewing those names to
   the maintainers, and it hasn't happened. Ask the user to review the list before R5 deploys
   with `DEPS_ENABLED`; record the review date in `web.md`. Changes to the list are a quickstack
   commit that must land before the R5 release commit.

1a. Close 4.2f and 4.2c's stats views. Both phases are still `IN PROGRESS`. Their browser
   acceptance tests (`apps/web/tests/browser/stats.spec.ts` and the fixtures under
   `apps/web/tests/fixtures/stats/`, 4.2b's site tests 10 and 11 among them) exist only on the
   unmerged branch `delegate/t-4.2f` (commit `0b6c6e5`, written before the forest-and-lime
   redesign). On a branch from `main`, bring them over (`git checkout delegate/t-4.2f -- <paths>`)
   and run `bun run test:browser apps/web/tests/browser/stats.spec.ts`. For each failure, decide
   one of three: the page is wrong (fix the page), the selector or copy moved in the redesign
   (update the test's expectation, keeping the behavior it checks), or the accepted design
   superseded the item (cite the commit or spec and drop that case, listing it in `web.md`).
   Never weaken an assertion to pass. Once it's green, add dated lines to
   `plans/phases/phase-4.2f-stats-pages-and-charts.md`, `phase-4.2c-directory-browsing.md` and
   `phase-4.2b-stats-in-cli-and-directory.md`, and set 4.2f and 4.2c to `EXECUTED`.

2. Canonical origin. Change `site` in `apps/web/astro.config.mjs:135` to
   `https://stacks.steamfield.io`. This reverses the "Deferred" note in
   `stacks-api/AGENTS.md` ("The canonical site URL stays `https://example.com` until a domain is
   chosen"); update that sentence in the same commit. Update expectations, not assertions, in
   tests that pin the old origin: `tests/deploy.test.ts`,
   `apps/web/tests/browser/handoff.spec.ts`, `apps/web/tests/helpers/directory-resources.ts`,
   `apps/web/fixtures/catalog.json` (find others with
   `grep -rn "example.com" apps/web tests --include=*.ts --include=*.json --include=*.astro`).

3. Clipboard failure. In `HomeExplorer.tsx` (and any other copy button found by
   `grep -rln clipboard apps/web/src`), when `navigator.clipboard.writeText` rejects or is
   missing: open the prompt's disclosure, select its text, and announce it through an
   `aria-live` region ("Copy failed. The prompt is selected; press Cmd+C or Ctrl+C.").
   The full and sandbox prompt chosen must be the one shown. Add a component test with a
   rejecting clipboard (`HomeExplorer.test.tsx`) and a browser test in `handoff.spec.ts`
   that denies clipboard permission.

4. Path to the filtered catalog. From the home page's primary flow, a person choosing a
   recipe reaches the purpose/tag-filtered stack list in one click, without passing through
   analytics views. Use existing pages and navigation (`browse/`, the nav links); no new
   search UI or comparison builder. Keep filter, sort and Back behavior (existing
   `browse-flow.spec.ts` must still pass).

5. Local production-like build against the R2 sample (closes this task without deploying):

   ```sh
   # stacks-api; the index from R2 step 1 and the R2 sample store
   STATIC_DIR=<index> STACKS_DB_PATH=.dev/data/r2-sample.sqlite \
   STACKS_ARCHIVE_DIR=.dev/data/r2-sample-archive PORT_API=<free port> bun run dev:stats
   # second terminal
   STATS_ENABLED=true DEPS_ENABLED=true STATS_API_URL=http://127.0.0.1:<port> \
   STACKS_INDEX_DIR=<index> STACKS_INDEX_PUBLIC_KEYS=<keys used for that index> \
   bun run --cwd apps/web build
   ls apps/web/dist/deps/index.html
   ```

   Use `free-port 4400` to pick a port. If the unsigned index needs different key handling
   for the site reader (HANDOFF notes `read-directory.ts` requires signatures), record what
   you did. Serve `apps/web/dist` (`bunx serve apps/web/dist` or the API's static serving) and
   walk the pages.

6. Acceptance walkthrough. For each row of the spec's "Acceptance checks" table, record pass
   or fail, how you checked it, and which browser spec covers it
   (`bun run test:browser --grep "<name>"`). Add the missing browser specs for
   `/deps/` (index, a scoped package such as `@types/node`, a suppressed package's empty
   state, links back to recipes) in `dependency-discovery.spec.ts`.

7. Accessibility on these journeys: visible focus on every interactive element, accessible
   names on buttons and links, keyboard-only completion of copy and filter, charts have
   their data tables reachable, layout fits a 390-pixel viewport with no horizontal scroll,
   and core content and prompt text work with JavaScript disabled. Record each.

## Must not

- Manufacture adoption or drop rates or denominators the API doesn't publish.
- Redesign the visual system.
- Deploy (R5, user only).

## Done when

- [ ] Steps 1 to 4 landed with tests; scoped web tests and the touched browser specs pass.
- [ ] The user reviewed the allowlist names (date recorded).
- [ ] `stats.spec.ts` is on `main` and green, every dropped case is listed with its reason,
      and phases 4.2f and 4.2c are marked `EXECUTED`.
- [ ] The local build has `/deps/` and the selected detail pages, and the R2 scenarios
      render (expected versus observed recorded).
- [ ] Every row of the spec's acceptance table is recorded as pass with how it was checked.
- [ ] Step 7's checks are recorded.
- [ ] `web.md` lists the post-deploy smoke for R5: `/`, `/deps/`, one stack, one fragment,
      one scoped dependency, canonical tags, every copied command on the home page.
