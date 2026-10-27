# quickstacks

quickstacks starts projects for coding agents. To use it, follow the [quick start](packages/cli/docs/quickstart.md); the [docs index](packages/cli/docs/README.md) has everything else.

This repository is a bun workspace. Product planning is in [plans/](plans/README.md) and [product/](product/PROBLEM_STATEMENT.md).

| Path | What it is |
| --- | --- |
| [packages/cli](packages/cli/README.md) | `quickstacks`, the CLI: Effect 4, Bun-compiled binary. `new <stack>` writes a project and the brief your coding agent builds it from; the bundled stacks are listed in its README |
| [packages/api](packages/api/README.md) | `@quickstacks/api`, the HTTP API (placeholder, no code yet) |
| [packages/mcp](packages/mcp/README.md) | `@quickstacks/mcp`, the MCP server (placeholder, no code yet) |
| `.claude/`, `docs/harness.md` | The agent harness: hooks, rules, skills and their tests in `tests/hooks/`, and the acceptance trace in `tests/acceptance/` |

## Development quick start

Use Bun 1.4.2 and Node 24 LTS. Install lefthook (`brew install lefthook` on macOS) and jq for the development hooks.

```sh
bun install
bun run dev doctor --json   # the CLI from source
bun run check               # lint, typecheck, root tests, every package's tests and e2e
```

Choose a destination outside this checkout. Start a project yourself with `bun run dev new astro-blog "$HOME/quickstacks-projects/my-blog"`, or run `bun run dev skill install` once and ask your coding agent to start one. The skill guides it through choosing a stack, reading the brief and building until verify passes. Use `--project` to install it only for the current repo, or `--print` to copy it elsewhere.

The skill ships in the next release. Once npm publication lands, the two entry points are `npx quickstacks new astro-blog my-blog` and `npx quickstacks skill install`.

See [AGENTS.md](AGENTS.md) for the full command list.

## Monorepo

Every package lives in `packages/<name>/` and is a bun workspace member (`"workspaces": { "packages": ["packages/*"] }` in the root `package.json`). There is one `bun.lock` and one `node_modules/` install at the root.

The root owns what applies to the whole repo: the agent harness (`.claude/`, `tests/hooks/`, `tests/acceptance/`), lefthook, CI, the root `biome.json`, `tsconfig.base.json`, and the dependency catalog. It has no product code. Each package owns its source, tests, scripts, `tsconfig.json`, README, and any lint plugins of its own.

Root scripts (`build`, `typecheck`, `test`, `coverage`, `e2e`, `clean`) run `bun run --filter '*' <script>`, which runs that script in every package that defines it and skips the ones that don't. So a package joins the gate by defining the standard script names, and `bun run check` at the root is the gate for everything. Inside a package, the same script names run just that package. `bun run dev` at the root runs the CLI directly (`--cwd packages/cli`) because `--filter` prefixes each output line, which would break `--json`.

Dependency versions live once, in `workspaces.catalog` in the root `package.json`; packages depend on `"catalog:"` so every package gets the same Effect, TypeScript and Vitest. A package that depends on another one uses `"workspace:*"`. Shared code goes in its own package, never imported across another package's `src/`.

To add a package:

1. Create `packages/<name>/package.json` with a scoped name (`@quickstacks/<name>`), `"private": true` and `"type": "module"`, then run `bun install`.
2. Add `tsconfig.json` extending `../../tsconfig.base.json`, which has Node types only; add `"types": ["bun", "node"]` only if the package uses Bun APIs.
3. Define the standard scripts the package supports so the root gate runs them.
4. If it needs lint rules of its own, add a nested `biome.json` with `"root": false, "extends": "//"`.
5. If agents need package-specific guidance, add `.claude/rules/<name>/` scoped to `packages/<name>/`, and note the package in AGENTS.md.
