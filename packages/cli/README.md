# quickstack

`quickstack` starts projects for coding agents. You pick a stack, it writes a few starter files and a brief, your coding agent builds the project from the brief, and `quickstack verify` says when it's done. To try it, follow the [quick start](docs/quickstart.md).

```sh
npx quickstack list stacks                  # Node 22+, macOS or Linux
npx quickstack new typescript-cli my-cli
npm install -g quickstack                   # optional: then just `quickstack`
```

The CLI is TypeScript on Effect, compiled to one binary by Bun. It executes nothing it reads: only `verify` runs commands, and only the steps in a project's own manifest. [How quickstack works](docs/architecture.md) explains the design, and the [docs index](docs/README.md) lists everything else: concepts, agents, authoring, and the command, output, configuration and validation references.

## Bundled stacks

| Stack | What it builds | App (`--with`) |
| --- | --- | --- |
| `astro-blog` | Static Astro blog: MDX posts in a validated collection, React islands, Tailwind, RSS and sitemap | |
| `cloudflare-react-router` | React Router on the local Workers runtime with typed bindings and Workers integration tests | |
| `go-cli` | Go CLI: cobra, viper config, structured errors, human and JSON output, golangci-lint | |
| `mobile-expo` | Expo Router app and a Bun + Hono API on Postgres, sharing zod schemas through a typed client | |
| `python-react` | FastAPI backend and a React SPA talking through a client generated from the OpenAPI spec | |
| `react-router` | React Router framework mode with SSR, Effect services, typed HTTP errors, Tailwind and shadcn | `openrouter-chat` |
| `tauri-react` | Tauri desktop app: Rust crates behind a thin shell, typed IPC, a React frontend with a mock transport | |
| `typescript-cli` | Bun-compiled TypeScript CLI on Effect with typed errors, safe output and logs | `openrouter-chat-cli` |

`quickstack list` shows each stack's fragments; `validate` reports every stack's composed brief size in both presets.

## Development

Use Bun 1.4.2 and Node 24 LTS. Install lefthook (`brew install lefthook` on macOS) and jq for the development hooks.

```sh
bun install
bun run dev doctor            # the CLI from source
bun run build                 # compile dist/quickstack
./dist/quickstack --version
bun run check                 # this package's gate
```

`bun run dev` runs the CLI from source in the directory you ran it from; [Configuration](docs/reference/configuration.md#the-development-wrapper) covers its logs, data directories and how to run it from outside the repo.

`bun run check` runs Biome (including the boundary plugin), TypeScript, Vitest on Node, then the compiled binary checks under Bun. `bun run coverage` measures application code. Tests isolate HOME/XDG and clear credentials; compiled tests create their environment from scratch. No `.env`, credentials or external services are needed.

Commands here run from `packages/cli/`; the repo root has the same names fanned out to every package. See [AGENTS.md](../../AGENTS.md), [the harness guide](../../docs/harness.md), and [the installed Effect guide](../../.claude/skills/effect/SKILL.md). CI reads Bun from packageManager through [setup-bun](https://github.com/oven-sh/setup-bun). Maintainer tasks (the bench, the ledger, publishing the plugin) are in [Maintaining the bundled registry](docs/maintaining.md).
