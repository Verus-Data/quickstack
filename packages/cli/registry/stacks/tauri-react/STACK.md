---
schema_version: 1
id: tauri-react
kind: stack
name: Tauri desktop app with React
description: Tauri 2 desktop app with a Rust crate workspace behind a thin app shell, tauri-specta typed IPC, a React/Vite frontend that reaches Rust only through a transport facade with a mock for the browser and tests, Biome, Vitest, Playwright, clippy, and a crate-edge policy check.
tags: [rust, typescript, react, desktop, tauri, make, bun, node]
deps:
  app: [react, react-dom, react-router, "@tauri-apps/api", "@tanstack/react-query", zustand, tailwindcss, "@tailwindcss/vite", class-variance-authority, clsx, tailwind-merge, lucide-react]
  dev: ["@tauri-apps/cli", vite, "@vitejs/plugin-react", typescript, "@biomejs/biome", vitest, "@vitest/coverage-v8", happy-dom, "@testing-library/react", "@testing-library/jest-dom", "@testing-library/user-event", "@types/node", "@types/react", "@types/react-dom", "@playwright/test"]
  rust: [tauri, tauri-build, tauri-specta, specta, specta-typescript, serde, serde_json, thiserror, anyhow, tracing, tracing-subscriber, tokio]
  rust-dev: [tempfile]
tools: [bun, node, cargo, rustup, make, git, jq]
decisions:
  - "Bundle identifier: com.<package scope>.<project slug> (default). It names the app's data directories, so changing it after release orphans user data."
  - "Target platforms: the developer's OS for bundles, with every library crate compiling on macOS, Linux, and Windows (default)."
  - "Node version: current LTS (default), recorded in .node-version and engines.node."
merge: [.claude/settings.json]
fragments:
  required: [claude-harness]
  default: [git-hooks, ci-github]
  optional: [rr, ce-plugin]
env:
  PORT_WEB: "1420"
verify:
  - { name: install, phase: setup, layer: install, run: make install }
  - { name: lint, layer: lint, run: make lint }
  - { name: typecheck, layer: typecheck, run: make typecheck }
  - { name: test, layer: test, run: make test }
  - { name: bindings, layer: check, run: make bindings-check }
  - { name: architecture, layer: lint, run: make architecture-check }
  - { name: e2e, layer: test, run: make e2e }
  - { name: build, layer: build, run: make build, tags: [prod] }
  - name: web
    phase: serve
    layer: serve
    run: make dev-web
    expect: { http: "http://localhost:${PORT_WEB}/", within: 90s }
  - name: readme-filled
    layer: check
    run: "test -s README.md && ! grep -n 'quickstack:fill' README.md"
commands:
  install: Install JS dependencies, the pinned Rust toolchain and crates, and Playwright's Chromium
  dev: Run the full app (tauri dev; Vite on PORT_WEB plus the Rust shell)
  dev-web: Run the frontend alone in a browser on the mock transport
  build: Build the production app bundle
  bindings: Regenerate src/core/generated/ from the Rust commands and types
  bindings-check: Fail if the committed bindings differ from a fresh export
  lint: lint-web and lint-rust
  lint-web: Biome
  lint-rust: cargo fmt --check and clippy with warnings denied
  format: Biome format and safe fixes, cargo fmt
  typecheck: typecheck-web and typecheck-rust
  typecheck-web: tsc over every TypeScript project
  typecheck-rust: cargo check over the workspace
  test: test-web and test-rust
  test-web: Vitest
  test-rust: cargo test over the workspace
  coverage: Vitest with coverage
  e2e: Playwright against the Vite dev server on the mock transport
  architecture-check: Check Cargo dependency edges against the crate policy
  check: Lint, typecheck, tests, bindings drift, crate policy, and e2e
  clean: Remove build, test, and coverage output
---

# Tauri desktop app with React

