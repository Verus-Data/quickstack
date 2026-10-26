# Claude adapter

CLAUDE.md imports canonical AGENTS.md. docs/harness.md describes ownership. The settings file wires owned hooks once and allows project checks/source development while guarding destructive operations. No optional marketplace plugin is required.

| Hook | Purpose |
| --- | --- |
| session-start.sh | Repository, dependency, jq and environment advisory |
| project-status.ts | Bun version mismatch and newly appended warn/error logs |
| block-destructive.sh | Destructive command deny/near-miss checks |
| detect-secrets.sh | Credential-shaped edit guard |
| lint-on-write.sh | Local Biome advisory and session edit tracking |
| format-changed.sh | Format only this session's recorded edits |
| guard-commands.ts | Shared package command rules |
| guard-generated.ts | Build/coverage/lockfile edit guard |
| guard-cli-commands.ts | Node unit runner and explicitly scoped Bun binary tests |
| guard-boundaries.ts | Platform, Schema, env and output boundary guard |
| typecheck-on-write.ts | Bounded TypeScript advisory |
| _lib.ts, _shell.ts | Protocol/process and shell parsing helpers |
| _lib.sh, _destructive-patterns.sh | Bash 3.2 helpers and deny patterns |

rules/typescript.md applies to every TypeScript file in the repo. rules/cli holds the packages/cli contract, service/config/logging, tests and verification rules, and rules/cli/effect.md, which links skills/effect/SKILL.md, checked against the installed packages. Commands /check, /test and /feature orchestrate work; agents/architect.md and reviewer.md are read-only.

jq powers Bash payload parsing. Hooks never download tools. Missing optional tools cause quiet/advisory behavior; guards explain denies. Tests execute helpers and exercise actual boundary rules. Personal settings.local.json is ignored. `.env` is optional here even when the generic session-start advisory mentions it.
