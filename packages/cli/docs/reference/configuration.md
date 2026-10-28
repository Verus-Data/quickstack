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
| `telemetry` | `false` disables anonymous usage collection. Prefer `stacks telemetry disable`, which also removes pending events and identity |

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
| `STACKS_INDEX_URL` | Optional remote index URL, with no default in this release. Without it or a compiled-in official URL, the remote origin is off and makes no requests. HTTPS is required except for HTTP on `localhost` or `127.0.0.1`. Invalid URLs are never fetched. URLs other than a supplied official URL skip official signature verification and their entries are untrusted |
| `STACKS_OFFLINE` | `1` disables remote registry requests; the shared `--offline` flag does the same. Verified cached entries remain available |
| `STACKS_DEV_API_URL` | Source builds only: loopback API base URL for search, using HTTP or HTTPS on `localhost`, `127.0.0.1` or `[::1]`, without credentials, query or fragment. Release builds ignore it. No hosted API URL is configured yet |
| `DO_NOT_TRACK`, `STACKS_TELEMETRY_DISABLED` | Any value except empty, `0` or `false` disables telemetry |
| `STACKS_TELEMETRY_URL` | Optional telemetry server URL; no official URL is configured. Source builds never collect |
| `STACKS_TELEMETRY_DEBUG` | `1` prints schema-valid events to stderr instead of queuing or sending; consent still applies |
| `CI` | Any set value, including empty, disables telemetry |
| `NO_COLOR` | Any nonempty value turns off color and the live progress line, so human output carries no ANSI escapes; it wins over `FORCE_COLOR`. JSON and agent output never carry them |
| `FORCE_COLOR` | `1` colors human output even through a pipe (for `bun run human` and tests); it never colors JSON or agent output |
| `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME` | Path roots; an unset `HOME` means the user's home directory. The cache is `$XDG_CACHE_HOME/stacks` (`$HOME/.cache/stacks`) |

`--offline` and `STACKS_OFFLINE=1` also disable search API requests.
`DO_NOT_TRACK` disables search API requests with the same value rules; `STACKS_TELEMETRY_DISABLED`
controls telemetry only. See [Search](search.md) for local ranking and its separate backoff file.

## Remote registry cache

`list`, `show`, `new` and `add` read a configured index lazily. `STACKS_INDEX_URL` takes precedence over the official URL supplied by the CLI's entry point. This release supplies no official URL; with neither URL, the origin stays off, existing index caches are unused, and `doctor --json` reports `remoteIndex.url: null` and `isDefaultUrl: false`. Otherwise `isDefaultUrl` means the effective URL matches the supplied official URL, whose signature is verified against the compiled-in key list.

The cache under `$XDG_CACHE_HOME/stacks/index/` holds the verified envelope (`index.json`), URL, timestamps, outcomes and request backoff (`state.json`), and verified extracted bundles (`entries/<digest>/`). A cache for another URL is ignored. Cached envelopes and bundles are checked again before use, including offline.

An index younger than 24 hours needs no refresh. A request has a 1,500 ms deadline; failure retains the previous verified index or uses the bundled registry. Retries wait ten minutes, or 24 hours for a 404. A missing bundle backs off that bundle without hiding unrelated entries. Cache write failures keep the current invocation usable with temporary extracted files. `doctor --json` reports the cache timestamps and last outcome without contacting the server; `verify` never consults the remote registry.

## The development wrapper

Every command accepts `--no-telemetry` to skip collection for one invocation, retaining pending events. Offline invocations also record and send nothing. See [Telemetry](telemetry.md) for consent precedence, state files, privacy and commands.

`bun run dev` runs the CLI from source. It sets info logging, appends `logs/cli.jsonl` (the info records land there whoever reads the output; on stderr only for a human), copies noninteractive stderr to `logs/cli.log`, and uses `.dev/data` and `.dev/state`. Logs rotate above 5 MiB. It forwards arguments, terminal behavior, signals and the child's exit status. `.env` is optional for source development. The published package is a Node bundle and reads no `.env` file.

`bun run dev` runs in the directory you ran it from (a subdirectory of the repo works), with Bun's `.env` and `bunfig.toml` autoload off there. From outside the repo, Bun hides that directory, so pass it: `INIT_CWD="$PWD" bun run --cwd <repo> dev new <stack> app`.
