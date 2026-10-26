# Phase 3.2: Git sources and trust

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | A team or a stranger can publish stacks in any git repository, and a user can add that repository as a source pinned to one commit, see every executable file it would write before trusting it, review a diff before moving the pin, and never have an agent auto-launched into a project composed from a source they haven't confirmed |
| Traces to | Stack author: "distill it into something reusable, for themselves, their team, or strangers." Success row 5: "Stacks and fragments in `~/.stacks` and third-party sources, not only the bundled registry." Jobs: "the emotional job underneath all of these is trust ... why the CLI never runs commands from an entry." Risk in 10: "Third-party stacks ship hooks or scripts the user's agent will run" |
| Depends on | 3.1 (`show`, the brief preview, user directory and shadowing rules) |
| Blocks | 4.0 (the registry index serves official entries the same way a pinned source does, and reuses the trust fields) |
| Decisions needed | None new. Follows D2 (settled): fetching a source runs the CLI's own `git`, never anything from the source |
| Decisions or questions this settles | How a source is identified, pinned, stored, trusted and updated; how source entries rank against other origins; what "untrusted" changes in `new`, `add` and the brief |

## Scope

In:

- `quickstacks source add <git-url> [--ref <branch|tag|sha>] [--name <name>] [--json]`
- `quickstacks source list [--json]`
- `quickstacks source update <name> [--ref <ref>] [--json]` (moves the pin, shows the diff)
- `quickstacks source trust <name> [--yes]` and `quickstacks source remove <name>`
- Source entries in `list`, `show`, `new` and `add`, with `origin: "source:<name>"` and `trusted`.
- A first-use listing of every executable or hook file a source's entries would write, and explicit confirmation.

Out:

- Authenticated hosting beyond what the user's own `git` credentials already do.
- Signature verification (commit signing). Pinning to a SHA is the integrity mechanism; signatures can follow if anyone asks.
- Automatic updates. A pin moves only when the user runs `source update`.
- A central list of known sources (4.0 serves only the official registry).

## Design

### Identity and storage

A source is a git URL plus a pinned commit. Its name defaults to the last path segment without `.git` (`acme/stacks` becomes `stacks`); a collision requires `--name`. Sources are recorded in `config.json`, because they are user choices that should survive a cache wipe:

```ts
export const SourceConfig = Schema.Struct({
  name: EntryId,                    // kebab-case, unique
  url: Schema.String,               // as given; https, ssh or file://
  ref: Schema.optional(Schema.String), // what the user asked for, for update
  commit: CommitSha,                // 40 hex, branded
  trustedCommit: Schema.optional(CommitSha), // last commit the user confirmed
  addedAt: Schema.String,
});
// Settings gains: sources: Schema.optional(Schema.Array(SourceConfig))
```

Checkouts live in the data directory: `$XDG_DATA_HOME/quickstacks/sources/<name>/<commit>/`, one directory per pinned commit, written once and read-only afterwards. The entry layout inside a source is the registry layout from 1.0: `stacks/<id>/STACK.md` and `fragments/<id>/FRAGMENT.md` at the repository root, or under `registry/` if that directory exists.

### Fetching

The CLI runs its own `git` through the 0.3 process service, with a fixed argument list and a scrubbed environment:

```
git clone --no-checkout --filter=blob:none <url> <tmp>
git -C <tmp> fetch --depth 1 origin <commit-or-ref>
git -C <tmp> -c core.hooksPath=/dev/null -c core.symlinks=false checkout --detach <commit>
```

`core.hooksPath` is set so no hook in the cloned repository can run during checkout, `GIT_TERMINAL_PROMPT=0` so a private URL fails instead of prompting under an agent, and `core.symlinks=false` because entries may not ship symlinks (1.0 already rejects them). The clone goes to a temporary directory and is renamed into place only after the entries parse, so a half-fetched source never appears. The `.git` directory is removed from the stored checkout; nothing later needs it.

