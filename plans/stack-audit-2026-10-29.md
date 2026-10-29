# Bundled stack audit

Status: COMPLETE 2026-10-29. Finding 1 fixed 2026-10-29; the other recommendations are not implemented.

All ten stacks define testing tools and a concrete proving slice. The useful work is tightening what verification actually proves, correcting two fragment contracts, and sharing a small amount of duplicated infrastructure. There is no evidence here for replacing the testing frameworks or adding a database, auth provider, or deployment target to every stack.

The highest-priority correction is the Postgres test harness: its instructions can make concurrent runs interfere with one another. The clearest DRY opportunity is the identical development-log tooling in `typescript-api` and `astro-fullstack`.

## Scope and evidence

Audited the working tree at commit `767d69f`, including the existing uncommitted registry revision and `astro-api` → `astro-fullstack` rename. Read all ten stack recipes, the fragment recipes they compose with, file inventories, relevant shipped helpers, acceptance documents, agent rules and Makefiles. Used the stack-authoring and fragment-authoring skills, the product statement, concepts, authoring guide, and composition/verification implementation to establish what a stack promises.

Stacks intentionally leave application code and current dependency versions to the implementing agent. An absent generated config, application implementation, or pinned version is therefore not a finding.

Evidence levels in this report:

- **Composition reproduced:** ran the source CLI's brief preview and inspected the result.
- **Source confirmed:** the recipe or shipped file directly establishes the gap. Runtime consequences are explained, not presented as observed failures of a generated project.
- **Maintenance opportunity:** duplication or uneven guidance delivery with a concrete consolidation path; not a claim that the current project is broken.

No generated project was built, no external service was provisioned, and no live account or native-device behavior was tested. This is a recipe/composition audit, not a fresh bench certification. Dependency compatibility against today's upstream releases remains the implementing agent's job.

## Findings

### 1. Postgres test setup can delete another run's databases and race template migration

**Priority: high. Affects `python-react --with postgres`. Composition reproduced; concurrency consequence established from the prescribed sequence.**

The [Postgres fragment](../packages/cli/registry/fragments/postgres/FRAGMENT.md), under “Test harness,” tells the agent to take a fixed advisory lock, delete databases by prefix, recreate the fixed `<project>_template`, release the lock, and then migrate it. A second run can acquire the lock while the first is migrating or using its template. Prefix-based cleanup can also target databases belonging to a live run. A lock held only during recreation does not protect the later migration and cloning lifecycle.

