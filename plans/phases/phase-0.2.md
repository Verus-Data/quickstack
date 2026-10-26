# Phase 0.2: Distribution

Status: DRAFT 2026-10-26 (not agreed). Needs A1 and D12 decided first.

| Field | Value |
|---|---|
| Goal | `npx quickstacks <command>` runs the real CLI on any machine with a supported Node, from one published artifact that the e2e suite tests byte for byte |
| Traces to | Open question "Is the npm name available? ... `npx stacks new ...`, the README's first line, will install that package"; D9's entry point "ask your agent to run quickstacks", which only works if the agent can `npx` it |
| Depends on | 0.0 (A1, D12, the name reserved), 0.1 (green CI) |
| Blocks | 1.6 (the first public release) |
| Decisions needed | A1 (recommendation: Node ESM bundle on npm), D12 (Node range) |
| Settles | How the CLI finds its bundled registry at runtime; what replaces the compiled binary in e2e; the release workflow that `AGENTS.md` lists as deferred under A1 |

## Scope

In:

- A Node ESM bundle of the CLI with no runtime dependencies, as the package's `bin`.
- `packages/cli/package.json` made publishable: `bin`, `files`, `engines`, no `private`.
- Bundled assets (the registry from 1.0 onward) shipped in the package and located by
  the platform entry, then handed to core code through `Host`.
- e2e against the packed tarball, installed into a throwaway prefix and run under Node.
- A tag-triggered release workflow that runs the gate, packs, and publishes with
  provenance.

Out: per-platform binaries, Homebrew, a curl installer, self-update. If A1 picks
binaries, this file is rewritten around them before work starts.

## Design

### The artifact

One file, `packages/cli/dist/quickstacks.mjs`, built by `bun build` with `target: "node"`,
`format: "esm"`, minified, every dependency bundled, and a `#!/usr/bin/env node`
banner. Bundling Effect into the file means `npx` downloads one small tarball and
resolves no dependency tree, which matters most on the first run inside an agent's
sandbox.

The package:

```json
{
  "name": "quickstacks",
  "type": "module",
  "bin": { "quickstacks": "dist/quickstacks.mjs" },
  "files": ["dist/quickstacks.mjs", "registry"],
  "engines": { "node": ">=22" }
}
```

`dependencies` move to `devDependencies`, since nothing is resolved at install time.
`version` stays the single source for `version.ts::VERSION`, which the build reads as
it does today.

### One entry, Node services

Today `bin.ts` provides `BunServices.layer` and reads `Bun.isStandaloneExecutable`. The
shipped program runs under Node, so the entry switches to `@effect/platform-node`'s
services. Core code doesn't change: it already uses Effect `FileSystem` and `Path` and
must run unchanged under Node.

| Option | Effect on the boundary rules | Choice |
|---|---|---|
| Keep `bin.ts` on Bun for development, add a second Node entry under `src/platform/` | The Grit rule allows `process.stdout` only in `bin.ts`, so the Node entry would need a new exception, and two entries drift | No |
| One `bin.ts` on Node services, used by both `bun run dev` and the bundle | No new exception. Bun runs Node's platform package for development | Yes |

`compiled` in `services/host.ts::HostInfo` is replaced by `assets: { registry: string }`,
the absolute path of the bundled registry, computed in `bin.ts` from
`new URL("../registry/", import.meta.url)` for the bundle and from the source tree when
running under `bun run dev`. `doctor` reports the registry path instead of `compiled`.
Core code never computes package-relative paths; it asks `Host`.

`bin.ts` checks the Node major before building any layer and, below the D12 floor,
writes one fixed line to stderr (`quickstacks needs Node 22 or newer.`) and exits 1. The
bundle targets a syntax level that parses on older Node so the check gets to run.

### What happens to the compiled binary

The compiled binary leaves the gate. Keeping it would mean two artifacts with two sets of
e2e tests, and only one of them ships. The hostile `.env` and `bunfig.toml` tests stay,
rewritten against the bundle: they prove that running the package under Node (and under
`bunx`, which should honor the Node shebang; verify this) doesn't load a project's
dotenv or Bun config into the CLI's environment. If a later phase wants binaries again,
it brings back a `build:binary` script with its own tests.

### e2e against the tarball

