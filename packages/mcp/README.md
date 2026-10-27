# @quickstack/mcp

The quickstack MCP server, so agents can reach quickstack as tools. Placeholder: this package has no code, scripts or dependencies yet, so the root scripts skip it.

When work starts here, the package follows the layout in the [root README](../../README.md#monorepo): its own `src/`, tests, `tsconfig.json` extending `../../tsconfig.base.json`, scripts named like the CLI's (`build`, `typecheck`, `test`, `e2e`, `check`) so the root gate picks them up, and dependency versions from the root catalog. If it reuses CLI logic, that code moves into a shared package rather than being imported from `packages/cli/src`.