This is already solved more carefully in [mobile-expo's testing guide](../packages/cli/registry/stacks/mobile-expo/files/docs/testing.md.tmpl): each run owns a uniquely named template, migrates under the lock, and deletes only exact database names it created. The two recipes have drifted on a consequential test-infrastructure rule.

**Recommendation:** bring the Postgres fragment into line with mobile's ownership contract. Use a run identifier shared by that run's parallel workers, coordinate template initialization through migration completion, close template connections before cloning, and clean up only owned names. Add a regression that overlaps two test runs, checks that one run's teardown cannot remove the other's databases, and exercises failed initialization cleanup.

The same composed Python brief also contains an unconditional Drizzle paragraph, while the fragment declares `applies_to: [python-react]` and lists unused Go and TypeScript dependency roles. Remove those unreachable roles and instructions unless support for those stacks is deliberately implemented. Do not broaden `applies_to` alone: the fragment currently assumes Python layout and Makefile commands.

### 2. Go's integration suite is defined but omitted from both verify and CI

**Priority: medium. Affects `go-cli`. Source confirmed.**

The [stack](../packages/cli/registry/stacks/go-cli/STACK.md) requires black-box binary tests under `tests/integration/` with the `integration` build tag. The [shipped Makefile](../packages/cli/registry/stacks/go-cli/files/Makefile.tmpl) runs them only through `test-integration`:

```make
test:
    go test ./...
test-integration:
    go test -tags integration ./tests/integration/...
coverage:
    go test -race -coverprofile=coverage.out -covermode=atomic ./...
ci: fmt-check lint coverage vuln build
```

Neither verify nor the prescribed CI sequence calls `test-integration`. The smoke target runs only `--help` and `--version`; it does not exercise the binary's config precedence, real exit codes, or error/output behavior. Configuring the integration tag for linting does not execute these tests.

**Recommendation:** add `make test-integration` to verify and the `ci` target. Keep the fast unit command separate. Prove the wiring by introducing a failing integration assertion and checking that both verification paths fail.

### 3. Bun binary releases are accepted by stacks that do not produce a CLI

**Priority: medium. Affects Bun-tagged web, API and mobile stacks. Composition reproduced with `astro-blog`.**

[`bun-release`](../packages/cli/registry/fragments/bun-release/FRAGMENT.md) declares `applies_to: [bun]`. Its actual contract assumes a compiled CLI, an `update --check` command, prefixed release configuration, and `doctor --json`. Bun is also the package manager for several stacks with none of those features.

This succeeds without a compatibility error:

```sh
bun run dev validate --brief astro-blog --with bun-release --sandbox --json
```

The resulting static-blog brief includes the CLI self-update instructions and the `release-build-all` step. Not listing the fragment in a stack's `optional` list does not prevent explicit selection: [compatibility matches a stack id or any one tag](../packages/cli/src/core/compose/selection.ts).

**Recommendation:** restrict the fragment to `typescript-cli` for now. If another compatible CLI arrives, add its id or introduce a narrowly defined capability tag. Listing `[bun, cli]` would still mean either tag, not both, so it would not fix this. Add negative composition tests for representative non-CLI Bun stacks.

### 4. Sandbox verification skips the static builds that prove the web deliverable

**Priority: medium. Affects `astro-blog` and `python-react`. Source confirmed.**

Both stacks mark their ordinary local `make build` step `tags: [prod]`: [Astro](../packages/cli/registry/stacks/astro-blog/STACK.md) and [Python/React](../packages/cli/registry/stacks/python-react/STACK.md). [Verify planning](../packages/cli/src/core/verify/plan.ts) skips these steps in a sandbox unless `--all` is supplied.

For Astro, the recipe explicitly calls the production build its integration test for routes, RSS, sitemap and OG output. For Python/React, it is the static SPA artifact check. A dev-server probe and unit tests can pass without either build succeeding. These builds are local and need no deployment credentials.

**Recommendation:** remove the `prod` tag from these two local builds. Keep credentialed deployment and expensive release matrices separate. Do not apply this mechanically to Tauri's native packaging step, whose platform prerequisites and cost are different. Confirm a sandbox manifest runs the builds and still performs no deployment.

### 5. React Router's base browser smoke is outside its verify contract

**Priority: medium. Affects `react-router` without an app fragment. Source confirmed.**

The [stack](../packages/cli/registry/stacks/react-router/STACK.md) promises a Playwright smoke against the production build, provides `e2e`, includes it in `check`, and requires it in CI. Its verify list instead runs install, lint, typecheck, Vitest, build and a development `/healthz` probe. It never calls `e2e` or `check`.

Consequently, a base project can reach green verify with a failing browser smoke. Build catches bundling errors, but neither that nor a health-resource probe proves the page hydrates and works in a browser. The `openrouter-chat` app adds its own e2e step; that does not cover the standalone base composition.

**Recommendation:** add the existing browser smoke to base verify, reusing the established command and browser installation. Avoid an extra identical build if practical. A deliberately failing page assertion should make base `stacks verify` fail even with `ci-github` excluded.

### 6. Tauri's cross-platform library promise lacks a corresponding check

**Priority: medium. Affects `tauri-react`. Source confirmed.**

The [platform decision and Rust guidance](../packages/cli/registry/stacks/tauri-react/STACK.md) require library crates to compile on macOS, Linux and Windows. The prescribed CI has a frontend job on Ubuntu and one Rust job on the bundle platform. The [Makefile](../packages/cli/registry/stacks/tauri-react/files/Makefile.tmpl) checks the host workspace; `--all-targets` covers Cargo target kinds, not all operating systems.

That leaves the declared library portability contract untested. This is separate from native webview E2E, which the stack already correctly identifies as a manual validation boundary.

**Recommendation:** add library-only checks on the three promised operating systems, excluding the Tauri shell so those jobs do not need its webview dependencies. Keep native packaging on the chosen bundle host. Alternatively, explicitly narrow the portability promise; the current recipe asks for all three but supplies no command or CI job that proves it.

### 7. The two Effect HTTP stacks have concrete opportunities for shared fragments

**Priority: medium maintenance opportunity. Affects `typescript-api` and `astro-fullstack`. File comparison confirmed.**

Two separable capabilities have substantial overlap:

| Capability | Evidence | Suggested owner |
| --- | --- | --- |
| Development log collection and querying | `files/scripts/dev-logs.ts` is byte-identical at 156 lines; `files/scripts/logs.ts` is byte-identical at 174 lines. Both stacks also ship the same session-status hook. | A narrowly scoped development-logs fragment, initially used by these two stacks. |
| Effect HTTP conventions and testing foundation | The two `effect-api.md` guides largely repeat middleware, error-table, config, logging and service rules. Their 45-line testing guides differ mainly in layout paths and the site reference. Both prescribe the same two-transport HTTP acceptance matrix. | An Effect HTTP guidance fragment, with stack-specific layout and static-site additions kept in the stacks. |

Sources: [API scripts](../packages/cli/registry/stacks/typescript-api/files/scripts/logs.ts), [Astro scripts](../packages/cli/registry/stacks/astro-fullstack/files/scripts/logs.ts), [API HTTP guidance](../packages/cli/registry/stacks/typescript-api/files/docs/guidance/typescript-api/effect-api.md), [Astro HTTP guidance](../packages/cli/registry/stacks/astro-fullstack/files/docs/guidance/astro-fullstack/effect-api.md), and the [API](../packages/cli/registry/stacks/typescript-api/files/docs/guidance/typescript-api/testing.md) / [Astro](../packages/cli/registry/stacks/astro-fullstack/files/docs/guidance/astro-fullstack/testing.md) testing guides.

**Recommendation:** start with the identical log modules and their tests. Make the dependency required where stack-owned scripts import its files. Leave single-server versus two-server launch logic and PID layouts in their stacks; those differences are real. Preserve generated paths where possible to avoid unnecessary migration churn.

For HTTP guidance, share the protocol and acceptance contract, with short layout-specific introductions. Keep `rest-api` framework-neutral and `effect` focused on general Effect testing/development. Neither should acquire a Node HTTP server architecture merely to remove duplication elsewhere. The React Router stack also has different routing and error-envelope semantics, so do not include it wholesale in this extraction.

Mobile and Python share the database ownership principle from finding 1, but use different drivers, runners and application lifecycles. Align that principle first; a single cross-language database harness fragment is not justified by the current implementations.

Moving unchanged prose into a required fragment reduces maintenance copies, not composed brief length. Budget relief requires cutting repeated prose or moving reference detail into linked files.

### 8. Detailed React Router and Tauri guidance is available only to Claude

**Priority: medium maintenance opportunity. Affects `react-router` and `tauri-react`. File inventory and guidance comparison confirmed.**

Both stacks give every agent the base recipe and shared agent-ops files. However, their detailed stack-specific references live only under `adapters/claude/.claude/rules/`:

- React Router: [server Effect rules](../packages/cli/registry/stacks/react-router/adapters/claude/.claude/rules/app/effect-server.md), [routes](../packages/cli/registry/stacks/react-router/adapters/claude/.claude/rules/app/routes.md), [testing](../packages/cli/registry/stacks/react-router/adapters/claude/.claude/rules/app/testing.md), TypeScript and verification.
- Tauri: [frontend](../packages/cli/registry/stacks/tauri-react/adapters/claude/.claude/rules/frontend.md), [IPC](../packages/cli/registry/stacks/tauri-react/adapters/claude/.claude/rules/ipc.md) and [Rust](../packages/cli/registry/stacks/tauri-react/adapters/claude/.claude/rules/rust.md.tmpl).

These contain more than adapter wiring: React Router's callback/runtime and route-test conventions, and Tauri's transport, channel and test-writing details. Other target agents receive the shorter recipe but not these reference files. The existing [TypeScript API guidance index](../packages/cli/registry/stacks/typescript-api/files/docs/guidance/typescript-api/index.md) shows the portable pattern already used elsewhere.

**Recommendation:** put the substantive guides under `files/docs/guidance/<stack>/`, link the index from the recipe and AGENTS instructions, and leave Claude's path-scoped files as pointers. This shares knowledge without pretending all agents have equivalent hook APIs. Preserve the distinction between portable lint/test enforcement and Claude-only write-time guards.

During that move, fix the React Router [TypeScript rule](../packages/cli/registry/stacks/react-router/adapters/claude/.claude/rules/app/typescript.md), which asserts “This is TypeScript 7” and a fixed `ES2023` library configuration despite setup installing compatible current dependencies. Make those conditions depend on the installed compiler and generated config, as the [TypeScript CLI guide](../packages/cli/registry/stacks/typescript-cli/files/docs/guidance/typescript-cli/typescript.md.tmpl) already does. This is a frozen recipe assumption, not a claim that a particular compiler version currently fails.

## Coverage of every stack

| Stack | Testing and agent setup reviewed | Findings / recommendation |
| --- | --- | --- |
| `astro-blog` | Vitest, happy-dom, Testing Library, schema/content tests, Astro check, static build and basic agent-ops. | Findings 3 and 4. No evidence that it needs a heavier harness or mandatory Playwright suite. |
| `astro-fullstack` | Vitest projects, typed client/island tests, real Node and web-handler HTTP matrix, static-file acceptance, shared guidance and Claude/Codex hooks. | Finding 7. Substantive test infrastructure is present. |
| `cloudflare-react-router` | Workers Vitest integration, real framework HTTP coverage, scheduled-handler tests, local build/serve and isolated D1 testing when selected. | No additional stack-specific finding. The recipe already anticipates virtual-module test issues and explicitly forbids replacing the framework request with a stub. |
| `go-cli` | Table-driven testify tests, config precedence, tagged binary integration tests, race/coverage target and smoke. | Finding 2. Keep Go's own test conventions. |
| `mobile-expo` | Bun API tests with real Postgres, Jest/Expo component tests, real providers/hooks, offline Clerk boundary, migration/import-graph/CI acceptance, bundle checks. | Safe database ownership is the model for finding 1. No missing test framework or invented need for device E2E in local verify. |
| `python-react` | pytest/HTTPX, lifespan tests, Vitest/Testing Library/MSW, generated OpenAPI client checks, coverage floors and separately requested Playwright smoke. | Findings 1 and 4. Playwright's exclusion from verify is explicitly documented here, unlike the base React Router proving-slice gap. |
| `react-router` | Vitest real-layer tests, component environment, Playwright production smoke, runtime/logging tests and specialized Claude guards. | Findings 5 and 8. |
| `tauri-react` | Cargo tests, paused-time channel tests, Vitest transport tests, Playwright mock-transport E2E, bindings drift and crate-edge checks. | Findings 6 and 8. Native window validation is already honestly marked external/manual. |
| `typescript-api` | Vitest with two real HTTP transports, explicit acceptance matrix, lint probes, helper tests and portable guidance. | Finding 7. The absence of a default database or authentication provider is intentional. |
| `typescript-cli` | Node Vitest, isolated HOME/config/env, real command-tree tests, compiled Bun binary tests, independent config/logging acceptance and portable guidance. | No additional default-composition finding. Its distinct runner and stdout contracts should remain stack-owned. |

Two suspected mobile issues were rejected after reading its [acceptance document](../packages/cli/registry/stacks/mobile-expo/files/docs/acceptance/mobile-expo.md): excluding Clerk explicitly changes the auth suite to an anonymous-provider test, and excluding CI changes the CI suite to assert intentional absence. Those mandatory test names do not force the optional integrations back in.

## Validation performed and limits

From the repository root:

```sh
bun run dev validate --json
bun run dev validate --brief python-react --with postgres --sandbox --json
bun run dev validate --brief astro-blog --with bun-release --sandbox --json
bun run dev validate --brief typescript-cli --without effect --sandbox --json
bun run dev validate --brief mobile-expo --with rr --sandbox --json
```

All five commands exited 0. Whole-registry validation covered **10 stacks and 20 fragments**, with **0 errors, 0 warnings and 12 notes**. Eleven notes concern changed or absent matching ledger proofs; the remaining note identifies `docker-deploy`'s Astro branch as reachable only through explicit `--with`. These notes are not proof of implementation failure.

The targeted previews confirmed that the unsafe Postgres instructions reach the Python brief, and the incompatible binary-release instructions reach the Astro blog brief. The Effect-excluded CLI preview confirmed composition is allowed; it did not establish whether an agent-built project succeeds without that fragment, so no runtime failure is claimed for it.

Budget observations: `mobile-expo --with rr --sandbox` is **5,998 / 6,000 words**. Registry validation reports `astro-fullstack --with rr --sandbox` at **5,997 / 6,000**. Both pass today. These are maintenance constraints, not current validation defects: avoid solving findings by simply appending more prose to their briefs.

The existing [handoff](HANDOFF.md) already records stale proofs from the metadata revision. This audit does not turn those historical passes into evidence for the current compositions. After applying recipe changes, run focused composition/registry tests, then bench the affected compositions before calling them proven. A shared-fragment change affects every stack that includes it.

## Recommended order

1. Correct Postgres ownership and fragment applicability (findings 1 and 3).
2. Close the concrete verification gaps (2, 4, 5 and 6).
3. Extract identical log tooling, then assess the HTTP guidance split (7).
4. Move substantive agent guidance into shared files (8).

Keep the ten stack identities. Their server runtimes, product surfaces and testing boundaries differ enough to justify separate recipes. CI and git-hook behavior is already largely shared through fragments; short stack-specific wiring notes are useful and do not need another abstraction.
