# quickstacks

A bun workspace. Product planning is in [plans/](plans/README.md) and [product/](product/PROBLEM_STATEMENT.md); there is no product code yet.

| Path | What it is |
| --- | --- |
| [apps/cli](apps/cli/README.md) | The `quickstacks` CLI: the bare `typescript-cli` base (Effect 4, Bun-compiled binary, `doctor` and `--version` only) |
| `apps/` | Later deployables, each its own package (an API and an MCP server are planned) |
| `packages/` | Shared libraries, when two apps need the same code |
| `.claude/`, `docs/harness.md` | The agent harness: hooks, rules, skills and their tests in `tests/hooks/` |

## Quick start

Use Bun 1.4.2 and Node 24 LTS. Install lefthook (`brew install lefthook` on macOS) and jq for the development hooks.

```sh
bun install
bun run dev doctor --json   # the CLI from source
bun run check               # lint, typecheck, hook tests, every package's tests and e2e
```

Root scripts fan out to every workspace package with `bun run --filter '*' <script>`; run a package's own scripts from its directory. See [AGENTS.md](AGENTS.md) for the full command list.
