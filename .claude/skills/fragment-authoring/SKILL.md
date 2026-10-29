---
name: fragment-authoring
description: How to create or revise a fragment (a FRAGMENT.md under packages/cli/registry/fragments, including category app) and its search card in packages/cli/registry/search/fragments so it is well named, plainly described, scoped to the stacks it fits and found by the right searches. Use it whenever someone wants to add a capability to stacks (CI, auth, a database, analytics, release tooling, agent guardrails, an app), edit a fragment's id, name, description, applies_to, requires or search card, or asks why a fragment ranks badly in stacks search, even if they don't say "fragment". For base project recipes, use stack-authoring.
---

# Authoring a fragment

A fragment adds one capability to a stack: CI, a database, auth, release tooling, agent guardrails, or a whole app (`category: app`). People find fragments by asking for the capability ("add auth", "github actions ci") and choose them from the id, the name and one sentence of description. Those have to say what the fragment adds and which stacks it fits.

Before writing anything, load the `ce:writer` skill (the Engineer persona) and use it for the frontmatter `description`, the body and every search card field. Read `packages/cli/docs/authoring.md` for the entry format, budgets and commands; this skill doesn't repeat them. Read `.claude/skills/stack-authoring/search-card.md` before writing the card.

## Before you start

Search for overlap first: `bun run dev search --local --kind fragment --json "<capability>"` from the repo root, and read the closest two fragments in full. Extend an existing fragment when the new one would share most of its files; write a new one when it's a separate capability someone would add on its own. Bundled entries predate this skill: copy their structure, not their search cards.

## Settle the goal with the person asking

Help the person get the best fragment for their goal, not a transcription of their first list. A narrow revision goes straight to work. For a new fragment or a broad change, ask what you can't settle from the brief and the registry, at most five questions, most consequential first, each with your recommended answer so "yes" settles it:

- which stacks it should fit, and whether that's by stack id or by tag
- what proves it works (its verify step)
- pieces the capability usually needs that the brief left out (a test stub, migrations, env config, a CI step, adapters for other agents), with the default you'd use
- whether part of it is a separate fragment
- the id, with two or three candidates

A subagent returns the questions to its caller and waits for the answers.

## Decide scope before files

`applies_to` (stack ids or tags), `requires` (other fragments) and `requires_tools` determine where `add` accepts the fragment. Write the body, `deps` and card for exactly that scope. A body with Go and TypeScript branches while `applies_to` names one Python stack is prose nobody can reach, and its card sends users to a fragment `add` then refuses.

A narrow, accurate `applies_to` also helps search: a fragment inherits its host stacks' languages and platforms, so a Bun-only release fragment scoped to TypeScript stacks is penalized on a Go request that names a Go alias. `applies_to: []` opts out of those penalties, and the fragment then needs `notFor` to stay out of other languages' queries.

When you target stacks by tag, check each stack the tag admits: compose its brief with the fragment (`bun run dev validate --brief <stack> --with <id> --sandbox` from `packages/cli`), read the result, and add a `<!-- stacks:when stack=<stack> -->` branch where one stack needs different instructions.

## Choose the id once

An id is permanent once a release ships it. A rename needs a `removed.json` row with `replacedBy`, restarts the fragment's published stats, updates every stack `fragments` list and fragment `requires` that names it, and stales golden judgments. Fragments that something requires are the worst case: older projects keep the old id in their manifest, so `add` asks for the new id again and parks duplicate files under `.stacks/incoming/`. When revising a fragment, keep its id; if you think it's wrong, say so with these costs.

The id names the capability or the tool's own public name:

- A tool's own name works when people search for it: `goreleaser`, `posthog`, `clerk`, `rr`, `cloudflare-d1`. Give the `name` field the plain description beside it ("rr remote test runner").
- A generic word must not promise something that doesn't ship. `rest-api` ships agent rules about REST design, not an API, and ranked first for "call an llm api"; a name about conventions would read right.
- No internal abbreviations. `ce-plugin` means nothing in `stacks list`; the plugin's own public name would.
- Siblings read as a family: a base id plus a suffix for each surface (web, terminal). `openrouter-ai`, `openrouter-chat` and `openrouter-chat-cli` show the cost of skipping this: `-ai` adds nothing to an AI provider, and `-chat` doesn't say which surface. If a family is ever renamed, rename it together.
- When `applies_to` is narrow, the `name` says so ("Clerk auth for Expo and Hono"), because lists show the name without the description.
- Read the name as a newcomer would. "Claude development harness" reads as tooling for developing Claude; "Claude Code TypeScript hooks" doesn't.