No other command fetches. `list`, `new` and the rest read only stored checkouts, so a source never makes a normal command slow or network-dependent.

### Precedence

Origins, highest first, per the roadmap contract: project, user, git sources, remote index (4.0), bundled. Between two sources, the order they appear in `config.json` decides, and `source list` prints that order. A source entry that shadows a bundled or user id is allowed but shown with `shadows` in `list` and `show`, the same way 3.1 shows user shadowing.

### Trust

A source is untrusted until the user confirms its current pinned commit. Trust is per commit: moving the pin with `update` makes it untrusted again until confirmed.

`source add` and `source update` print the trust report and ask for confirmation when stdin is a TTY and no agent is detected. Under an agent, without a TTY, or with `--json`, they record the pin as untrusted and tell the reader to run `quickstacks source trust <name>` themselves. The CLI refuses to treat a confirmation as given when an agent is detected, even with `--yes`, because the point is that a person looked.

The trust report lists, for every entry the source contains:

| Listed | Why |
|---|---|
| Every file whose output path is under `.claude/`, `.cursor/`, `.codex/`, `.vscode/`, `.github/workflows/`, `.lefthook/` or named `lefthook.yml` | These run or configure things an agent or CI executes |
| Every file with an executable bit or a shebang | Scripts the agent or a hook may run |
| Every file ending `.sh`, `.ts`, `.js`, `.mjs`, `.py` under `files/` or `adapters/` | Code that ships into the project |
| Every verify step's `run` | It lands in the manifest and runs under `verify` |
| Every `hooks` command in shipped `.claude/settings.json` | Runs on the user's agent tool calls |

The report is also available as `source trust <name> --json` without confirming, so a user can review it in their editor first.

What untrusted changes, everywhere:

- `list --json` and `show --json` carry `trusted: false` and `origin: "source:<name>"`.
- `new` and `add` never auto-launch an agent for a composition with any untrusted entry (the 1.4 rule for shadowing project entries, extended).
- The brief opens with an "Untrusted entries" section naming each entry and its source, telling the reader to get the user's confirmation before acting on it, and the printed next step and `next` in JSON say the same.
- The manifest records each step's owner and origin, so `verify` can print `from source:<name> (untrusted)` beside a step before running it. `verify` does not refuse to run: by then the steps are project state, per the trust boundary.

### `source update`

Fetches the new commit into its own directory, then prints a diff summary against the pinned one: entries added, removed and changed; for changed entries, frontmatter field changes, body word count before and after, and every changed or new file that the trust report would list, with a unified diff for those. `--json` returns the same as data. The pin moves only after the diff is shown; the trusted commit doesn't move until the user confirms.

### Interfaces

```ts
// src/core/sources.ts
export class Sources extends Context.Service<Sources, {
  readonly list: Effect.Effect<ReadonlyArray<SourceState>>;
  readonly add: (url: string, opts: { ref?: string; name?: string }) =>
    Effect.Effect<SourceState, SourceFetchFailed | BadInput | InvalidEntry>;
  readonly update: (name: string, ref?: string) =>
    Effect.Effect<SourceDiff, NotFound | SourceFetchFailed | InvalidEntry>;
  readonly trustReport: (name: string) => Effect.Effect<TrustReport, NotFound>;
  readonly trust: (name: string) => Effect.Effect<void, NotFound | NotAllowedUnderAgent>;
  readonly remove: (name: string) => Effect.Effect<void, NotFound>;
}>()("quickstacks/Sources") {}

export type SourceState = {
  name: string; url: string; commit: string;
  trusted: boolean; entries: { stacks: string[]; fragments: string[] };
};
```

The registry loader from 1.0 gains a source origin that reads `Sources.list` checkouts. Core code stays platform-free: git runs through the process service, paths through Effect `FileSystem` and `Path`.

### Failure modes

