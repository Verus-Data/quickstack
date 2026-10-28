# R2. Realistic active seed with a quality report

Priority P0. Depends on R0. Evidence: `seed-quality.md`. Works in `stacks-api`.

## Outcome

The seeded history supports believable decisions on the site and in search: popular and
sparse stacks, dependency pages with real-looking data, failures at more than one step,
repeat projects. Publication thresholds don't change. The report records the exact flags
R5 will use to regenerate the same data in production (D7).

## Read first

- `stacks-api/docs/telemetry.md` (seed section) and `plans/phases/phase-4.2g-seed-telemetry.md`
  with its dated lines.
- Code: `stacks-api/scripts/seed/{index.ts,profile.ts,events.ts,simulate.ts,input.ts}`.
- Tests: `stacks-api/apps/api/tests/seed-active-profile.test.ts`, `seed-dependencies.test.ts`,
  `seed-profile-regressions.test.ts`, `seed-acceptance.test.ts`.
- The accepted spec `stacks-api/docs/specs/2026-10-28-directory-decision-flows-rfc.md`
  ("Separate data work": don't manufacture denominators).

## Ground rules

- Never write `.dev/data/seeded.sqlite`, `.dev/data/active.sqlite` or their archives. Use
  `STACKS_DB_PATH=.dev/data/r2-<name>.sqlite STACKS_ARCHIVE_DIR=.dev/data/r2-<name>-archive`
  on every seed command. The in-flight active run belongs to another session (R0 step 4).
- Generation stays offline. Version facts come from a reviewed fixture file, never from a
  network call at generation time.
- Extend the active profile. Don't create a second seeding system.
- Every distribution change bumps `activeProfile.version` (`"active-3"` today; next is
  `"active-4"`).
- Always pass `--through <YYYY-MM-DD>` explicitly. The default is yesterday, which makes a
  run on another day different.

## Steps

1. Build the index input once (quickstack, `packages/cli`):

   ```sh
   bun run build:index --out <scratch>/r2-index --previous none --unsigned --include-unproven
   ```

2. Bounded baseline sample (stacks-api), before any change, to measure what's wrong:

   ```sh
   STATIC_DIR=<scratch>/r2-index STACKS_DB_PATH=.dev/data/r2-base.sqlite \
   STACKS_ARCHIVE_DIR=.dev/data/r2-base-archive \
   bun run seed --profile active --seed 1 --days 21 --through 2026-10-27
   ```

   `--days` is the only size knob. Record wall time. Serve it with
   `STATIC_DIR=... STACKS_DB_PATH=... STACKS_ARCHIVE_DIR=... PORT_API=0 bun run dev:stats`
   and record the counts in the table under step 4.

3. Make the changes below. Each has a scoped test in the listed file.

   | Gap | Change | Test file |
   | --- | --- | --- |
   | Dependency majors are hash-generated (`scripts/seed/events.ts:308-329`) | New `scripts/seed/dependency-majors.ts`: for each seeded package, the plausible majors and the dated upgrade edges between them. Source it once by hand with `npm view <pkg> versions --json`, record the date in a header comment, and ask the user to review the file before it lands. Events pick majors only from it | `seed-dependencies.test.ts` |
   | Dependency evidence nearly all suppressed | Raise how many projects report each common package using the existing population and eligibility rules; keep a sparse tail | `seed-dependencies.test.ts` |
   | Failures concentrate on install | Choose the failing step by weight over the steps the manifest actually has, using phase/layer metadata from the index; a setup failure skips later steps | `seed-profile-regressions.test.ts` |
   | Every verify is full and unchanged | Add deterministic cohorts: environment-blocked, partial (`--only`), changed-step refusal (no steps executed), failed-then-green retry. Each must pass ingest validation as it is today | `seed-acceptance.test.ts` |
   | Every project is a new install | A stable install cohort that creates several projects over time; the per-install cap and maturity rules apply, no bypass | `seed-active-profile.test.ts` |
   | Timings and histories can disagree | Events per project are ordered: first test at or before first green, cumulative durations add up, skipped steps are consistent, repeat reports keep project identity | `seed-profile-regressions.test.ts` |

   Keep the existing rising, falling, new-entry and regression/recovery stories, agent and
   preset variation, weekday effects and the no-verify cohort. Don't make every metric
   publish or every stack succeed.

4. Re-run the bounded sample with the new profile (`r2-sample` paths) and fill this table in
   `seed-quality.md` from the API (`curl` the routes under `/v1/stats`, `/v1/stacks/<id>/stats`,
   `/v1/fragments/<id>/stats` and the deps routes). Thresholds are the acceptance bar.

   | Measure | Threshold |
   | --- | --- |
   | npm packages with publishable (unsuppressed) counts | at least 5, including `react` and one scoped package |
   | Packages still suppressed | at least 1 |
   | Distinct failing step kinds across selected stacks | install, test and at least one other present |
   | Share of failures at install | under 60% |
   | Installs with 2 or more projects | at least 5% of installs |
   | Projects violating ordering (first green before first test, negative durations) | 0 |
   | Majors not in `dependency-majors.ts` | 0 |
   | Stories visible: one rising, one falling, one new, one regression then recovery | all 4, named |
   | `anomaly_flags` rows | 0 |

5. Inspect the website against the sample. Build the site against the served sample as in
   [R4](r4-website.md) step 5, and look at: a popular stack, a sparse stack, the regression
   story's stack, one fragment, `/deps/` and the five dependencies from step 4. For each,
   write expected versus observed in one line.

6. Determinism. Run the same command twice into two new paths; compare
   `sqlite3 -readonly <db> "select count(*) from events"` and the API summary JSON
   (`diff <(curl ...) <(curl ...)`). They must match.

7. Integrity. Confirm the existing tests that feed deliberately invalid events still reject
   them (`bun run test apps/api/tests/seed-recovery-acceptance.test.ts`); add a case only if
   a new cohort introduces a new event shape.

8. Full-profile rehearsal. Once the R3/R5 catalog is final (the CLI release commit is known),
   rebuild the index from that commit and run the full active profile into `r2-full` paths
   with the same `--seed`, `--days 120` and an explicit `--through`. Record wall time. If it
   takes more than about 90 minutes, profile first: the 4.2g dated lines describe the
   incremental integrity and bounded rollup work (commit `83d5d07`); measure before changing
   anything.

9. Local container health. With the `r2-full` store, run the Docker stack as
   `docs/operations.md` "Commands" describes (`bun run deploy` locally or
   `docker compose up --build` with the store in the `/data` volume), then check
   `curl -s localhost:<port>/healthz` shows `maintenanceFresh: true` after one maintenance
   cycle, and that data survives `docker compose restart`.

10. Write the production flags. In `seed-quality.md`, under "For R5", write the exact
    arguments: `--profile active --seed <N> --days <D> --through <YYYY-MM-DD>` and the
    profile version. R5 passes these to `prod:seed`.

## Must not

- Lower a publication or suppression threshold to make a number appear.
- Replace or write the production database (that's R5, run by the user).

## Done when

- [ ] Scoped seed tests pass, including new cases for each row of step 3.
- [ ] The step 4 table meets every threshold, with numbers.
- [ ] Step 5's walkthrough has expected versus observed for each page.
- [ ] Repeat generation is identical (step 6) and integrity rejects invalid events (step 7).
- [ ] The full-profile rehearsal completed with recorded wall time, and container health is
      green (steps 8 and 9).
- [ ] `seed-quality.md` lists the R5 flags and the profile version.
