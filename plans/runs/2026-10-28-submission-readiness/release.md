# R5 release and deploy

## CLI 0.4.0

- Release commit: quickstack `cedaa5b` (merge of `4e81fa7 chore(release): 0.4.0`); gate 6 of 6.
- Tarball: `packages/cli/dist/pack/steamfield-stacks-0.4.0.tgz`, sha256
  `c2c4db2cc7c3763feae4d38491ec84d405be028b59c71ba29d6e76d0bfea8be2`.
- `@steamfield/stacks-format` stays 0.4.0 (already published).
- npm publish: the maintainer's step. Pinned `npx @steamfield/stacks@0.4.0` checks and the
  `v0.4.0` tag follow it.

## Production

- Rollback point: stacks-api `34b3e5b`, index from quickstack `6060b55`. `prod:seed` backed up
  both volumes on the host before the swap.
- Seed: `bun run prod:seed -- --replace-production-data --profile active --seed 1 --days 120
  --through 2026-10-27` (profile `active-4`), from quickstack `cedaa5b`. The database is 2.5 GB.
- First two `prod:deploy` runs failed in the site's stats pass with HTTP 502: the API ran out of
  its 2.2 GB default heap with two stats requests in flight and restarted. `f58a1db` sets
  `NODE_OPTIONS=--max-old-space-size=4096` in Compose (`API_NODE_OPTIONS` overrides it). The
  third deploy built 244 pages; the stats pass took 8 minutes.
- After the deploy: `/healthz`, `/v1/index.json`, search (strong and `!!!`), `/v1/stats`,
  `/v1/stacks/python-react/stats`, `/v1/deps/npm/stats`, `/deps/`, `/search/`,
  `/stacks/python-react/`, `/fragments/ci-github/`, `/browse/trending/` and `/browse/newest/`
  returned 200. Six concurrent stats requests left the container up with no restart.

## Packed CLI against production (fresh `HOME`)

| Command | Result |
| --- | --- |
| `--version` | `0.4.0` |
| `search "python api with a react dashboard"` | API-ranked: `python-react` strong, evidence `green lower 0.85, sample 4265, 4815 projects / 28 days; last run 2026-10-28: pass` |
| `search '!!!'` | `Nothing matched.` and both `Next:` lines |
| `list stacks` | `Stats:` lines with the `seeded` label |
| `show python-react` | No `Stats:` line: the stack stats route takes 3.7 s and the CLI's stats deadline is 1.5 s |
| `new python-react <dir> --sandbox --no-launch` | Scaffolded; brief 4,836 words; handoff line for the agent |
| `doctor` | `Configuration: ok`; remote index off |

The slow stats routes are an API fix in progress (stats speed unit); no CLI change is needed.