One desktop application. Rust owns data and behavior in a workspace of library crates; `src-tauri/` is a thin shell that registers commands, channels, windows, and plugins. The React frontend renders inside Tauri webviews and reaches Rust only through `@core/transport`, which has a native adapter over the generated bindings and a mock adapter that the browser dev server, Vitest, and Playwright use. The Makefile is the entry point for both halves.

The proving slice is one typed command and one live channel, exercised end to end: a `core` crate computes the values, the shell exposes `app_info` (name, version, and OS through a typed `Result`) and `subscribe_ticks` (a Channel that sends a counter and timestamp once a second until the window drops it), the bindings are generated, both transports implement them, and one window renders both. Stop there; product features come after a green verify.

## Layout

```
Cargo.toml            workspace: members crates/* and src-tauri, shared deps and lints
crates/<slug>-core/   pure Rust: domain types and logic, no Tauri
src-tauri/            app shell: lib.rs (specta builder, setup), commands, error.rs, capabilities/
  examples/export_bindings.rs   writes the bindings without launching the app
src/
  core/               plain TypeScript, no React (alias @core/)
    generated/        tauri-specta output, never hand-edited
    transport.ts      the Transport contract the UI depends on
    transport/        native adapter over generated commands and Channels
    mock-transport.ts mock adapter with typed fixtures; app-transport.ts picks one
  app/                React (alias ~/): routes/<route>/{_components,_hooks,_lib}, components/ui, hooks, lib, stores
  main.tsx
tests/                shared test helpers (renderWithProviders), e2e/*.spec.ts
scripts/architecture/ crate-edges.json (the policy) and the shipped crate-edges.jq
```

Unit tests sit next to source (`*.test.ts(x)`, `#[cfg(test)] mod tests`); Rust integration tests go in `crates/<crate>/tests/`.

## Setup

1. Run the official Tauri app generator non-interactively in a temporary directory: app named with the project slug (the Makefile's `APP_CRATE` assumes it), bun, the React TypeScript template, the bundle identifier. Move its `package.json` (keep deps, replace scripts), `src-tauri/`, `index.html`, `src/`, and Vite config into the project. Keep its icons until real ones exist (list that under Deferred). Discard its README, tsconfig files (rewritten below), `.vscode/`, and any plugin the template adds that the slice doesn't use, with its capability entry. Delete the temp directory.
2. Make the root `Cargo.toml` a workspace (members `crates/*` and `src-tauri`, current edition, matching resolver) with shared `[workspace.dependencies]` and `[workspace.lints]`, then create `crates/<slug>-core` with cargo and no VCS (otherwise cargo nests a git repo while the root has no commits). Pin the toolchain in `rust-toolchain.toml` with rustfmt and clippy.
3. In `tauri.conf.json`: product name, identifier, `devUrl` on `PORT_WEB`'s default (it's fixed there, so moving `PORT_WEB` for `make dev` means editing it too), `beforeDevCommand` running the `dev:web` script and `beforeBuildCommand` building the frontend. CSP: `default-src 'self'`, the IPC origins in `connect-src`, inline styles allowed for Vite and Tailwind, no remote scripts, and a dev CSP that also allows the HMR websocket. Capabilities grant each window only what it uses; the app's own commands need no permission, so start from an empty list.
4. Add the `app` and `dev` deps with bun and the Rust deps with cargo at compatible current versions; `@types/node` matches the Node major. Set `packageManager`, `.node-version`, and engines.
5. Initialize shadcn non-interactively (pick its base and preset explicitly; it prompts otherwise) with aliases into `src/app/`, and drop deps it made unused. Write `scripts/architecture/crate-edges.json`, configure the tools below, build the slice, and fill README and AGENTS.md.

## IPC and the transport boundary

Rust types are the single source of truth for IPC. Commands and events derive `specta::Type` and register with one tauri-specta builder exposed from the shell's lib (`specta_builder()`), used by both `run()` and `examples/export_bindings.rs`. The example takes an output path; `make bindings` writes `src/core/generated/bindings.ts`, and `make bindings-check` exports to a temp file and diffs, so the check works before the first commit. Normalize trailing whitespace in the export so formatting hooks don't fight the generator. Exclude `src/core/generated/` from Biome, coverage, and whitespace fixers, and commit it.

