# Phase 4.0e: Official names and directory

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | The index build also writes a signed `v1/names.json` listing every stack and fragment id and verify step name that has ever been official, and `stacks-api/apps/web` builds a static directory page per indexed stack from the index output; both are deployed by a maintainer by hand with the index |
| Traces to | "Stacks don't rot" made visible: the directory shows each stack's last ledger run. "None of these are collected today": the telemetry server (4.1c) needs to know which names are official so official usage is counted and custom names are not |
| Depends on | 4.0c (the build script, the `SignedIndex` envelope, inline signing, `--check`, `_headers` and the deploy procedure), 4.0b (the `apps/web` site), 1.6c (`v*` release tags exist to read) |
| Blocks | 4.1c (official names come from `v1/names.json`), 4.2b (stats sections on the directory pages), 5.2 |
| Decisions needed | None beyond 4.0c's D21: the names file is signed exactly as the index is |
| Settles | The official-names format and sources; the directory's content and ownership; the site's design tokens; the cache rules for both |

## Scope

In:

- `OfficialNames` and `NamedComposition` schemas added to `packages/format` (additive).
- `v1/names.json`, written and signed by `build:index` in the same run as the index.
- `--check` extended to verify `v1/names.json`.
- The directory in `stacks-api/apps/web`: an Astro page at `/` and one `stacks/<id>/` page per indexed stack, generated at build time from the index output.
- The site's design tokens in `apps/web/src/styles/global.css` (below), used by every later page.
- `_headers` rules for the names file and the pages, and the deploy procedure's review step for both.

Out:

- Stats on the directory (4.2b adds them). Browsing views (4.2c).
- Any API route: everything here is a static file.
- Reading the names on the server (4.1c).

## Design

### Where this fits

4.0c built and signed the index. This sub-phase adds the names file 4.1c reads to the same build, so it is always published with the index and signed with the same key, and adds the directory pages 4.2b and 4.2c extend to the site in `stacks-api/apps/web`. The index and names file are built here because they need CLI code; the pages are built there because they are presentation and read only the published index.

### Official names (`v1/names.json`)

The index serves only proven content, so it can't be the list of what counts as official: a bundled stack that was never proven, or an optional fragment that stays bundle-only, still ships in a released CLI, and its users' events must not be rewritten to `custom` by 4.1b. Nor does `IndexEntry` list verify step names. The build therefore writes a second signed file with every name that has ever been official:

```ts
// packages/format/src/names.ts (shape)
export const NamedComposition = Schema.Struct({
  fragments: Schema.Array(EntryId),                  // the default set, or the default set plus one optional fragment
  steps: Schema.Array(Schema.String),                // verify step names of that composition
});
export const OfficialNames = Schema.Struct({
  formatVersion: Schema.Literal(1), generatedAt: Schema.String, commit: Schema.String,
  sources: Schema.Array(Schema.Struct({
    origin: Schema.Literals(["release", "index"]),
    version: Schema.optional(Schema.String),         // the CLI version for origin "release"
    stacks: Schema.Array(Schema.Struct({ id: EntryId, compositions: Schema.Array(NamedComposition) })),
    fragments: Schema.Array(EntryId),
  })),
});
```

| Source | How the build reads it |
|---|---|
| `release` | For every `v*` git tag (each a published CLI version, 1.6c and 5.0), the bundled registry at that tag: `git archive <tag> packages/cli/registry/` into a temporary directory, decoded and composed with that tree's entries using today's `compose`. A tag whose registry no longer decodes under today's format is recorded with the ids its frontmatter yields and a build warning, never dropped |
| `index` | Every entry in the index being written, and every carried-forward entry, composed from its bundles |

