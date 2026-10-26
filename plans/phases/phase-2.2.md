# Phase 2.2: Deterministic rot checks

Status: DRAFT 2026-10-26 (not agreed)

| Field | Value |
|---|---|
| Goal | `validate` catches, without an LLM, the kinds of defects that real runs keep finding in stack content: shipped files that reference commands, hooks or ports the composition doesn't have, shipped code that imports from an entry it doesn't require, prose tied to a moment in a tool's release history, and stacks that changed since their last green run |
| Traces to | Assumption "Version-less prose rots much more slowly than templates" (confidence medium); assumption "`verify` is enough of a definition of done to keep an agent honest ... Inspect projects from runs for no-op targets and weakened tests"; the stack author: "nothing tells them when their prose has gone stale" |
| Depends on | 2.0 (fingerprint and ledger), 1.5 (the `validate` pipeline and finding shape), 1.2 (in-memory composed file set) |
| Blocks | 3.1 (authoring tools surface these findings to authors) |
| Decisions needed | None new. D5 and D7 are already enforced by 1.5 |
| Decisions or questions this settles | Which shipped-file checks exist and their severity; the import contract between entries; the dated-phrase list and the rule for growing it; how ledger status is reported |

## Scope

In:

- A composed-files view: for each composition `validate` already builds, the full list
  of `{ path, owner, content }` the scaffold would write, in memory, per agent adapter.
  1.2's scaffold renders files before writing; this reuses that renderer without the
  write step.
- Shipped-reference checks over that view.
- The import closure check.
- The dated-phrase check.
- Ledger notes: unproven, changed since last green, last run failed.

Out:

- Any check that needs to run the project or a tool. That is the canary (2.1).
- Checking that shipped Markdown names only paths that will exist. Docs legitimately
  describe directories the agent creates; a path-token check gives false positives.
- Judging whether a test the agent wrote is real. That stays with run review (2.0).

## Design

### Composed files

```ts
// src/core/compose-files.ts
export type ComposedFile = { readonly path: string; readonly owner: string; readonly content: string };
export const composeFiles: (c: Composition, agent: AgentId, vars: TemplateVars) =>
  Effect.Effect<ReadonlyArray<ComposedFile>, ComposeError, FileSystem.FileSystem>;
```

`vars` are fixed neutral values (`project_name: "example"`), the same ones 2.0's
fingerprint uses. Results are cached by source file across compositions within one
`validate` run, so a registry of a few hundred shipped files is read once.

### Checks