## Write the description in plain English

The frontmatter `description` is the technical synopsis and the ranker weights it 1.5. Write it so a person skimming understands in one read what the fragment adds and where:

- Open with what it is and what it plugs into: "A browser chat app for react-router on OpenRouter: ...", "PostgreSQL for python-react: ...". Then name the main pieces and the packages people search for by name.
- One or two sentences, about 40 words. A comma list of features ("Effect AI commands, OpenTUI chat, ... evals") never says what the thing is.
- Say the surface when there's more than one: browser or terminal, Node or Workers.
- Cover everything that ships. An audit found agent-ops shipping Codex, Cursor and OpenCode adapters while its description named only Claude Code, so "cursor rules" went to an unrelated fragment.
- Don't overclaim ("SHA-pinned actions" when pinning is in one preset only) and avoid words that match unrelated searches ("OpenRouter integration" matched "continuous integration").
- Proofread names and terms; a typo ("models discovery") reads as careless and doesn't match the real phrase.

## What a complete fragment has

Validation checks format and references, not substance, so these are on you: a body that says what to add, then the `AGENTS.md` section the project gets, as the bundled fragments do; a verify step that checks the fragment's own deliverable (its config is valid, its command runs, its artifact exists); every decision with `(default: ...)` and a fallback; and every claim checked against `files/`, `adapters/` and `verify`.

## Fill the search card

Write `packages/cli/registry/search/fragments/<id>.json` following `search-card.md`. Fragment-specific points:

- `capabilities` come from the closed vocabulary (0 to 3). Fragments carry no platforms, product kinds or languages of their own; those come from `applies_to`.
- `notFor` fixes most fragment misses seen in testing: the other host ("GitLab CI"), the vendor's products it doesn't touch ("error tracking", "feature flags"), the capability it lacks ("auth" on a chat app), and the sibling's job ("Cursor hooks" on a Claude-only hooks fragment).
- `synonyms` add the plain words people use for the capability ("Docker image", "containerize", "offload tests") and agent-specific terms for each adapter shipped ("Cursor rules", "Codex hooks").
- For an app, `requests` describe the app the user gets, and project examples name their host `stack`.

## Check and hand back

From `packages/cli`: `bun run dev validate`, `bun run dev show <id> --kind fragment`, the brief composition above for each stack it fits (or a representative stack when `applies_to` is empty), then `bun run test:unit tests/bundled-registry.test.ts tests/registry.test.ts` and the search tests in `search-card.md`. Fix every failure except the ones `search-card.md` lists as staying red on a new draft.

The hand-back lists the files changed, the validate and test results with counts, the search request table, the proposed golden judgment, and the pending user actions:

- card approval and restamp
- any stack whose `fragments` lists should offer it
- a bench run with the fragment, `bun run bench <stack> --with <id> --agent claude` from `packages/cli`, for an app or any fragment that changes what verify runs
- if the fragment is in a stack's default composition, that the stack's `runs.json` proof is now stale

## Anti-patterns

| Don't | Do |
| --- | --- |
| A generic id that promises something else ships (`rest-api`) | Name what it adds, or the tool's public name |
| Internal abbreviations (`ce-plugin`) | The tool's public name or the capability |
| Sibling ids whose difference isn't legible | Base id plus a surface suffix |
| A name that hides a narrow `applies_to` | Put the host stack in the name |
| A description that's a feature list | What it is and what it plugs into, then the key pieces |
| A description that omits shipped adapters or surfaces | Name every agent adapter and surface |
| Prose, `deps` or card wider than `applies_to` | Write for the scope `add` accepts |
| Targeting a tag without composing each admitted stack | Compose each brief; add `stacks:when stack=` branches |
| `notFor` that contradicts shipped files | Only exclude what the files really don't do |
| Misspellings on one card | Aliases in `vocabulary.json` |
| Setting `reviewedAt` or running restamp yourself | Leave the card a draft for a person |
| Renaming a required fragment to fix search | Fix the name field, description and card |
