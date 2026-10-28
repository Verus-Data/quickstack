# Changelog

All notable changes to `@steamfield/stacks`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html); before 1.0.0 a minor release may break compatibility.

## [0.3.1] - 2026-10-27

### Added

- `typescript-api` stack: a Node HTTP API on Effect's `HttpApi`, with schema-first REST resources, tagged errors mapped through one status table, structured request logs, a platform-free core that also runs as a web fetch handler, and Claude rules, commands and guards for Effect APIs, testing through HTTP and verification.
- `astro-api` stack: a bun workspace with a shared contract package, an Effect API on Node and a static Astro site with React islands that call the API through the typed client; the API can serve the built site.
- `rest-api` fragment: resource naming, methods and status codes, request and response bodies, lists and versioning conventions for any stack tagged `api`, as a Claude rule, a Cursor rule and Codex and OpenCode skills.

### Changed

- The `effect` fragment defaults to the current stable Effect major instead of 4, and the skill it has the agent write records where to look up names for the installed release.
- `docker-deploy` works for projects that use package scripts instead of a Makefile (its verify step runs `make docker-build` or `bun run docker-build`), and covers `astro-api` with one image for the API and the built site.

### Fixed

- `react-router`'s shipped `scripts/dev.ts` no longer signals its whole process group on exit, which killed the invoking shell when it ran without job control (an agent's tool or CI). The server runs in its own process group, and `dev:stop` signals only the dev wrapper.

## [0.3.0] - 2026-10-27

### Added

- `stacks update [--check]` reports the running and latest published versions and upgrades a global npm install in place. npx and other installs get the command to run. Under a detected agent the install is refused (exit 6), and `--check` always works. A registry failure is `UpstreamUnavailable` (exit 4); a failed install is the new `UpdateFailed` tag (exit 6).

## [0.2.0] - 2026-10-27

### Added

- At a terminal with several agent harnesses installed and none configured, `new` and `add` ask which one gets the project. `--launch` also takes Copilot CLI and, on macOS, the Codex app.

### Changed

- **Breaking:** the product is `stacks` everywhere. `STACKS_*` environment variables, `~/.config/stacks` and the other stacks config, data and state directories, and the `stacks:when` and `stacks:fill` markers replace their `quickstack` forms, which are no longer read.
- **Breaking:** projects keep their brief, manifest, notes and verify state under `.stacks/`. Projects written by 0.1.0 keep `.quickstack/` and aren't found by this version.

## [0.1.0] - 2026-10-27

First release, as the npm package `@steamfield/stacks` installed as `stacks` (Node 22 or newer).

### Added

- Commands: `list`, `show`, `new`, `add`, `create`, `validate`, `verify`, `runs`, `schema`, `guide`, `skill` and `doctor`, each with `--json` output, fixed exit codes and error envelopes with a next action.
- Bundled stacks: `astro-blog`, `cloudflare-react-router`, `go-cli`, `mobile-expo`, `python-react`, `react-router`, `tauri-react` and `typescript-cli`, with 19 fragments.

[0.3.1]: https://github.com/steamfield/stacks/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/steamfield/stacks/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/steamfield/stacks/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/steamfield/stacks/releases/tag/v0.1.0
