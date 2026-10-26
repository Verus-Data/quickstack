# Phase 4.0b: The CLI's remote origin

Status: DRAFT 2026-10-26 (not agreed). Second half of phase 4.0; [4.0a](phase-4.0a.md)
builds the index this reads.

| Field | Value |
|---|---|
| Goal | The CLI reads the published registry index so new and updated official stacks reach users without a CLI release, shows each entry's last canary result in `list --json`, and never lets the network slow, fail or change the output of a command beyond adding fresher entries |
| Traces to | "Stacks don't rot" and "the remote registry 404s today". The agent's frustration: "ambiguity", which `lastRun` in `list --json` reduces when two stacks fit. "The CLI must stay fully usable with no network" follows from D2's trust story and the offline promise of the bundled set |
| Depends on | 4.0a (the index and bundles exist at a URL) |
| Blocks | 4.2 (stats are fetched and cached the same way) |
| Decisions needed | None new. Uses D16 (proposed) only for the default URL |
| Decisions or questions this settles | Where the remote origin sits in precedence, when it refreshes, how it fails, and how it is trusted |

## Scope

In:

- A `RemoteIndex` service with a disk cache, a refresh policy, failure backoff and digest verification.
- The remote origin in the 1.0 registry loader, between git sources and bundled.
- `--offline` on every command and `QUICKSTACKS_OFFLINE=1`; `QUICKSTACKS_INDEX_URL` to point at another index.
- `lastRun` in `list --json` and `show --json` from the index.
- `doctor` reporting the cache age and the last refresh outcome.

Out:

- Telemetry and stats (4.1, 4.2).
- Fetching during `verify`. `verify` never touches the network.
- Background refresh processes. Refresh happens inline, bounded, or not at all.

## Design

### Behavior

`list`, `show`, `new` and `add` call `RemoteIndex.current`. It returns the cached index when it is younger than the TTL (24 hours). When older, it tries one refresh with a hard deadline of 1,500 ms, then returns whatever it has: the fresh index, the stale cache, or nothing. Nothing means the loader skips the origin and bundled entries are used, exactly as in the MVP. No command fails because of the index.

After a failed refresh the next attempt waits 10 minutes, and after a 404 24 hours, so an offline or sandboxed machine pays the deadline once, not on every command. The backoff state lives beside the cache.

When the loader needs an entry that the index lists and the cache doesn't have, it fetches the bundle (same deadline, same backoff), checks its sha256 against the index digest, and stores it under its digest. A mismatch discards the bundle and falls back to the bundled copy of that id, with one warning.

### Precedence and identity

Origins, highest first: project, user, git sources, remote index, bundled. When the remote and bundled copies of an id have the same digest, the entry reports `origin: "bundled"`, so `list` doesn't claim a remote origin for content the package already had. Otherwise it reports `origin: "index"`.

Entries whose `schemaVersion` major is newer than the CLI supports are skipped (the bundled copy is used), and an index whose `formatVersion` is unknown or whose `minCli` is newer than the running CLI is ignored entirely with one `doctor`-visible note. The CLI never refuses to run because the index moved on.

### Trust

Entries from the default index URL are trusted, like bundled ones: the content is the official registry, built from `main` after `validate`, and each bundle is checked against its digest. When `QUICKSTACKS_INDEX_URL` points elsewhere, its entries are `trusted: false` with `origin: "index:<host>"`, and the 3.2 untrusted rules apply (no auto-launch, warning section in the brief). That keeps a test or self-hosted index from silently becoming trusted.

### Interfaces

```ts
// packages/cli/src/core/remote-index.ts
export class RemoteIndex extends Context.Service<RemoteIndex, {
  readonly current: Effect.Effect<Option.Option<RegistryIndex>>;          // never fails
  readonly bundle: (entry: IndexEntry) => Effect.Effect<Option.Option<EntryBundle>>; // never fails
  readonly status: Effect.Effect<RemoteStatus>;                          // for doctor
}>()("quickstacks/RemoteIndex") {
  static layer: Layer.Layer<RemoteIndex, never, FileSystem.FileSystem | Path.Path | HttpClient | AppConfig>;
  static disabled: Layer.Layer<RemoteIndex>; // --offline, tests
}

export type RemoteStatus = {
  url: string; offline: boolean;
  cachedAt: string | null; lastAttempt: string | null;
  lastOutcome: "ok" | "timeout" | "network" | "not_found" | "invalid" | null;
  backoffUntil: string | null;
};
```

