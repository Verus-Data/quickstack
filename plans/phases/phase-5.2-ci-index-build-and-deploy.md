# Phase 5.2: CI index build and deploy

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Every green merge to `main` rebuilds the registry index, the entry bundles and the directory pages, signs the index, the names file and the allowlist in CI with the Ed25519 key held as a deploy secret, and deploys them and the API, behind a switch the maintainers turn on, so official stacks reach users without a maintainer at a keyboard |
| Traces to | "Stacks don't rot: A stack that passed last month still passes this month without a prose change", made visible to agents through the index; "A community registry will form ... no public registry exists yet" |
| Depends on | [4.0c](phase-4.0c-registry-index.md) (the local build, inline signing and deploy), [4.0e](phase-4.0e-official-names-and-directory.md) (the signed names file and the directory pages), [4.0d](phase-4.0d-cli-remote-origin.md) (the CLI's compiled public key and signature check), [5.0](phase-5.0-ci-release-and-checks.md) (workflow conventions, `ci-ok` as the gate). The API package from [4.0b](phase-4.0b-api-skeleton-and-hosting-spike.md) and, if they have landed, telemetry from [4.1b](phase-4.1b-telemetry-ingest-and-storage.md) and [4.1c](phase-4.1c-telemetry-maintenance-and-retention.md), the ingest smoke script from [4.1e](phase-4.1e-telemetry-launch-and-runbook.md) (soft: used when it has landed) and the signed allowlist from [4.2d](phase-4.2d-dependency-telemetry-client-and-ingest.md) |
| Blocks | Nothing |
| Decisions needed | D21 (the signed index). If it were dropped, this sub-phase deploys unsigned and the key handling below goes away. D16 (hosting): the deploy command and the host secret depend on it; this file assumes whatever 4.0b recommended and 4.0c's manual deploy uses. D23 (why this is phase 5) |
| Settles | When CI deploys, where the signing key lives, how a stale run is kept from overwriting a newer deploy, and how a key mismatch is caught before users see it |

## Scope

Where this fits: by the time this starts, a maintainer can already do all of this by
hand. 4.0c's local build script reads `packages/cli/registry/` and the ledger, runs
`validate`, writes the static, content-addressed index, the entry bundles and the
directory page (4.0e), signs every signed file inline with a key kept off the repo, and deploys with the host's
command (D16). 4.0d's CLI verifies that signature against the public key compiled into it
(see [trust model point 7](../roadmap.md#trust-model)). 4.0b's API (and 4.1b and 4.1c's
routes and scheduled entry, if present) deploys with the same command. This sub-phase only
moves those steps into a workflow and the private key into a deploy secret. It changes no
build, signing or CLI code; a gap it finds goes back to 4.0c or 4.0d. Siblings: 5.0 adds
the release workflow and extra CI jobs; 5.1 schedules canary runs, whose ledger PRs, once
merged, trigger this deploy.

In:

- `.github/workflows/deploy.yml`: build on every green `main`, sign and deploy when the
  maintainers enable it.
- The Ed25519 private key as an environment secret (D21, trust model point 7).
- A pre-deploy check that the signature verifies against the CLI's compiled public key.
- A post-deploy smoke check against the live host.
- Applying 4.1b's checked-in SQL migrations before the API deploys, if 4.1b has landed.
- `AGENTS.md` and the deploy procedure 4.0c and 4.0e wrote.

Out:

- The build, the index and bundle formats, the canonical bundle digest, signing code and
  the public key: 4.0a, 4.0c and 4.0d own them.
- Key rotation tooling. Rotation needs a CLI release carrying the new public key, which
  4.0d owns; this file documents only where the secret is replaced.
- Preview deploys for PRs.
- Deploying anything not on `main`.

## Design

### Trigger and gate

```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
  workflow_dispatch: {}
permissions:
  contents: read
concurrency:
  group: deploy
  cancel-in-progress: false
```

The deploy runs only after the `CI` workflow finished on `main` with conclusion
`success` and event `push`, so a red `main` never deploys and `ci-ok`'s checks are the
gate. It checks out `github.event.workflow_run.head_sha`, not the branch tip.

Decided here: `workflow_run` instead of a job inside `ci.yml`, so the deploy secrets live
in a separate workflow that never runs on pull requests.

### Jobs

`build` (`ubuntu-latest`, `contents: read`, no secrets):

1. Checkout `head_sha` with full history and tags (`fetch-depth: 0`), because 4.0e's
   `v1/names.json` reads every release tag; setup-node from `.node-version`, setup-bun,
   `bun run install:ci`.
2. Run 4.0c's build script unchanged with `--unsigned` and
   `--previous https://<host>/v1/index.json`. It refuses to build when `validate` reports
   an error, and the previous deploy stays live.
3. Upload the output directory (index, names file, allowlist when 4.2d has landed,
   bundles, directory pages) and the built API as an artifact. This artifact is unsigned
   and is never deployed: it is the reviewable result, and the whole output when deploys
   are off.

`deploy` (`needs: build`, `if: vars.DEPLOY_ENABLED == 'true'`, `environment: production`):

1. Stale-run guard: fetch `origin/main` and skip (success, with a notice) unless
   `head_sha` is still its tip. A slow run for an older commit never overwrites a newer
   deploy.
2. Checkout `head_sha` with full history and tags, setup-node, setup-bun,
   `bun run install:ci`, and build the API.
3. Build and sign: 4.0c signs inline in the build, so the deploy job runs the build once
   more, signed. One step writes the `INDEX_SIGNING_KEY` secret to a file in
   `$RUNNER_TEMP` with mode 600 (from the environment, never on a command line, never
   echoed); the next runs
   `bun run --cwd packages/cli build:index -- --out <dir> --previous https://<host>/v1/index.json --key <that file>`;
   a step with `if: always()` deletes the file whatever happened before it. This signed
   output is what deploys.
4. Verify before deploy: check the signature of every signed file in the output,
   `v1/index.json`, `v1/names.json` and, once 4.2d has landed, `v1/allowlist.json`, with
   the public key from 4.0d's source (the same `INDEX_PUBLIC_KEYS` the CLI compiles in),
   not with a key derived from the secret. A mismatch fails the job. Without this, a wrong
   secret would deploy files every CLI ignores with `lastOutcome: "invalid"`, which fails
   safe but silently.
5. If 4.1b has landed: apply pending migrations with 4.1b's command against the remote
   database. A failed migration stops the job before the API deploys.
6. Deploy with 4.0c's command (and the API's, if separate), using the host credential
   from the environment secret D16's host needs. Bundles are content-addressed and go up
   before the index, in the order 4.0c defines, so the live index never names a bundle
   that isn't there yet.
7. Smoke check: `GET /healthz` returns ok (from 4.1b on, that includes the store probe);
   `build:index -- --check https://<host>` passes, and `GET /v1/index.json` and
   `GET /v1/names.json` return the commit just built; once 4.1e has landed, its ingest
   smoke runs as `bun run --cwd packages/api smoke -- --host <host>` (one fixed event from
   the reserved smoke install id `00000000-0000-4000-8000-000000000001`, listed in
   `exclusions` so it never counts); the built CLI, with fresh XDG cache directories (no
   cached index, so the first `list` refreshes) against the default URL, reports a
   verified index through 4.0d's outcome field and lists every bundled stack.

### Secrets and environment

| Name | Kind | Holds | Used by |
|---|---|---|---|
| `production` | GitHub environment | Deployment branch policy: `main` only | `deploy` job |
| `INDEX_SIGNING_KEY` | Environment secret | The Ed25519 private key as the PKCS8 PEM 4.0c's `--key` reads | Step 3 only, through a mode-600 temp file deleted in an `always()` step |
| Host credential (name per D16, for example a Workers API token) | Environment secret | Deploy rights to the index host and the API, nothing broader | Steps 5 and 6 |
| `DEPLOY_ENABLED` | Repository variable | `true` once the maintainers have provisioned the host | `deploy` job condition |

In phase 4 a maintainer signs locally with a key kept off the repo (trust model point 7).
Moving to CI means putting that same key into `INDEX_SIGNING_KEY`, not generating a new
one, so already-released CLIs keep verifying. The maintainers keep their offline copy as
the backup. Replacing the key is a rotation: a CLI release with the new public key first
(4.0d), then the secret.

Decided here: no required reviewer on `production`. Every merge to `main` already passed
review and `ci-ok`, and a reviewer gate on each merge would make deploys wait on a person,
which is what this sub-phase removes. The maintainers can add one later without editing
the workflow.

### Failure modes

| Case | What happens |
|---|---|
| Registry fails `validate` | `build` fails; the previous index stays live |
| CI red on `main` | No deploy run starts |
| Older commit finishes after a newer one | Step 1 skips it |
| Wrong or missing signing key | Step 3 or 4 fails; nothing deploys; the key file is still deleted |
| Host deploy fails halfway | Content-addressed bundles may be uploaded without the index; harmless, because nothing points at them. The old index stays live |
| Migration fails | The API isn't deployed; the index may already be live if 4.0c deploys them separately; fix the migration and rerun |
| Smoke check fails after deploy | The job fails and the maintainers roll back with 4.0c's manual procedure; CLIs that can't verify fall back to the bundled set (4.0d) |
| `DEPLOY_ENABLED` unset | `build` runs and uploads; `deploy` is skipped |

## Files and areas touched

| Path | Change |
|---|---|
| `.github/workflows/deploy.yml` | New: `build` and `deploy` jobs |
| `AGENTS.md` | CI section (the deploy workflow), Pending user actions (create `production`, add the two secrets, set `DEPLOY_ENABLED`) |
| The deploy procedure 4.0c and 4.0e wrote | CI is the normal path; the manual procedure stays as the fallback and rollback |

## Acceptance tests

- With `DEPLOY_ENABLED` unset, a merge to `main` runs `build` green and uploads an
  artifact whose index decodes with 4.0c's schema; `deploy` is skipped.
- A throwaway branch's push doesn't start the deploy workflow; a PR doesn't either.
- `workflow_dispatch` with a deliberately wrong `INDEX_SIGNING_KEY` in a test environment
  fails at step 4 and deploys nothing.
- Two merges in quick succession: the run for the older commit skips at step 1.
- With deploys enabled and 4.1e landed, the smoke script passes and the smoke event is
  stored with `excluded = 'excluded_install'` and no `projects` row exists for it.
- After any `deploy` run, including one that failed at step 3 or 4, no key file remains
  in `$RUNNER_TEMP` (the `always()` step's log shows the delete).
- The `build` job's artifact has `signature: ""` in every envelope, and step 4 checks
  every signed file the deploy job built.
- With deploys enabled, a merge that changes one fragment's body: the live index's commit
  matches, the changed bundle's digest is new, and `npx stacks@latest list --json`
  on a clean machine shows the change after the index cache expires.

## Exit criteria

- `bun run check` green from the repo root.
- One deploy from CI on a real merge, with the smoke check green, run with the
  maintainers' secrets.
- The signing key exists only in the `production` environment and the maintainers'
  offline copy.
- `AGENTS.md` describes the workflow and Pending user actions lists only what's undone.

## What this plan may get wrong

- `workflow_run` runs the workflow file from the default branch, not from `head_sha`.
  That is the point (a PR can't change it), but a change to `deploy.yml` takes effect on
  the merge after it lands. Note it in `AGENTS.md`.
- If D16 picked a Node server and Postgres instead of Workers, step 6 is a container
  build and push, the host credential is a registry and platform token, and the index
  wants a CDN in front. The job shape stays.
- 4.0c may deploy the index and the API in one command, in which case steps 5 and 6
  ordering decides whether a failed migration also blocks the index. This file prefers
  blocking both; split the deploys if index freshness matters more.
- Deploys go straight to 100% of traffic. A staged rollout (a new version on a share of
  requests, the ingest smoke repeated at each stage, then promoted) would catch a bad API
  deploy before every client sees it. Deferred on purpose: at launch volume a bad deploy
  costs clients nothing but a spooled batch (4.1a keeps the spool on any non-202), and
  4.0c's manual procedure is the rollback. Revisit when traffic makes a minute of 503s
  matter.
- Signing in CI puts the key on GitHub's runners. The alternative, a maintainer signing
  each index by hand, keeps the key off GitHub but brings back the keyboard. Trust model
  point 7 already chose CI; this is where that tradeoff lands.