Commands return `Result<T, CommandError>`, where `CommandError` is a serializable, specta-typed enum tagged by `kind`, so the frontend branches on `{ status: "error", error }`. Library crates define their own `thiserror` errors; the shell maps them to variants. The TypeScript exporter refuses 64-bit integers by default: use `u32` where it fits, otherwise override the field's exported type to `number` and document the 2^53 bound on the field. Avoid `f64` for values that are never NaN.

`src/core/transport.ts` exports the `Transport` contract: one method per command and per channel subscription, returning generated types, plus the current window label. `transport/native.ts` implements it with the generated `commands`, Tauri `Channel`s, and the window API; `mock-transport.ts` implements it with fixtures typed by the generated types, so a Rust type change breaks the mock at compile time, and reads the window label from the query string. `app-transport.ts` picks native when running inside Tauri and `VITE_TRANSPORT` isn't `mock`, otherwise the mock, configured from the query string (window, scenario, ticks off for stable screenshots). Only `src/core/transport/**` and `app-transport.ts` import `@tauri-apps/*` or the generated `commands`/`events`. Tests push mock frames explicitly. When Rust publishes a new fact, the mock reproduces it in the same change.

A subscription command is async and resolves when the channel's send fails (the window dropped it) or the stream ends; the native adapter treats settlement as the end of the stream, which drives the reconnecting state. Add an unsubscribe command when a stream must stop early.

## Frontend

`src/core/` has no React imports and is testable without rendering; use `zustand/vanilla` there. Components get the transport from a provider. Command results go through TanStack Query with centralized query keys; channel data feeds a zustand store created per provider (no module-level singleton), and consumers select narrow slices so a 1 Hz frame re-renders only what changed. Rust decides when a channel stops; don't rely on timers or `visibilitychange` in hidden webviews. React Router runs in memory mode; each window maps to an entry route by the transport's window label. There is no server and no SSR. Configure Tailwind through its Vite plugin with semantic color tokens; files are kebab-case with named exports.

A route-level error boundary catches render errors. A transport rejection is a failure, never an empty success, and an ended channel shows a visible reconnecting state instead of a frozen last value.

## Rust

Dependencies point one way: shell -> core crates. `scripts/architecture/crate-edges.json` is an allowlist mapping every workspace member to its permitted `normal` and `dev` path dependencies (`{"<slug>-core": {"normal": [], "dev": []}, "<app crate>": {"normal": ["<slug>-core"], "dev": []}}`); `make architecture-check` pipes `cargo metadata --no-deps` through the shipped `crate-edges.jq`, which fails on unlisted members and forbidden edges. A new edge is a design change: update the policy deliberately, never just to silence the check.

Logic that isn't Tauri-specific lives in a crate, testable without a webview. The shell uses `anyhow` with `.context(...)` at each boundary; never in a library's public API. Deny `clippy::unwrap_used`, `expect_used`, and `panic` in workspace lints and allow them in tests through clippy's config; a locally proven invariant takes a scoped `#[expect(clippy::expect_used, reason = "...")]`. A background task never takes the process down; it logs once and carries on. Platform code is gated with `cfg(target_os)` at module level, `unsafe` stays in one module per API with a `// SAFETY:` comment per block, and library crates must `cargo check` on every target platform. Prefer crates with bundled C libraries so the app needs no system installs.

## Tool configuration

