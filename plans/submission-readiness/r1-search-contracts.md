# R1. Compatible search and clear agent contracts

Priority P0. Depends on R0, D2 (versions) and D3 (`/v1/search` in place). Evidence:
`contracts.md`. Touches both repositories.

## Outcome

An agent using only the CLI's help, guide and JSON output can find a stack, read what the
evidence means, and recover from no match or an API failure. The API, the format package
and the CLI agree on one wire shape, published in format 0.5.0 (D2).

## Read first

- `quickstack/AGENTS.md` (search architecture paragraph), `packages/format/README.md`
  ("Publishing", "Picking up a release in stacks-api").
- Phases `plans/phases/phase-4.5c-search-command-and-local-ranking.md` and
  `phase-4.5e-search-endpoint.md`, including their dated lines.
- `stacks-api/.claude/rules/api/http-contract.md`, `stacks-api/.claude/rules/api/effect-api.md`,
  the `effect` and `rest-api` skills in `stacks-api/.claude/skills/`.
- Code: `packages/format/src/search/{schema.ts,rank.ts}`,
  `packages/cli/src/core/search/{remote.ts,input.ts,run.ts,merge.ts,report.ts}`,
  `packages/cli/src/core/show.ts` (`sameContent`, `indexSameContent`),
  `packages/cli/src/core/guide.ts`, `packages/cli/src/commands/search.ts`;
  `stacks-api/apps/api/src/handlers/search.ts`, `apps/api/src/services/Search.ts`,
  `packages/contract/src/{errors.ts,groups/search.ts,schemas/search.ts}`,
  `apps/api/src/stats/selection.ts` (how stats fills `BadInput` details).

## Order of work

Format changes come first, because the API can only consume a published format version.

1. Format and CLI changes (quickstack), steps 1 to 4 below.
2. Gate quickstack, then the user publishes format 0.5.0 (D1). The CLI is not published
   here; that's R5.
3. API changes (stacks-api) against the published 0.5.0, step 5 and the API half of 1 to 3.
4. Local end-to-end checks (see "Done when").

## Steps

1. Bring the API to the current format. In `stacks-api`, confirm `@steamfield/stacks-format`
   resolves to 0.4.0 (`bun pm ls | grep stacks-format`). The positive-hit ranking and the
   stats evidence in `Search.ts` already landed (HANDOFF, commit `f8426a4`); reuse them, don't
   reimplement. Required behavior, with a test for each in `apps/api/tests/search-results.test.ts`
   or `search-evidence.test.ts`:
   - a query with no candidate that has a positive explained match returns empty `stacks` and
     `fragments` and `noStrongMatch: true` (use `!!!` and a nonsense word like `zzqxv`);
   - partial matches still return, with `tier: "partial"`.

2. Add a content-match indicator to search evidence (format, then CLI, then API).
   - Format (`packages/format/src/search/schema.ts`): in `SearchEvidence`, give `lastRun` an
     optional `sameContent: boolean` the same way `show` reports it. Missing means unknown.
     Mirror the field in the columnar `ResponseEvidence` so it survives the API encoding;
     update `format/tests/search-shared.test.ts` round-trip cases.
   - Ranking (`packages/format/src/search/rank.ts::quality`): today any `lastRun.result ===
     "pass"` adds `0.02`. Change it so the pass bonus applies only when
     `lastRun.sameContent === true`; a fail keeps `-0.02`; unknown gets 0. Add cases to
     `format/tests/` for true, false and missing.
   - CLI: for local and bundled candidates, compute `sameContent` with the same function
     `show` uses (`show.ts::indexSameContent` or the shared helper behind it). Don't write a
     second comparison. Test in `packages/cli/tests/search-ranking.test.ts` that editing a
     fragment the stack depends on (not just the stack) flips `sameContent` to false.
   - API: forward `lastRun` from the index entry when present, with `sameContent` absent
     (unknown), so it gets no bonus. Never invent a run when the entry has none. Never
     compare an entry's bundle digest with a run fingerprint, and never import CLI
     composition into the API. Publisher-attested `sameContent` is R7.
   - Guide: `guide.ts` line 14 says "if neither has stats, prefer the more recent `lastRun`".
     Change it to prefer a `lastRun` with `sameContent: true`, and to treat other runs as
     history. Update `packages/cli/tests/guide.test.ts`.

3. Keep usage stats and recipe proof separate.
   - API search hits already carry `stats` from the published summary; confirm a suppressed
     stack has no `stats` key (not zeros) in `search-evidence.test.ts`.
   - Add `description` annotations to the format schema's `stats` fields saying they are
     aggregate outcomes across all projects of that stack in a 7- or 28-day window, not a
     success rate for a particular preset or fragment selection. Don't add a population field
     (labeling is out of scope).
   - Add one guide sentence with the same meaning.