`HttpClient` comes from Effect's HTTP module and is provided by the platform entry, so core code stays platform-free. Config gains `indexUrl` and `offline`, read from env and flags in `config.ts` only.

Cache layout under `$XDG_CACHE_HOME/quickstacks/index/`:

| Path | Holds |
|---|---|
| `index.json` | Last good index, written by temp file and rename |
| `state.json` | `{ url, cachedAt, lastAttempt, lastOutcome, backoffUntil }` |
| `bundles/<digest>.json` | Verified bundles |

A cache written for a different URL is ignored, so switching `QUICKSTACKS_INDEX_URL` never mixes indexes.

### Output changes

`list --json` items gain `lastRun: { date, result, agent, minutes } | null` and `origin` may be `"index"`. Human `list` prints `proven <date>` or `unproven` beside each stack. `doctor --json` gains `remoteIndex: RemoteStatus`.

### Failure modes

| Case | Effect on the command |
|---|---|
| Network down, DNS failure, timeout | None. Stale cache or bundled; backoff recorded |
| 404 | None. 24-hour backoff |
| Index fails to decode | Ignored; `lastOutcome: "invalid"`; cache keeps the previous good index |
| Bundle digest mismatch | Bundled copy used; one warning on stderr in human mode, none in `--json` |
| Cache directory not writable | Works from memory for this run; no backoff persisted |
| `--offline` | No network call at all; cached index still used |

### Decisions settled here

- Inline, bounded refresh rather than a background process. A background refresher would need a daemon or a detached child, which is more machinery than a 1.5-second deadline once a day.
- The remote origin can add and update entries but never removes a bundled one. A stack withdrawn from the index still exists in the package that shipped it; withdrawal is a CLI release.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/src/core/remote-index.ts` | New service |
| `packages/cli/src/core/registry.ts` | Remote origin and same-digest rule |
| `packages/cli/src/config.ts` | `QUICKSTACKS_INDEX_URL`, `QUICKSTACKS_OFFLINE`, `--offline` |
| `packages/cli/src/platform/*`, `src/bin.ts` | Provide `HttpClient` |
| `packages/cli/src/commands/list.ts`, `show.ts`, `doctor.ts` | `lastRun`, `remoteIndex` |
| `packages/cli/src/schemas/doctor.ts`, `list.ts` | New fields |
| `packages/cli/tests/remote-index.test.ts` | New |
| `packages/cli/e2e/` | One packaged-CLI test against a local index server |

## Acceptance tests

Every network test runs a real local HTTP server serving fixture index and bundle files, with handlers that can delay, 404, return bad JSON or a wrong digest.

- Fresh cache, server up: `list --json` includes an index-only stack with `origin: "index"` and its `lastRun`.
- Server delays 5 seconds: `list` returns in under 2.5 seconds with bundled entries and `doctor --json` shows `lastOutcome: "timeout"`; a second `list` within 10 minutes makes no request (server request counter).
- 404: no request for 24 hours of TestClock time; then one.
- Same digest remote and bundled: `origin: "bundled"`.
- Wrong bundle digest: bundled copy used, warning in human mode, `--json` stdout identical to the offline run.
- `--offline`: zero requests, cached index still read.
- `QUICKSTACKS_INDEX_URL` to the local server: its entries are `trusted: false`, and `new` with an agent on PATH prints instead of launching.
- Index with `formatVersion: 2`: ignored, bundled used, `doctor` note.
- `verify` in a project makes zero requests even with a stale cache.
- e2e: the packed tarball under Node lists an index-only stack from the local server.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- With the maintainers' deploy enabled, `npx quickstacks@latest list --json` shows `lastRun` for every bundled stack from the live index.
- `AGENTS.md` and the CLI README document the remote origin, `--offline`, the cache and the trust rule.

## What this plan may get wrong

- 1.5 seconds once a day may still be noticed inside agents that run `list` in a tight loop on a slow network. The backoff caps the damage; if it shows up in run notes, make `list` never refresh and let only `new` do it.
- Same-digest detection assumes the bundle's canonical form is identical between the build script and the CLI's own packing of bundled entries. Both must use `packages/format`'s canonicalizer or every entry will report `origin: "index"`.