- Biome: recommended rules plus a11y, exhaustive hook deps, unused imports/variables, sorted Tailwind classes in `cn`/`cva`/`clsx`; two spaces, double quotes, organized imports, VCS ignores, Tailwind directives. `noRestrictedImports` overrides enforce the boundary: `src/core/**` forbids React packages, `~/`, and zustand's React entries, and outside `transport/**` and `app-transport.ts` also `@tauri-apps/**` and the generated `commands`/`events`; `src/app/**`, `main.tsx`, and tests forbid `@tauri-apps/**`, the generated `commands`/`events`, and `@core/transport/*`. The shipped write hook mirrors these.
- TypeScript: a base config with strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, bundler resolution, and `paths` for `~/*` and `@core/*`; projects for browser code (the root `tsconfig.json`, DOM and Vite types only), tests (adds test and Node globals), and Node tooling (configs, scripts, agent hooks). List `types` explicitly in each. `typecheck` runs all of them. Vite and Vitest build `resolve.alias` from the base config's `paths`, since tsconfig-path resolution skips files outside a project's include.
- Vitest: happy-dom, Testing Library cleanup and jest-dom, `src/**` and `tests/**` excluding e2e, capped workers, coverage over `src/` minus generated code and `main.tsx`.
- Playwright: Chromium, starts its own Vite server with `VITE_TRANSPORT=mock` on a free port and never reuses one, CI forbidOnly, traces on failure.
- Rust: rustfmt with stable options only and width 100; clippy with `-D warnings` over `--workspace --all-targets`; an `#[allow]` needs a comment saying why.

## Testing

Mock at the transport seam on the frontend and at traits on the Rust side; never mock internal modules or `vi.mock` Tauri packages. Cover the slice at every layer: core unit tests; a shell test driving the tick loop with paused tokio time (including a skipped tick) through a sink trait or Tauri's test runtime; a Vitest test that renders the window through `renderWithProviders`, pushes two frames into the mock, and asserts what renders, plus the command error path and the ended-channel state; a render-count test proving a frame that changes one slice doesn't re-render a sibling; and a Playwright test that loads the window on the mock and sees the app info and a changing tick. Playwright can't drive the packaged webview (WebDriver doesn't support WKWebView on macOS), so the real webview is covered by Rust tests and a manual `make dev` check; list that under Pending user actions when you can't open a window.

<!-- quickstack:when with=ci-github -->
CI has two jobs plus the aggregate `ci-ok`. The frontend job on Ubuntu runs `make install` (CI set: frozen lockfile, browser system deps), `lint-web`, `typecheck-web`, `coverage`, and `e2e`. The Rust job on the bundle platform (macOS by default) caches cargo and runs `lint-rust`, `test-rust`, `bindings-check`, and `architecture-check`; the toolchain comes from `rust-toolchain.toml`. A Linux Rust job needs Tauri's WebKitGTK packages. Upload Playwright reports on failure.
<!-- quickstack:end -->

<!-- quickstack:when with=git-hooks -->
pre-commit runs Biome on staged frontend files and `cargo fmt` when Rust is staged, re-staging fixes; pre-push runs `make lint` and `make test`. Leave `make check` (bindings export and Playwright) to CI and to the end of a task.
<!-- quickstack:end -->

## Commands

The shipped `Makefile` declares every target; adapt recipes, keep the names. On the frontend side it calls package scripts `dev:web` (Vite), `tauri`, `lint`, `format`, `typecheck`, `test`, `coverage`, and `test:e2e`. `check` is the gate. Record anything else (a release build, a Linux cross-check) as a new target and in `commands`.

## Gotchas

- `tauri::generate_context!` embeds the frontend dist at compile time, so any cargo build of the shell needs `dist/` to exist; the Makefile's `stub-dist` creates it, and CI must too.
- Vite needs a fixed port with strictPort for `tauri dev`; Playwright overrides it. Vite's watcher should ignore `src-tauri/`, `crates/`, and `target/`.
- While tauri-specta 2 is a release candidate: pin `specta`, `specta-typescript`, and `tauri-specta` to exact matching versions and record them under Build workarounds; enable tauri's `specta` feature so a command taking a `Channel` can register; and use the exporter's own number type in the field override for 64-bit integers, which puts a specta dependency in the crate that owns the type. A bindings diff with no Rust type change means the generator moved.
- Vitest, Vite, and Playwright run on Node; don't substitute `bun test` or force `--bun`.
- Newer TypeScript majors default `types` to none, which is why each project lists them.
- On Linux, building the shell needs WebKitGTK and related system packages; library crates don't.