Each stack lists the composition of its default set and one composition per optional fragment it allows, so 4.1b can check a verify's step names against what that stack really ran. Names are only added: once a tag exists its names stay in the file. The payload is wrapped in the same `SignedIndex` envelope and signed inline by 4.0c's `--key` step with the same key, so 4.1c verifies it with `INDEX_PUBLIC_KEYS`. `--unsigned` leaves its signature empty like every other envelope. The build needs full git history (`git fetch --tags` in 5.2's checkout).

`build:index --check <base-url>` (4.0c) fetches `v1/names.json` as well as `v1/index.json`, verifies its signature, and decodes it as `OfficialNames`.

### Directory

Astro pages with static output, generated at build time from the index entries and their bundles. `apps/web` reads the `--out` directory of a `build:index` run (its path is site build config), verifies the index signature with the published `INDEX_PUBLIC_KEYS` from `@stacks/format`, and decodes it as `RegistryIndex`; a build over an index that fails either check fails. The pages ship no island here, so no client JavaScript beyond the theme toggle's inline script (Design tokens, below). The directory ships whether or not D17 is agreed, and is rebuilt after each index deploy.

- `/`: each stack's name, description, tags, last ledger run (`passed <date> with <agent>` or `carried forward from <date>`), and the copy command.
- `/stacks/<id>/`: deps by role and default and optional fragments from the stack's frontmatter, the verify steps (name, phase, layer, command), the last ledger run, a link to the entry's source in the repo, and the exact command `npx @steamfield/stacks new <id>`.

The stack's prose body is not rendered here, and the source link covers it; rendering it with Astro's Markdown support is a later choice that needs no new dependency. Each stack page has one stats section component that 4.2b fills; until then it renders as nothing.

### Design tokens

Added 2026-10-27. The site uses one token set, owned here because these are the first directory pages and they ship without D17: 4.2c's telemetry-free pages and 4.2f's stats components use the same tokens, and a set owned by a D17-gated sub-phase would leave these pages to be restyled later. The tokens are CSS variables with a Tailwind `@theme` block in `apps/web/src/styles/global.css` (`stacks-api/.claude/rules/web/astro.md`: shared tokens in `styles/global.css`), light values first and a `.dark` override; components use token classes, never hex. Values (a proposal for the maintainers):

| Token | Light | Dark |
|---|---|---|
| `background` | `#fafafa` | `#09090b` |
| `card` | `#ffffff` | `#111113` |
| `secondary` (surfaces, hover) | `#f4f4f5` | `#27272a` |
| `foreground` | `#09090b` | `#f7f8f8` |
| `muted-foreground` | `#71717a` | `#a1a1aa` |
| `border` | `#d4d4d8` | `rgba(255,255,255,0.08)` |
| `primary` (links, focus, interactive state only) | `#0891b2` | `#22d3ee` |

- Type: Inter for text with weights 400 (reading), 510 (labels) and 590 (emphasis), never 700; JetBrains Mono with `tabular-nums` for numbers, ids and commands. Body 15-16px; captions 12-13px.
- Spacing on an 8px base; cards `rounded-lg` (8px) with a 1px border and no shadow; badges 2px radius, monospace, 11px, for real state only.
- Max content width 1200px; one column on phones.
- Theme follows `prefers-color-scheme`, with a toggle whose small inline script sets `.dark` on `<html>` before first paint. It is the only script these pages carry.

4.2f adds the chart palette to the same file.

### Output

This repository's build adds to 4.0c's tree:

```
<out>/
  v1/names.json                                  SignedIndex envelope around OfficialNames
```

The site build in `stacks-api/apps/web` writes:

```
apps/web/dist/
  index.html                                     directory: every indexed stack
  stacks/<id>/index.html                         one page per indexed stack
```

4.0b's deploy assembles both into one static directory.

`_headers` rules added:

| Path | Cache-Control |
|---|---|
| `/v1/names.json` | `public, max-age=300, stale-while-revalidate=3600` |
| `/`, `/stacks/*` | `public, max-age=300` |

### Deploying by hand

4.0c's procedure in `stacks-api/apps/api/README.md` is unchanged except step 2, which also reviews the names added since the live `v1/names.json` (the script prints them), and step 3, whose deploy now builds `apps/web` over the `--out` directory first and lists the pages added or removed.

## Files and areas touched

| Path | Change |
|---|---|
| `packages/cli/scripts/build-index.ts` | Names output; `--check` covers `v1/names.json` |
| `packages/format/src/names.ts`, `src/index.ts` | New schemas, published before the site uses them |
| `packages/cli/tests/build-index.test.ts`, `tests/fixtures/index/` | Names cases, a fixture repo with tags |
| `stacks-api/apps/web/src/pages/index.astro`, `src/pages/stacks/[id]/index.astro`, `src/lib/index-data.ts` | New: the directory pages and the build-time index reader |
| `stacks-api/apps/web/src/styles/global.css`, `src/layouts/` | Design tokens, light and dark; the theme toggle |
| `stacks-api/apps/web/tests/directory.test.ts` | New, over a fixture index output |
| `stacks-api/apps/api/README.md` | Review step for names and pages |

## Acceptance tests

Over 4.0c's fixtures plus a fixture git repo with tags:

- `v1/names.json` verifies with the test key; over a fixture repo with tags `v0.1.0` and `v0.2.0`, it lists a stack that exists only at `v0.1.0`, a never-proven bundled stack and a bundle-only optional fragment, and each stack's compositions carry the step names their verify sections define (default set and each optional fragment).
- A tag whose registry fails today's decode still contributes its ids, and the build prints a warning naming the tag.
- `--check` against the local server fails, naming `v1/names.json`, when one byte of its payload changes, and passes on a good build.
- `--unsigned`: `v1/names.json` has `signature: ""`.
- In `stacks-api`, the site built over a fixture index output has one directory page per indexed stack, containing the exact string `npx @steamfield/stacks new <id>` and no `<script>` other than the inline theme script; a fixture index with a bad signature fails the site build.
- Every text token pair passes WCAG AA (4.5:1) against `background` and `card` in both themes, and no component under `src/components/` uses a hex color (a scan).
- `_headers` has the rules above; served by 4.0b's Node server, `GET /v1/names.json` and `GET /stacks/<id>/` carry them.

## Exit criteria

- Acceptance tests pass; `bun run check` green from the repo root.
- A maintainer has deployed the names file and directory once by hand with the index, and `build:index --check` passes against the live host.

## What this plan may get wrong

- Composing old tags with today's `compose` may disagree with what that release composed if composition rules changed. Step names are what 4.1b checks, and those come from verify sections, which compose by concatenation; if a rule change ever alters step names, the build should run the tag's own CLI instead.
- 2026-10-27: the directory pages were planned as plain template strings in `packages/cli/scripts/site/`. Under D35 the visualization layer moved to `stacks-api/apps/web` as an Astro site, so that directory is no longer planned here; only the signed files are built in this repository.
- 2026-10-27: the design tokens were first planned in 4.2f, which is D17-gated. They moved here so the directory has them whether or not telemetry is agreed; the theme toggle's inline script replaces "no `<script>`" on these pages.
- Reading every tag with `git archive` grows with the number of releases. At a release a week that is years before it matters; cache per tag in the build's temporary directory if it ever does.
