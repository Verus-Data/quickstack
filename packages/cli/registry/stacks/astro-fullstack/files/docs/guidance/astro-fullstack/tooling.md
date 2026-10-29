# Astro site + Effect API tool configuration

Check configuration against the installed tool releases.

Biome covers TypeScript, TSX and JSON in every workspace: recommended rules, type-import discipline, organized imports, two spaces, double quotes, width 100 and the shipped `biome-plugins/boundaries.grit`, ignoring `dist/`, `.astro/` and `coverage/`. Keep the shipped boundary probes enabled. `.astro` files are checked by `astro check`. TypeScript is strict in every project, with unchecked index access, verbatim module syntax, erasable syntax only and no emit:

- contract and API: `nodenext` with `.ts` relative imports and no path aliases
- site: Astro's strict preset with `jsx: "react-jsx"` and `allowImportingTsExtensions`, since it type-checks the contract's source
- `tsconfig.tools.json`: `bundler` resolution with Bun's types, because the shipped scripts and hooks import without extensions

`typecheck` runs all four checks.

Vitest runs on Node without `.env`, external network or credentials. The `apps/api/tests/http-contract.test.ts` suite covers the full error/request/logging/static-file matrix through Node and platform-free web transports. The site uses `getViteConfig()`, happy-dom and Testing Library: test ApiStatus loading, success, error envelope and network failure over fake fetch.
