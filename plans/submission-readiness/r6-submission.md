# R6. Recorded demo, reconciled plans and submission

Priority P0. Depends on R5; preparation (reading organizer rules, drafting the script)
can start after R0. Evidence: `submission.md`. The user performs the external submission.

## Outcome

A recording that fits the organizer's rules shows the released CLI taking a request to a
verified, working starter, and every link a judge will click works signed out. The plans
and product docs say what is true after the release.

## Read first

- `submission.md` from R0 (scope and organizer table).
- `product/DEMO_OUTLINE.md`, `product/PITCH.md`, `product/PREP.md`.
- `release.md` (published versions and the install command).

## Steps

1. Prerequisites. Every organizer unknown in `submission.md` is resolved. D5 (Rho) is
   decided. If an organizer rule is still unknown, stop and ask the user.

2. Reconcile the demo docs with the recorded scope. `DEMO_OUTLINE.md` line 17 mentions an
   optional Rho example and line 70 shows plain `stacks verify`; `PREP.md` section 5 also shows
   `stacks verify`. Change the commands to `stacks verify --all` and align the Rho mention
   with D5. Change only lines that differ from the scope; keep the rest.

3. Rehearse once, end to end, exactly as it will be recorded:
   - fresh `HOME` and `npm_config_cache`, a new empty directory outside both repositories;
   - `npx @steamfield/stacks@<version>` (pinned, from `release.md`), or the site's prompt
     pasted into the agent, matching what the site shows;
   - the agent searches in the developer's words, explains its pick and one tradeoff, runs
     `show`, scaffolds with `--sandbox`, reads `.stacks/BRIEF.md`, builds the R0 app, runs
     `stacks verify --all` until green;
   - inspect the behavior test (same check as R3 step 6) and run the app once to show it
     working.
   Record agent, model, wall-clock scaffold time, time to first full green, verify runs and
   interventions. An unexpected skipped step in the `--all` run, or an unresolved
   implementation omission, fails the rehearsal: go back to R3.

4. Changed-command refusal: in a disposable copy of the project (`cp -R`), edit one verify
   command in the manifest, run `stacks verify`, capture the `VerifyChanged` refusal, and
   label it as a controlled example. Never do this in the project shown as the result.

5. Record. Keep the uncut session and footage. Label sample data, any speedup and any
   prebuilt portion as `PREP.md` section 8 says. Fit the organizer's length limit.

6. Links. From a signed-out browser session, open: the video link, the live site, the npm
   package page, each repository link the submission gives (per D6 and R10), and any doc
   link. Record each URL and its status.

7. Reconcile plans (after recording):
   - `plans/HANDOFF.md`: replace "Submission queue" with the current state and a link to this
     folder; move dated detail older than this release to `plans/archive/`.
   - `plans/README.md`: update status lines; add any decisions made here (D1 to D9) to the
     decisions log if they are lasting.
   - Phase files touched by R1 to R5 (4.2g, 4.5c, 4.5e, 4.2e, 4.2f, 4.0e, 1.6c): add a dated
     line each with what this release did.
   - `stacks-api/docs/product/README.md` and `stacks-api/AGENTS.md`: live versus planned, the
     canonical URL change.
   - `product/PROBLEM_STATEMENT.md`: update implementation facts only, then refresh
     `stacks-api/docs/product/problem-statement.md` from it. Keep its hypotheses as
     hypotheses: one run doesn't prove canaries, community adoption or longitudinal claims.

8. Hand off the submission. Write in `submission.md` the final text for each form field the
   organizer asks for, the links, and the reproduction commands. The user submits.

## Done when

- [ ] The rehearsal and the recorded run both pass with `--all`, with metrics recorded.
- [ ] The video fits every recorded organizer limit.
- [ ] Every link in step 6 works signed out.
- [ ] The demo can be repeated by someone else from the commands in `submission.md`.
- [ ] Plans and product docs are reconciled per step 7.
- [ ] Every P0 row in the tracker is `Done` with linked evidence.