`bun run e2e` in `packages/cli` becomes: build the bundle, `npm pack` into a temp directory,
`npm install --global --prefix <tmp>/prefix <tarball>` (no network needed with zero
dependencies), then `bun test ./e2e`, whose tests spawn `<tmp>/prefix/bin/quickstacks`
with an environment built from scratch. The tarball's file list is asserted too, so a
missing `registry/` or a stray source file fails the gate.

CI adds Node 22 to the matrix for the e2e job only; unit tests keep running on the
version in `.node-version`.

### Release workflow

`.github/workflows/release.yml`, triggered by a `v*` tag on `main`:

1. Frozen install, then `bun run check`.
2. Check that the tag equals `packages/cli/package.json` `version`.
3. `npm pack` and the tarball e2e.
4. `npm publish --provenance --access public` using npm trusted publishing (OIDC), so
   there is no long-lived token in the repo. Permissions: `contents: read`,
   `id-token: write`.

Configuring the trusted publisher on npmjs.com is a maintainers' task and goes in
`AGENTS.md` under "Pending user actions" until done. No changelog tooling.

### Failure modes

| Situation | What happens | Exit |
|---|---|---|
| Node below the floor | One fixed stderr line, no stack trace | 1 |
| Registry directory missing from the package | `doctor` reports it; commands that need it fail with `NotFound` and a fixed message | 2 |
| Run with `bunx` | Same behavior as Node, proven by an e2e case | as usual |
| Tag doesn't match package version | Release job fails before publishing | n/a |

### Decisions this settles

- The shipped artifact is a dependency-free Node ESM bundle (if A1 is agreed).
- Core code learns asset locations only from `Host`.
- The compiled binary is out of the gate.
- Releases are tag-driven with provenance.

## Files and areas touched

`packages/cli/package.json`, `packages/cli/scripts/build.ts`, `packages/cli/src/bin.ts`,
`packages/cli/src/services/host.ts`, `packages/cli/src/core/doctor.ts`,
`packages/cli/src/schemas/doctor.ts`, `packages/cli/e2e/`, `packages/cli/tests/helpers/cli.ts`
(Host fixture), `.github/workflows/ci.yml`, new `.github/workflows/release.yml`,
`AGENTS.md` (commands, CI, Build workarounds, Deferred), `packages/cli/README.md`.
`packages/cli/registry/` starts as an empty directory with a `README.md` so the file-list
assertion has something to find before 1.0.

## Acceptance tests

- e2e: the installed `quickstacks --version` prints the package version; `doctor --json`
  reports a registry path inside the install prefix that exists.
- e2e: with a hostile `.env` (`LOG_LEVEL=trace`) and `bunfig.toml` in the cwd, output is
  identical to a clean cwd, under both `node` and `bunx`.
- e2e: the tarball contains exactly `package.json`, `README.md`, `dist/quickstacks.mjs`
  and `registry/**`.
- e2e: running the bundle with a fake Node major below the floor is not practical, so a
  unit test covers the version check function directly.
- Unit: the existing suites pass with `Host.memory()` updated for `assets`.
- CI: the e2e job passes on Node 22 and on the `.node-version` Node, on Linux and macOS.

## Exit criteria

- `bun run check` green from the repo root, with e2e running against the tarball.
- `npm pack --dry-run` in `packages/cli` lists only the expected files.
- A dry run of the release workflow (`workflow_dispatch` with publish skipped) passes.
- `AGENTS.md` updated: the commands table, the "Bun compiles the executable" line, the
  binary e2e description, and A1 removed from Deferred.
- A1 and D12 recorded in the README decisions log by the maintainers.

## What this plan may get wrong

- `@effect/platform-node` under `bun run dev` is assumed to work for everything the CLI
  needs, including child processes (0.3). Check this before switching; if it doesn't,
  development keeps a Bun platform layer in `src/platform/` and only the bundle uses
  Node's.
- `bunx` honoring the Node shebang is assumed. If it runs the bundle under Bun instead,
  Bun's dotenv autoload applies; the fix is to read env through the captured record in
  `config.ts::configLayer` only (already the rule) and test that a project `.env` can't
  change behavior.
- A fully bundled Effect may be larger than expected. Measure the tarball; anything over
  a couple of megabytes is worth a look at tree-shaking before release.