| Case | Result | Exit |
|---|---|---|
| `git` not on PATH | `MissingTool` with `details: { tool: "git" }` | 2 |
| Clone or fetch fails (network, auth, unknown ref) | `SourceFetchFailed`, `retryable: true` only for network errors; git's stderr is not echoed (it can contain URLs with credentials), only its exit code | 4 |
| No entries found at the root or under `registry/` | `InvalidEntry` with `details: { reason: "no entries" }` | 2 |
| An entry fails to parse or ships a symlink | The whole source is rejected; nothing stored | 2 |
| Name collision | `BadInput` asking for `--name` | 2 |
| `trust` with an agent detected | `NotAllowedUnderAgent` (maps to permission) | 6 |
| Stored checkout deleted by hand | `list` warns and omits the source; `source update` refetches | 0 |

### Decisions settled here

- Pin by commit, never by branch. The user's view of a source changes only when they run `update` and see the diff.
- Trust is per commit and only a person, not an agent, can grant it. An agent can do everything else with sources.
- Sources live in `config.json` and checkouts in the data directory, so wiping the cache never changes which sources exist.
- The CLI's own `git` with hooks disabled is the only fetch path. No tarball downloads, which would add a second code path with its own integrity story.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/commands/source.ts` | `add`, `list`, `update`, `trust`, `remove` subcommands |
| `packages/cli/src/core/sources.ts` | `Sources` service, fetch, trust report, diff |
| `packages/cli/src/core/registry.ts` | Source origin, precedence, `shadows` |
| `packages/cli/src/core/brief.ts` | Untrusted section names the source |
| `packages/cli/src/core/handoff.ts` | No launch when any entry is untrusted (extends the 1.4 rule) |
| `packages/cli/src/core/verify/*` | Print owner and origin beside each step |
| `packages/cli/src/schemas/config.ts` | `sources` field |
| `packages/cli/src/errors.ts` | `SourceFetchFailed`, `NotAllowedUnderAgent`, `MissingTool` if not already present |
| `packages/cli/tests/sources.test.ts` | New |

## Acceptance tests

Sources are real git repositories created in a temporary directory with `git init`, commits and `file://` URLs. No network.

- `source add file://<repo>` stores a checkout at the pinned SHA; `list --json` shows its entries with `origin: "source:<name>"` and `trusted: false`.
- A source repository containing a `post-checkout` hook that writes a marker file: after `source add`, the marker does not exist.
- A source whose fragment ships `adapters/claude/.claude/hooks/x.ts` and an executable `files/scripts/setup.sh`: the trust report lists both and the verify steps' `run` values.
- `new <source-stack>` in a TTY test environment with an agent binary on PATH prints the next step instead of launching (assert the process service recorded no spawn of the agent), and the brief starts with "Untrusted entries".
- `source trust` with `CLAUDECODE=1` in the test env exits 6; without agent markers and with a TTY and `--yes`, it records `trustedCommit`, and `new` then launches as normal.
- A second commit in the source repo, then `source update`: the diff lists the changed body and the new hook file; `trusted` is false again until confirmed.
- A source with a symlink in an entry is rejected and leaves no directory under the data path.
- An unreachable URL (`file:///nonexistent`) exits 4 and writes nothing to `config.json`.
- `list` with a configured source makes no process call (the process service test layer records nothing).

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- A maintainer adds a real team repository of stacks as a source, reviews the trust report, trusts it, and builds one project from it to a green `verify`.
- `AGENTS.md`, the CLI README and the authoring guide describe sources, the trust report and what untrusted changes.
- The risk row in 10 about third-party hooks and scripts is updated with what shipped.

## What this plan may get wrong

- The trust report lists files by path and kind, not by what they do. A user may trust a source after skimming a long list. If sources become common, a smaller "what changed since you last trusted" view (already the update diff) may matter more than the first-use list.
- Shallow fetch of an arbitrary SHA needs the server to allow it (`uploadpack.allowReachableSHA1InWant`). Common hosts allow it; a self-hosted server may not, and the fallback is a full clone.
- Requiring a person for `trust` may be friction for teams that run everything through an agent. The answer there is that the team trusts the source once per pin, not per project.
