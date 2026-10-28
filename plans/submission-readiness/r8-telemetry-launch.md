# R8. Live telemetry collection

Priority P1, after submission and the R11 freeze. Depends on R6, the reviewed allowlist and
an alert destination. Evidence: `telemetry-launch.md`.

## Outcome

Production collects real CLI telemetry with notice, opt-out, retention and alerts working,
and a CLI release enables it by default.

## Read first

- `stacks-api/apps/api/README.md` "Telemetry launch", "Production acceptance", "Alerts",
  "Telemetry runbook", "Rolling back". This is the procedure for the Node host.
- `plans/phases/phase-4.1e-telemetry-launch-and-runbook.md`: its launch table was written for
  Workers and D1; use its dated "What this plan may get wrong" note for how it maps to the Node
  host, and the API README for the actual steps.
- `plans/phases/phase-4.2d-dependency-telemetry-client-and-ingest.md` acceptance (the
  dependency-v2 production rerun).

## Steps

1. Prerequisites, each recorded with evidence: the user has reviewed the signed allowlist; an
   alert destination exists (R11 step 2 may already have set up the uptime half); notice and
   opt-out text reviewed; storage and archive volumes, retention and restore are as R5 left
   them.
2. Follow the API README's "Telemetry launch" table in order. Its step 1 replaces the seeded
   demo store with an empty one: that ends the demo dataset. Do it only after judging ends,
   and after the user confirms. The user runs every `prod:*` command that writes.
3. Run "Production acceptance" with the release build that will enable collection and write
   `plans/runs/<date>-telemetry-acceptance.md`.
4. Rerun 4.2d's dependency-v2 production check.
5. Confirm source builds and CI runs are still excluded (`config.ts::SOURCE_BUILD`, CI
   detection tests).
6. Publish the enabling CLI release (R5's procedure).

From step 2 on, never run `prod:seed` again: it would overwrite collected usage.

## Done when

- [ ] Every launch-table check passed, with evidence.
- [ ] A test alert reached its owner.
- [ ] Notice and opt-out work in the published client.
- [ ] The enabling CLI version is published and recorded.
