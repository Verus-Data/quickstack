# Phase 4.0a: The format package

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | Move the entry, manifest and run-record schemas out of `packages/cli` into a private `packages/format`, add `canonicalBundle` and `bundleDigest`, and leave every CLI behavior unchanged |
| Traces to | D11: "shared code gets its own package". The index build (4.0c), the remote origin (4.0d), the API (4.0b onward) and telemetry (4.1a, 4.1b) all need the same schemas; this is the second consumer D11 waits for |
| Depends on | 1.3b (`RunRecord` exists to move), 1.6c (the published package whose packing 0.2 defined) |
| Blocks | 4.0b, 4.1a; through them all of phase 4 |
| Decisions needed | None. If D11 is ever reversed, this sub-phase is skipped and later sub-phases import from `packages/cli` through a published entry point instead |
| Settles | What lives in `packages/format`; how the CLI depends on it without publishing it; the canonical bundle form |

## Scope

In:

- A new private workspace package `packages/format` (`@quickstacks/format`, `"private": true`), never published.
- Moving the contracts the roadmap marks "moves in 4.0a" (see roadmap, [Contracts: Types and schemas](../roadmap.md#types-and-schemas)): `AgentId` and `DetectedAgent`; Entry format v1 (`StackMeta`, `FragmentMeta`, `VerifyStep`, `Probe`, `Check`); `Manifest`, `ManifestStep`, `EntryRef`; `RunRecord`. Same names, same behavior. `RunRecord` moves carrying 3.5b's optional `stages` field.
- New: `EntryBundle` schema, `canonicalBundle` and `bundleDigest` (roadmap, Contracts: Canonical bundle).
- Rewriting every CLI import of the moved code to `@quickstacks/format` in this one change, and deleting the old files.
- A Grit boundary in the format package banning platform imports.

Out:

- Composition (`compose`, `composeFiles`, the `Composition` type), `fingerprint`, the registry loader, `validate`, the ledger file reader and `LedgerRecord`. They stay in the CLI; nothing outside the CLI needs them yet. `fingerprint` takes a `Composition` and calls `composeFiles`, so it can't move without them. The index build that needs them runs from `packages/cli/scripts/` (4.0c).
- `RegistryIndex` and the signed envelope (4.0c adds them), `TelemetryEvent` (4.1a), `StatsSummary` (4.2a).
- Any behavior change, new command, or test change in `packages/cli` beyond import paths.

## Design

### Where this fits

This is the first of five 4.0 sub-phases. 4.0a is a pure refactor plus two small new functions. 4.0b creates `packages/api` and imports `@quickstacks/format` inside the Workers runtime to prove it runs there. 4.0c uses `canonicalBundle` and `bundleDigest` to publish bundles, 4.0e uses the signed envelope 4.0c adds for the official-names file, and 4.0d uses the same two functions to compare remote and bundled copies. Once this lands, `packages/format` changes only by adding files (4.0c, 4.0e, 4.1a, 4.2a), never by changing what it exports.

### Package shape

```
packages/format/
  package.json     name @quickstacks/format, private, type module,
                   exports { ".": "./src/index.ts" }, scripts typecheck/test/coverage/check/clean
  tsconfig.json    extends ../../tsconfig.base.json; types: [] (no Node, no Bun)
  biome.json       { "root": false, "extends": "//", "plugins": [...] }
  biome-plugins/   no-platform-imports.grit
  src/             agent.ts, entry.ts, manifest.ts, run-record.ts, bundle.ts, index.ts
  tests/
```

It exports TypeScript source. No build step: the CLI's Node bundle (0.2) inlines it, Vitest transforms it, and the API's Worker bundler inlines it. The tsconfig has no `@types/node` or `@types/bun`, which is the check that the package is safe to run on Workers. Only `effect` (the core package, through `catalog:`) is a dependency; `@effect/platform-*`, `node:*` and `bun` imports are banned by the Grit rule.

The package needs `typecheck`, `test` and `coverage` scripts so the root fan-out (`bun run --filter '*'`) runs it locally and in the existing CI job, which already calls `bun run typecheck` and `bun run coverage` at the root. No workflow change is needed (D23; CI edits are phase 5).

### How the CLI depends on it

`packages/cli/package.json` lists `"@quickstacks/format": "workspace:*"` in `devDependencies`, next to the other packages 0.2's build inlines. The published tarball's `package.json` then names no runtime dependency on a package that doesn't exist on npm. There are no re-exports left in `packages/cli/src/schemas/`: every import moves in this change, so there is one name for each symbol from the day the package exists (the roadmap contracts table already says "moves in 4.0a"). A stale import is a compile error, not a silent second copy.

### Canonical bundle

Two digests, never confused: `fingerprint` (CLI, 2.0a) is a sha256 over a whole composition (its entries, the preset and the `composeFiles` output); `bundleDigest` (here) is a sha256 over one entry's canonical bundle.

An entry bundle is every file under an entry's directory (`STACK.md` or `FRAGMENT.md`, `files/`, `adapters/`), as bytes, with the executable bit.

```ts
// packages/format/src/bundle.ts (shape)
export const BundlePath = Schema.String.check(/* relative, "/"-separated, no "..", no leading "/", no "\\", no NUL */);
export const EntryBundle = Schema.Struct({
  id: EntryId, kind: Schema.Literals(["stack", "fragment"]),
  files: Schema.Array(Schema.Struct({
    path: BundlePath, executable: Schema.Boolean,
    encoding: Schema.Literals(["utf8", "base64"]), content: Schema.String,
  })),
});
export const canonicalBundle: (bundle: EntryBundle) => Uint8Array;  // deterministic bytes
export const bundleDigest: (bundle: EntryBundle) => Effect.Effect<Digest>; // sha256 hex of canonicalBundle
```

Rules (roadmap, Contracts: Canonical bundle): files sorted by path using byte order of the UTF-8 path; keys in the fixed order `id, kind, files` and `path, executable, encoding, content`; `utf8` only when the bytes round-trip exactly through UTF-8 decoding, otherwise `base64`; no whitespace; content is the raw file bytes, with no line-ending or trailing-newline normalization. Paths are the names in the entry directory, dotfiles included as stored (literally, `files/.gitignore`), so the digest of a bundled copy and an index copy of the same entry is the same. `bundleDigest` uses Web Crypto (`crypto.subtle.digest`), which exists on Node, Bun and Workers, so the package needs no platform import.

`kind` is `src/schemas/entry.ts::Kind` as 1.0 declared it, moved here unchanged. An app is a fragment with `category: app` (D18 as amended), so it is bundled with `kind: "fragment"` and there is no third kind to reserve.

`BundlePath` rejects path traversal at decode time so every reader of a bundle (the CLI extracting one, the API reading one) gets the check for free.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/format/` | New package as above |
| `packages/cli/src/schemas/entry.ts`, `manifest.ts`, `verify.ts` (the `RunRecord` part) | Moved into `packages/format/src/`; removed from the CLI. `src/core/fingerprint.ts` and `src/core/compose/` stay |
| `packages/cli/src/**`, `tests/**` | Imports rewritten to `@quickstacks/format` |
| `packages/cli/package.json` | `@quickstacks/format: workspace:*` in `devDependencies` |
| Root `package.json` catalog | Nothing new; the package uses `effect` and Vitest through `catalog:` |
| `.claude/rules/format/` | New rule file scoped to `packages/format/` (no platform imports, additive changes only after this sub-phase) |
| `AGENTS.md` | Architecture map gains `packages/format`; Overview no longer says only `packages/cli` has code |

## Acceptance tests

- The CLI suite passes with no test file changed except import lines: `bun run test`, `bun run coverage` and `bun run e2e` in `packages/cli`. A diff of `packages/cli/tests/` and `e2e/` shows only import changes.
- The schema tests that belonged to the moved code move with it and pass in `packages/format`; the fingerprint tests stay in the CLI unchanged.
- `packages/format` typechecks with `types: []`; adding `import "node:fs"` to a probe file fails lint (Grit probe on a real temporary file, as the CLI's boundary tests do).
- The packed tarball from 0.2's build has no `@quickstacks/format` in its `package.json`, and `npx` of the tarball in a temp directory runs `list --json` (0.2's existing packed-tarball e2e, unchanged, is the check).
- `canonicalBundle`: the same files in a different order give identical bytes; a CRLF file and its LF copy give different digests; a binary file round-trips through `base64`; property test over random file sets that decode-then-canonicalize is stable.
- `BundlePath` rejects `../x`, `/x`, `a/../../x`, `a\\b` and an empty string.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root, now including `packages/format`.
- No file under `packages/cli/src/` defines a symbol that `packages/format` exports.
- `AGENTS.md` describes the package.

## What this plan may get wrong

- Exporting `.ts` source assumes every consumer transforms TypeScript. Vitest, Bun and Wrangler's bundler do. If a tool doesn't (a future Node-only script), add a build step then rather than now.
- `crypto.subtle.digest` is async, so `bundleDigest` returns an Effect. If a caller needs it synchronously, that caller is wrong about where it runs, not the function.
- 2026-10-26: `EntryBundle.kind` reserved `"app"` for 3.5a's entry kind, the bundle listed `APP.md`, and bundle paths kept `_dot_` escaped names. The amended D18 withdrew 3.5a (an app is a fragment), so `kind` is `stack | fragment`, and dotfiles are literal in the entry directory, so bundle paths are too. A bundle path starting with `.` is ordinary; `BundlePath`'s traversal rules are unchanged.
- Leaving `compose`, `composeFiles` and `fingerprint` in the CLI means the API can never compose a stack or compute a fingerprint itself. Nothing in phase 4 needs it to; if that changes, they move then, with the same "second consumer" rule.
