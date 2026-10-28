# R5. Coordinated release and deployed acceptance

Priority P0. Depends on R1, R2, R3, R4, R10 and the EPERM diagnosis from R0. Evidence:
`release.md`. The user runs every command marked "user" (D1); an agent prepares inputs,
checks preconditions and runs the read-only verification.

## Outcome

A clean `npx @steamfield/stacks@<version>` behaves like the tested candidate against the
live API, the live site and API serve the final seed and catalog, and every step has a
recorded rollback.

## Read first

- `stacks-api/docs/operations.md`, all of it ("Production", "How a deploy works",
  "Publishing a new index", "Rolling back").
- `stacks-api/scripts/production.ts` (`deploy`, `seed`, `buildIndex`).
- `plans/phases/phase-1.6c-first-release.md` "Before publishing", "Publishing",
  "After publishing" (the procedure is current except the package name: use
  `@steamfield/stacks`).
- `packages/format/README.md` "Publishing" (already done in R1; R5 reuses that artifact).
- `seed-quality.md` "For R5", `recipe-proof.md`, `web.md`, `contracts.md`.

## Freeze

Before step 1, write this table in `release.md` and don't change any value without
restarting from the step that consumed it.

| Input | Value |
| --- | --- |
| Format version (published in R1) | |
| CLI version (D2) | |
| quickstack release commit (contains R3's ledger record) | |
| stacks-api release commit | |
| CLI tarball sha256 | |
| Seed flags and profile version (from R2) | |
| Production `STACKS_DEMO` (D4) | |
| Previous stacks-api commit deployed (for rollback) | |
| Previous npm `latest` version (for rollback) | |

## Steps

1. quickstack candidate. All R1 and R3 changes merged, and the allowlist review from R4
   step 1 landed (the dependency pages publish those names); `packages/cli/package.json` bumped
   to the CLI version on its own commit. Run the quickstack gate once (`rr check` or
   `bun run check`), record counts. Reuse an earlier gate only if the commit is identical.
   Then `bun run pack` in `packages/cli` and record the tarball digest. The R3 proof must
   still match: re-run R3 step 9 at this commit.

2. stacks-api candidate. `@steamfield/stacks-format` at the R1 version in the catalog and
   `bun.lock` (via `bun install`). All R1, R4 and R10 changes merged. Run `bun run check` (or
   `rr check`) once, record counts. Don't loosen validation to get past drift.

3. Prepare the CLI source checkout the deploy reads. `prod:deploy` and `prod:seed` build the
   hosted index from `$STACKS_CLI_DIR` (set in the user's private settings, see operations.md
   "The private settings"). Before either command:

   ```sh
   git -C "$STACKS_CLI_DIR" status --porcelain   # must print nothing
   git -C "$STACKS_CLI_DIR" rev-parse HEAD        # must equal the quickstack release commit
   ```

4. Rehearse restore before touching production (agent can do this locally). `prod:seed`
   writes a backup to `~/stacks-backups/telemetry-<timestamp>.tgz` on the host but nothing
   restores it. Write this restore procedure into `release.md` and rehearse it against a
   local compose project with a throwaway backup:

   ```sh
   docker compose --project-name stacks-api stop
   cat <backup>.tgz | docker run --rm -i --user 0 --entrypoint sh \
     -v stacks-api_telemetry-data:/data -v stacks-api_telemetry-archive:/archive \
     stacks-api-api -c 'set -e; rm -rf /data/* /archive/*; tar -C / -xzf -; chown -R node:node /data /archive; chmod 700 /archive'
   docker compose --project-name stacks-api start
   ```

   On the host, run the same with `DOCKER_HOST=ssh://<DEPLOY_HOST>` and
   `ssh <DEPLOY_HOST> cat ~/stacks-backups/<file>` as the input. Record the rehearsal result.
   Code rollback is `docs/operations.md` "Rolling back" with the recorded previous commit and
   `bun run prod:deploy`.

5. Seed production (user). Serialize: no deploy runs while this runs. In a shell where
   `STACKS_DB_PATH` and `STACKS_ARCHIVE_DIR` are unset (`env | grep STACKS_` shows neither),
   from the stacks-api release commit:

   ```sh
   bun run prod:seed -- --replace-production-data --profile active --seed <N> --days <D> --through <YYYY-MM-DD>
   ```

   It regenerates locally (budget the R2 step 8 wall time), backs up the host volumes, and
   swaps in `.dev/data/seeded.sqlite`. Record the backup file name it prints.

6. Deploy (user): `bun run prod:deploy` from the stacks-api release commit, with
   `STACKS_DEMO` per D4. It builds the stats pages from the live API, so it must follow
   step 5.

7. Verify from outside the host (agent):

   ```sh
   curl -s https://stacks.steamfield.io/healthz                 # ok, maintenanceFresh true
   curl -s https://stacks.steamfield.io/v1/index.json | jq -r .payload | jq -r .commit
   # must equal the quickstack release commit
   curl -s 'https://stacks.steamfield.io/v1/search?q=python%20api%20with%20a%20react%20dashboard' | jq '.stacks | length'
   curl -s 'https://stacks.steamfield.io/v1/search?q=!!!' | jq '.stacks, .fragments'
   curl -s -o /dev/null -w '%{http_code}\n' https://stacks.steamfield.io/deps/
   ```

   Run R4's post-deploy smoke list from `web.md`. Check `python-react` has `lastRun` in the
   live index. Compare two numbers between the site and the API (a stack's project count on
   its page and in `/v1/stacks/<id>/stats`).

8. Pre-publish CLI check against production (agent): install the packed tarball into an
   isolated prefix with fresh state, so no older search backoff hides the new service.

   ```sh
   export HOME=$(mktemp -d) npm_config_cache=$(mktemp -d)
   npm install -g --prefix "$HOME/p" <tarball>
   "$HOME/p/bin/stacks" search "python api with a react dashboard" --json | jq '.ranking, .remote'
   # "api", "used"
   "$HOME/p/bin/stacks" search "!!!" --json | jq '.noStrongMatch, .next'
   "$HOME/p/bin/stacks" show python-react --json | jq '.lastRun'
   ```

   Then check the fallbacks in the same install: `STACKS_OFFLINE=1 stacks search ... --json`
   reports `remote: "off"`, `remoteReason: "offline"`; `stacks search ... --local --json`
   reports `remoteReason: "local_flag"`; `DO_NOT_TRACK=1` reports `do_not_track`. Each still
   returns local results. (A release build ignores `STACKS_DEV_API_URL`, so it can't be
   pointed at a dead server; the R1 local check covered real API failure.)

9. Publish the CLI (user), following phase 1.6c "Before publishing" and "Publishing" with
   `@steamfield/stacks`: `npm publish --dry-run <tarball>` lists the expected files, then
   `npm publish <tarball>`.

10. After publishing (agent, then user for the tag):
    - integrity: `echo "sha512-$(openssl dgst -sha512 -binary <tarball> | openssl base64 -A)"`
      equals `npm view @steamfield/stacks@<version> dist.integrity`;
    - clean machine: fresh `HOME` and `npm_config_cache`, run the website's prompt commands
      with `npx @steamfield/stacks@<version>` (pinned; an unpinned `npx` can reuse a cached
      0.3.1): `search`, `show python-react`, `new python-react <tmp> --sandbox --no-launch --json`;
    - every stack id the site promotes and every id the intended discovery queries return
      resolves with `show` and `new --dry-run`;
    - the user tags `v<version>` on the release commit and pushes the tag.

11. Supersede old instructions. Add a dated line to `plans/HANDOFF.md` saying "Earlier phase 4
    handoff" items 1 to 4 (redeploy, active seed, local Docker, demo host with
    `STACKS_DEMO=true`) are replaced by this release, and production runs with `STACKS_DEMO`
    per D4.

## Failure handling

| Failure | Action |
| --- | --- |
| Step 7 fails after step 6 | Fix forward with a compatible API change, or roll back code (operations.md "Rolling back") and data (step 4 procedure) |
| Step 8 fails | Don't publish. Fix, re-gate, repack, restart from step 1 for the changed repository |
| A recipe defect appears | Back to R3; new tarball; never edit demo output |
| Published version is broken | Publish a fixed patch version and move `latest`; never unpublish or rewrite a version |

Default telemetry stays off (R8). Remote-index trust stays as it is (R7); don't accept
unsigned remote entries to make anything work.

## Done when

- [ ] Freeze table complete; both gates recorded with counts.
- [ ] Restore rehearsed and documented.
- [ ] Production serves the final seed and catalog; `payload.commit` matches.
- [ ] Packed and published CLI both report `ranking: "api"`, `remote: "used"`; no-match
      returns empty lists with `next`; offline fallback works; integrity matches.
- [ ] Site smoke from `web.md` passes on production.
- [ ] HANDOFF updated per step 11; rollback versions recorded.
