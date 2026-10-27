# Configuration

stacks works with no configuration. Everything here is optional.

## config.json

Optional configuration is `$XDG_CONFIG_HOME/stacks/config.json`, defaulting to `$HOME/.config/stacks/config.json`. Its closed schema accepts these optional keys and rejects any other. Environment values override file values; blank values count as absent. Configuration is read lazily and cached for one invocation, so `--help`, `--version` and `doctor` still work when the file is broken.

```json
{
  "agents": ["claude", "codex"],
  "always": ["git-hooks"],
  "author": "A. Name",
  "package_scope": "@acme",
  "preset": "sandbox"
}
```

| Key | Meaning |
| --- | --- |
| `dataDir` | Data path; `STACKS_DATA_DIR` overrides it |
| `always` | Fragment ids added to every composition they fit; one that doesn't fit, or doesn't exist, is skipped with a warning. `--without` still removes one |
| `agents` | Agents whose `adapters/<agent>/` files are written: any of `claude`, `codex`, `opencode`, `cursor`. `--agents` overrides it; the default is `["claude"]` |
| `author` | Author name for templates |
| `package_scope` | npm scope for templates, such as `@acme` |
| `preset` | `default` or `sandbox` for `new`; `--preset` and `--sandbox` override it |

Your own stacks and fragments live beside this file, in `stacks/<id>/` and `fragments/<id>/`.

## Environment variables

| Setting | Meaning |
| --- | --- |
| `STACKS_DATA_DIR` | Data path; defaults to `$XDG_DATA_HOME/stacks` (`$HOME/.local/share/stacks`) |
| `STACKS_STATE_DIR` | Project state records; defaults to `$XDG_STATE_HOME/stacks` (`$HOME/.local/state/stacks`) |
| `STACKS_LOG_FORMAT` | `json` for JSON diagnostics, otherwise plain readable logs |
| `STACKS_LOG_FILE` | Optional JSONL file; the directory is recreated when needed |
| `LOG_LEVEL` | trace/debug/info/warn/error/fatal/none; default and invalid-value fallback warn |
| `STACKS_REGISTRY_DIR` | A directory used as the bundled registry instead of the one shipped with the CLI, relative to the working directory; its entries are untrusted |
| `NO_COLOR` | Keep output free of ANSI (the current formatter always uses plain text) |
| `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME` | Path roots; an unset `HOME` means the user's home directory. The cache is `$XDG_CACHE_HOME/stacks` (`$HOME/.cache/stacks`) |

## The development wrapper

`bun run dev` runs the CLI from source. It sets info logging, appends `logs/cli.jsonl` (the info records land there whoever reads the output; on stderr only for a human), copies noninteractive stderr to `logs/cli.log`, and uses `.dev/data` and `.dev/state`. Logs rotate above 5 MiB. It forwards arguments, terminal behavior, signals and the child's exit status. `.env` is optional for source development. The published package is a Node bundle and reads no `.env` file.

`bun run dev` runs in the directory you ran it from (a subdirectory of the repo works), with Bun's `.env` and `bunfig.toml` autoload off there. From outside the repo, Bun hides that directory, so pass it: `INIT_CWD="$PWD" bun run --cwd <repo> dev new <stack> app`.