| Check id | Severity | Rule |
|---|---|---|
| `ref-command` | error | In a composed `.claude/settings.json`, every `Bash(...)` allow or deny rule whose command is a project-command invocation (`make <t>`, `bun run <s>`, `npm run <s>`, `pnpm [run] <s>`) names a key of the merged `commands` map, or a word a composed body sets in inline code. The same for the first argument of `args` and `runtimeArgs` in `.vscode/launch.json` |
| `ref-hook` | error | Every hook `command` in a composed `.claude/settings.json` that references `${CLAUDE_PROJECT_DIR}/.claude/hooks/<file>` names a composed file |
| `ref-port` | warning | A literal `localhost:<port>` or `127.0.0.1:<port>` in a composed `.claude/settings.json` or `.vscode/*.json`, when the composition's `env` declares a variable with a `PORT` segment. Other files (`.env.example`, test fixtures) may carry ports |
| `ref-command-coverage` | warning | A `commands` key that the body describes as a deliverable (it appears in the brief's commands table) and that no verify step runs, for fragments only. Stacks declare commands like `dev` and `clean` that verify shouldn't run, so they are exempt |
| `import-closure` | error | A relative import in a shipped `.ts`, `.tsx`, `.js` or `.mjs` file (`import ... from "./x"`, `import "./x"`, `export ... from "./x"`, `require("./x")`), or a `source`/`.` line in a shipped `.sh` file, must resolve to a composed file owned by the same entry or by an entry in its allowed set |
| `dated-phrase` | warning | Phrases that tie prose to a moment in a tool's release history, in bodies, `decisions` and shipped Markdown, outside code fences |
| `ledger-unproven` | note | A stack in a registry with a ledger has no record for its default composition |
| `ledger-changed` | note | The current fingerprint differs from the latest `pass` record's: "changed since its last green run (<date>)" |
| `ledger-failed` | note | The latest record is `fail` or `partial` |

`note` is a third severity introduced here. Notes print in their own section, appear in
`--json` under `notes`, and never affect the exit code or the zero-warning gate.
"Changed since" is the normal state of a stack under active editing; it says when a
rerun is due and never blocks a commit.

### The import contract

An entry's shipped files may import only from:

- its own files;
- for a fragment, files owned by the transitive closure of its `requires`;
- for a stack, files owned by the transitive closure of its `fragments.required`.

Default and optional fragments are not in the allowed set, because `--without` can
remove them, and `applies_to` is not a dependency. Resolution maps `.js` to `.ts`, tries
`.ts`, `.tsx`, `.js`, `.mjs` for an extensionless path, and maps a directory to its
`index.ts`. In shell files, a leading `$CLAUDE_PROJECT_DIR` is the project root and any
other leading variable is the script's own directory. A finding names the importing
file, the target, and the entry that owns it, with the fix: add the owner to `requires`
(or `fragments.required`), or move the shared file.

This is the check that would otherwise only fail at runtime in the one composition where
the transitive dependency happened to be missing.

### Dated phrases

The list is short on purpose and there is no way to suppress a hit; a hit is rewritten.

- `rc` as a word, `dist-tag`, `while published`, `alpha`, `nightly`, `canary` as words
  (case-insensitive). `canary` is checked only in entry content, not in this repo's own
  docs.
- `as of` followed by a month name or a four-digit year; a capitalized month name
  followed by a four-digit year.
- 1.5's `pinned-version` semver rule stays as is.

Left off on purpose: `prerelease` (the version-less rewrite "if the latest release is
still a prerelease, pin every related package to the same one" needs it), `beta`,
and tool-major phrases like "Effect 4", which are true statements about what a stack
targets. A phrase joins the list only after a canary or bench run finds it stale in a
real entry. The list is a tripwire for known patterns, not a staleness detector; the
canary is.

### Output

Same report as 1.5 with a `notes` array and a notes section in human output. The
`ValidateReport` schema gains `notes: Finding[]` with `severity: "note"`.

### Failure modes

| Case | Handling |
|---|---|
| A shipped JSON file doesn't parse | `schema`-style error finding for that file; the reference checks skip it |
| A template variable the neutral set doesn't define | Already an error in 1.2's renderer; reported as `compose` |
| Ledger missing | Ledger checks skipped silently (a user registry without a ledger is normal) |
| Ledger invalid | Error finding `ledger-schema` |

### Decisions settled here

- Reference and import checks run on composed output, not on single entries. Reason:
  the defects only exist in a composition.
- Notes are their own severity. Reason: a "changed since" that counted as a warning would
  make the zero-warning gate fail on every edit, and people would stop reading warnings.
- No suppression syntax for dated phrases. Reason: suppressions become the default fix.

## Files and areas touched

| Path (under `packages/cli/`) | Change |
|---|---|
| `src/core/compose-files.ts` | in-memory composed files, extracted from the scaffold renderer |
| `src/core/scaffold.ts` | uses `composeFiles` before writing, so both paths share one renderer |
| `src/core/validate/shipped-refs.ts`, `imports.ts`, `dated.ts`, `ledger-notes.ts` | one module per check group |
| `src/schemas/validate.ts` | `note` severity, `notes` |
| `tests/validate-shipped.test.ts`, `tests/fixtures/registries/*` | one fixture per check |
| repo `AGENTS.md`, authoring notes in the package README | the checks and the import contract |

## Acceptance tests

- `ref-command`: `args: ["ask", "hello"]` in a shipped `launch.json` against a
  composition without `ask` fails; a `Bash(bun run stub)` rule passes when a body names
  `stub` in inline code.
- `ref-hook`: a hook command naming a file no entry ships fails.
- `ref-port`: `localhost:5173` in an allow rule with `PORT_WEB` declared warns; the same
  in `.env.example` doesn't.
- `import-closure`: a stack file importing a default fragment's `_lib.ts` fails; the
  same import with the fragment under `fragments.required` passes; a fragment importing
  from an entry two `requires` hops away passes.
- `dated-phrase`: "while published only under the rc dist-tag" warns on each phrase;
  "if the latest release is still a prerelease" doesn't; text in a code fence doesn't.
- Ledger notes: a fixture ledger with a pass record at the current fingerprint gives no
  note; editing one word of the body gives `ledger-changed` with the record's date; the
  exit code and warning count are unchanged.
- The bundled registry: zero errors, zero warnings under the new checks.
- `scaffold` and `composeFiles` produce byte-identical file sets for the same input
  (property test over fixture compositions).

## Exit criteria

- `bun run check` green from the repo root, with the bundled registry clean under every
  new check.
- `AGENTS.md` documents the import contract and the note severity.
- Any finding the new checks raise on the bundled registry is fixed in the entry, not
  by loosening the check.

## What this plan may get wrong

- The settings and launch file checks are specific to Claude Code and VS Code formats.
  When a second agent's adapter ships config (roadmap, Won't have), it needs its own
  reference check or these miss its defects.
- Regex-level import parsing misses dynamic imports and multi-line import statements.
  Shipped hook code is small and written to a house style, so this has been enough; if a
  miss appears, switch to the TypeScript scanner rather than growing the regexes.
- A short phrase list will miss most stale sentences. That is accepted; the canary is
  the real mechanism, and this check only stops known patterns from coming back.
