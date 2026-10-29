# TypeScript API tool configuration

Check configuration against the installed tool releases.

Biome starts from its current generated config: recommended rules as `"rules": { "preset": "recommended" }`, import and export type discipline, organized imports, two spaces, double quotes, width 100, VCS ignores, folder ignores without a trailing glob, and the shipped `biome-plugins/boundaries.grit`. Scope `files.includes` to code and JSON. Check Grit against the installed Biome syntax and preserve each rule when adapting it. Grit sees `process.x` reads and assignments; the boundary hook also catches destructuring. Keep the shipped boundary probes enabled.

TypeScript is two projects, both strict with unchecked index access, verbatim module syntax, erasable syntax only and no emit, and `typecheck` runs both. `tsconfig.json` covers `src/` and `tests/` (minus `tests/hooks/`) with `nodenext` resolution, relative imports with `.ts` extensions (`allowImportingTsExtensions`) and no path aliases, because Node runs the source as written. `tsconfig.tools.json` covers `scripts/`, `.claude/hooks/`, `tests/hooks/` and `tests/helpers/hooks.ts` with `bundler` resolution and Bun's types, because the shipped scripts and hooks import without extensions.

Vitest runs on Node without `.env`, external network or credentials; clear credentials before imports. The `tests/http-contract.test.ts` suite covers the full error/request/logging matrix through both Node and platform-free web transports.
