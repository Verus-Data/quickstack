# R11. Judging-window freeze, monitoring and fallback kit

Priority P0. Depends on R5; finish before submission. Evidence: `operations.md` (in the
runs folder, not `stacks-api/docs/operations.md`).

## Outcome

Between submission and the end of judging, the live site, API and npm package stay up
and unchanged, someone hears about an outage quickly, and the live demo can run without
the network.

## Read first

- `stacks-api/docs/operations.md` ("When something is wrong", "Rolling back") and
  `stacks-api/apps/api/README.md` ("Telemetry runbook", "Alerts").
- `submission.md` (judging dates, live table or not), `release.md` (versions, rollback).

## Steps

1. Freeze. Record in `operations.md` the judging window (start and end with timezone, from
   `submission.md`). During it: no `prod:deploy`, no `prod:seed`, no npm publish or dist-tag
   change, no repository visibility or default-branch change. The only exception is a fix for
   an outage, decided by the user, using the rollback steps in `release.md`. Add one dated line
   to `plans/HANDOFF.md` and to `stacks-api/AGENTS.md`'s top section announcing the freeze and
   its end date, so other agents see it. Remove those lines when the window ends.

2. Monitoring. Production runs on a single Docker host behind a Cloudflare Tunnel
   (operations.md "Production"), so host, network or tunnel loss takes it down.
   `apps/api/README.md` "Alerts" already specifies an external uptime check polling `/healthz`
   every 5 minutes and alerting on a non-200 or `maintenanceFresh: false`, with no destination
   chosen yet. Set that up now, with the destination the user picks (an uptime service they
   already use, configured by them, or a scheduled `curl -fsS` from another machine). Record
   the settings in that README section, and test it once against a path that 404s.

3. Host resilience checks (user, on the host): the container restart policy brings the API
   back after a reboot (`docker inspect` the restart policy; reboot once if acceptable), the
   tunnel service starts on boot, and the host won't sleep. Record results.

4. Load. Judges and their agents may run searches. Confirm the API's rate limit on search
   (see `apps/api/tests/search-rate-limit.test.ts` for the configured limit) is high enough for
   a room of people behind one NAT address; record the limit and whether it's per-IP. Raise it
   only with the user's agreement and a test.

5. Offline fallback kit for a live table (only if `submission.md` says there is one), kept on
   the demo machine and checked the day before:
   - the published CLI tarball from R5 and `npm install -g <tarball>` tested with networking off;
   - the API and site running locally from the stacks-api release commit with the
     `r2-full` store (`bun run dev:stats` with the R2 paths), and the CLI's `STACKS_OFFLINE=1`
     path shown as the fallback (the release CLI can't point at a local API);
   - the recorded video stored locally;
   - a pre-scaffolded and verified copy of the demo project, plus the uncut agent session.
   Rehearse switching to the kit in under two minutes and record the time.

6. Post-window. When judging ends, lift the freeze lines and note it in HANDOFF; R8 and R9 can
   then deploy.

## Done when

- [ ] Freeze window recorded and announced in both repositories.
- [ ] Monitoring set up and tested once.
- [ ] Host restart and tunnel checks recorded.
- [ ] Rate limit reviewed and recorded.
- [ ] Fallback kit checked and the switch rehearsed (or recorded as not needed).