4. Make the CLI teach one loop and recover from no match.
   - `guide.ts`: put `search` in `guideCommands` and in `helpFooter`. The prose, footer and
     structured list must all teach search, then show, then new, then verify; keep `list` as
     the browse and recovery path. Update `help.test.ts` and `guide.test.ts`.
   - No-match next action: add an optional `next: string[]` to format `SearchResult`, filled
     only when `noStrongMatch` is true, with concrete commands (for example
     `stacks list --json` and `stacks search "<fewer words>" --json`). Model the wording on the
     existing `Next:` lines in `packages/cli/src/core/list-report.ts::nextLines` and the `next`
     field of the CLI's JSON error envelope (`grep -rn "next" packages/cli/src/errors*`). Print the
     same lines in human output (`search/report.ts`). An empty result still exits 0.
   - Fallback must be visible: when ranking falls back to local, JSON already carries
     `ranking: "local"` and `remote`/`remoteReason`; make sure the human report prints one line
     saying results are local and why. Test both in `search-api-ux.test.ts`.

5. Actionable API errors (stacks-api) and CLI handling of them.
   - `handlers/search.ts` returns `new BadInput({})` for any bad `q`. Return
     `details: { parameter, value, expected }` as `stats/selection.ts` does. For `q`, set
     `value: ""` so the search text is never echoed (the schema requires a string), and
     `expected` like `"1 to 500 characters after trimming"`. For `kind` and `limit`, echo the
     bad value and the allowed set or range. Unknown query keys: check what the contract
     does today (`search-errors.test.ts`) and make it a 400 with the key named in `parameter`.
   - Express the `q`, `kind` and `limit` constraints in the contract schema
     (`packages/contract/src/groups/search.ts`) so OpenAPI shows them; run the contract tests.
   - Never log the search text in error paths (`search-errors.test.ts` should assert this
     with a log capture, matching how existing privacy tests do it).
   - CLI (`packages/cli/src/core/search/remote.ts:50,67-81`): today any non-200 writes a
     10-minute backoff. A 400 means our request was bad, not that the service is down: on 400,
     fall back to local for this call, report `remoteReason` accordingly, and do not write a
     backoff. Mirror the API's `q` limit (500 code points after trim) in
     `commands/search.ts` so the CLI rejects too-long input itself with a usage error. Keep the
     800 ms deadline, opt-outs and backoff for real failures.

6. Record D3. If R0 showed no released consumer of `/v1/search`, write in `contracts.md`:
   "`/v1/search` changes in place because no released client consumes it", with the R0
   evidence. Otherwise stop and ask the user before changing the route.

7. Update `plans/roadmap.md`'s shared-contract table with every field added here.

## Must not

- Change a field's type in place without D3 recorded.
- Run the API against a checkout alias of the format package to close this task.
- Publish anything (D1).

## Done when

- [ ] quickstack scoped tests pass: `format/tests/search-*.test.ts`,
      `cli/tests/search-*.test.ts`, `guide.test.ts`, `help.test.ts`.
- [ ] quickstack gate passed on the candidate commit (counts recorded), and the user
      published format 0.5.0; `npm view @steamfield/stacks-format version` shows it.
- [ ] stacks-api takes `^0.5.0` via `bun install` (lockfile regenerated, never hand-edited), and
      its scoped search and contract tests pass.
- [ ] Local end to end, pre-deploy, with `bun run dev:bg` running in stacks-api (check the
      port with `bun run dev:status`), from quickstack with a source build:

      ```sh
      STACKS_DEV_API_URL=http://127.0.0.1:<port> bun run dev search "python api with a react dashboard" --json
      STACKS_DEV_API_URL=http://127.0.0.1:<port> bun run dev search "postgres auth for a saas" --json
      STACKS_DEV_API_URL=http://127.0.0.1:<port> bun run dev search "!!!" --json
      STACKS_DEV_API_URL=http://127.0.0.1:<port> bun run dev search "go cli" --json
      ```

      Each shows `ranking: "api"`, `remote: "used"`; the strong query's top hit fits; the
      nonsense query has empty lists, `noStrongMatch: true` and `next`; suppressed stats are
      absent, not zero.
- [ ] With the API stopped (`bun run dev:stop`), the same commands return local results with
      the fallback line and no crash; after restarting, a fresh state directory gets `api`
      again (a stale backoff must not hide recovery).
- [ ] `curl` checks for 400s: empty `q`, 501-character `q`, `kind=bogus`, `limit=0`,
      `limit=1000`, an unknown key. Each names the parameter and expected form; the `q`
      responses have `value: ""`.
- [ ] Matching, changed and unknown `sameContent` are distinguishable in CLI JSON; a
      local override of a bundled id still wins (`merge.ts` test).
- [ ] A fresh agent given only "use the stacks CLI to pick a stack for <request>" finds
      `search` from `stacks --help` or `stacks guide` (record the transcript excerpt).
- [ ] The packed-CLI-against-production check is listed in `release.md` as R5's job.
