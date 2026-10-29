---
schema_version: 1
id: bun-release
kind: fragment
category: release
name: Bun binary releases
description: Release a Bun-compiled CLI as standalone binaries for macOS and glibc Linux on x64 and arm64, with SHA256SUMS, a checksum-verifying install.sh, an atomic self-update command and a tag-triggered GitHub release workflow.
tags: [bun, release]
applies_to: [typescript-cli]
tools: [bun]
decisions:
  - "Release targets: darwin arm64 and x64, Linux x64 and arm64 with glibc (default). Defer musl and Windows."
  - "Releases repository: package scope/project slug on GitHub (default). Record confirmation under Pending user actions."
verify:
  - { name: release-build-all, layer: build, run: bun run build:all }
commands:
  build:all: Compile each release target and write SHA256SUMS
---

# Bun binary releases

The stack's host build remains independent. Extend its build script with `--all`, producing `dist/<slug>-<os>-<arch>` and SHA256SUMS. Disable dotenv and bunfig autoload, minify, and remove linked sourcemaps from distributable output. Keep version and asset naming consistent across build, installer, and update.

The shipped `install.sh` detects the supported OS/architecture, selects the release asset, verifies SHA256SUMS, and atomically renames into the configured install directory. Add the prefixed RELEASES_REPO, RELEASES_URL, and INSTALL_DIR variables to the stack-owned config, `.env.example`, and README. Never replace an existing binary on failed download or checksum mismatch. If the package scope is empty (unscoped project), the installer's default repository has no owner: ask the user for the GitHub owner, make it the RELEASES_REPO default, and record it under Pending user actions.

Implement an `update` command with `--check`. Read release settings independently so broken application configuration cannot block repair. Refuse replacement when running from source. Download to a temporary file beside the running binary, verify checksum, chmod executable, and atomically rename. Permission failures have an actionable hint; checksum and network failures preserve the old binary. Use a Releases service and local `startStubReleases` test server with release metadata, assets, checksums, and scriptable failures.

Write `.github/workflows/release.yml` using current workflow conventions: on version tags, verify the tag matches package version, run the project check command, build all targets, upload binaries/checksums/installer, and run each artifact on its matching OS and CPU. Smoke-test checksum, `--version`, and `doctor --json`. Only the publish job receives contents-write permission and creates the GitHub release with generated notes. Use the CI fragment's action-pinning and timeout conventions when selected.

When native packages are present, install optional packages for all release targets and make the bundler include only the target's native library, failing clearly if it is absent. Otherwise no native-package plugin is needed.
<!-- stacks:when with=openrouter-chat-cli -->
Apply this to the OpenTUI packages and extend the smoke matrix with `doctor --tui --json`.
<!-- stacks:end -->

Test installation paths with spaces and shell metacharacters, missing binary/checksum assets, checksum mismatch, unsupported platforms, permissions, source-mode update refusal, atomic replacement, and version comparison against a local release server. Keep network access outside automated verification. Document distribution commands and recovery in AGENTS.md.
