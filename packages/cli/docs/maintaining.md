# Maintaining the bundled registry

This page is for maintainers: proving bundled stacks with the bench, recording runs in the ledger, and publishing the Claude Code plugin. Commands run from `packages/cli/`.

## The bench

The bench is how a bundled stack earns its "proven" label: a real coding agent builds the stack headlessly from an empty directory, and stacks verifies the result independently.

```sh
bun run bench <stack> --agent claude --keep
```

It builds the dev binary, installs it with the working registry into a throwaway prefix, scaffolds the stack, runs the agent headlessly and verifies independently. `--cli <binary>` skips the build; `--preset default` uses defaults instead of sandbox, `--with a,b` adds fragments, `--max-minutes 60` sets the time limit, and `--no-record` skips the ledger and run note. `--existing <kept-root>` continues matching content and adds one intervention.

The package must be clean before a run. Read every generated note under `plans/runs/` and its `registry/runs.json` record before committing; a green verify can still need relabeling as `partial` after review. The bench never commits anything.

Auth is `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, or `CODEX_ACCESS_TOKEN` as documented by `codex login --with-access-token`. Only the selected token reaches the agent; no credentials or settings are copied. The fresh `HOME` and project are not a security boundary: local runs give the agent full permissions. Child processes get `DO_NOT_TRACK=1`. Fake-agent tests need no account or real token.

## The ledger

The reviewed ledger is `registry/runs.json`. It's what `list` reads for "proven <date>". Import reviewed gate notes with:

```sh
bun run ledger:import ../../plans/runs/2026-10-27-*.md
bun run ledger:import ../../plans/runs/2026-10-27-*.md --dry-run
```

The script discovers the repo from the working directory, archives only the registry at each note's commit into a temporary directory and fingerprints it with the current composition code. A contradictory Outcome row and final verify record are reported and skipped; a maintainer's explicit `partial` stays partial even when verify is green. The driving agent is independent of adapter targets: targets default to `claude`, and notes for an override can include a `Target agents` table row with comma-separated ids such as `codex`, `claude`.

It records only added fragments in `with`, removing fragments already selected by the default composition at that commit. Existing `(repoCommit, stack, date)` records are skipped. Incomplete notes are reported, other notes continue, and any failure exits 1. `--dry-run` prints a JSON array and writes no ledger; `--` ends options. Bun consumes an initial `--` before passing arguments to a script, so single-dash note names are also accepted directly. Use `./` for a note name that collides with a long option.

## Publishing the Claude Code plugin

`plugin/` is a Claude Code plugin carrying the agent skill, published by hand after a CLI release to a marketplace repository the maintainers own (not created yet; see [marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) and the [manifest reference](https://code.claude.com/docs/en/plugins-reference)). `skill/SKILL.md` is the source; `plugin/skills/stacks/SKILL.md` is a committed copy, because a plugin's paths can't leave its directory. `tests/native-agent-plugin.test.ts` fails when the copy or the manifest's `version` drifts from the skill and `package.json`.

1. On the release revision, from `packages/cli/`, refresh the copy and check the plugin loads (`/stacks:stacks` should appear in the session):

   ```sh
   cp skill/SKILL.md plugin/skills/stacks/SKILL.md
   bun run test:unit tests/native-agent-plugin.test.ts
   claude plugin validate ./plugin
   claude --plugin-dir ./plugin
   ```

2. In the marketplace checkout, replace `plugins/stacks/` with `plugin/` (including `.claude-plugin/`). On first publication, create `.claude-plugin/marketplace.json` with the marketplace `name`, an `owner` and a `plugins` array holding:

   ```json
   {
     "name": "stacks",
     "source": "./plugins/stacks",
     "description": "Choose a stack with the stacks CLI and follow its brief until verify is green."
   }
   ```

   The version stays in the plugin manifest only.
3. Run `claude plugin validate <marketplace-checkout>`, `claude plugin marketplace add <marketplace-checkout>` and `claude plugin install stacks@<marketplace-name>`, and confirm the skill appears in a new session.
4. Push the marketplace, and record the CLI version, marketplace revision and date in `plans/HANDOFF.md`.
