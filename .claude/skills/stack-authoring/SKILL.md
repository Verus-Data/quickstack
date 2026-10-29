---
name: stack-authoring
description: How to create or revise a stack (a STACK.md recipe under packages/cli/registry/stacks) and its search card in packages/cli/registry/search/stacks so it is well named, plainly described, accurate and found by the right searches. Use it whenever someone asks for a new stack, recipe or project template, wants to edit a stack's id, name, description, frontmatter or search card, asks why a stack ranks badly in stacks search, or is distilling a working project into the registry, even if they don't say "stack". For fragments and apps, use fragment-authoring.
---

# Authoring a stack

A stack is the base recipe for a new project: its structure, its tools and its definition of done. Agents pick a stack from `stacks list`, `stacks search` and the hosted directory, mostly by reading the id, the name and one sentence of description. If those don't say what the stack is, nobody chooses it, however good the body is.

Before writing anything, load the `ce:writer` skill (the Engineer persona) and use it for the frontmatter `description`, the body and every search card field. Read `packages/cli/docs/authoring.md` for the entry format, budgets and commands; this skill doesn't repeat them. Read `search-card.md` beside this file before writing the card. If the stack needs a capability no fragment provides yet, load `fragment-authoring` too.

## Before you start

Check the stack doesn't already exist under another name. Run a few requests through `bun run dev search --local --kind stack --json "<request>"` from the repo root and read the closest two stacks in full. A stack that differs from an existing one only in CI, deployment or one tool is a fragment on that stack.

Use the bundled stack nearest in shape (same task runner, same kind of product) as the model for body sections, verify steps and adapters, then distill from a project you can build from an empty directory. Bundled entries predate this skill: copy their structure, not their search cards.

## Settle the goal with the person asking

Help the person get the best stack for their goal, not a transcription of their first list. A narrow revision ("fix this description") goes straight to work. For a new stack or a broad change, ask what you can't settle from the brief and the registry, at most five questions, most consequential first, each with your recommended answer so "yes" settles it:

- what people will build from it, and what proves it's done (a served page, a smoke command, a build)
- pieces you'd expect that the brief left out (tests, lint, typecheck, a dev server, a database, CI, a release path), with the concrete default you'd use and which existing stack uses it
- which parts belong in default or optional fragments rather than the base
- the id, with two or three candidates

A subagent returns the questions to its caller and waits for the answers.

## Choose the id once

An id is permanent once a release ships it. Renaming one later needs a `removed.json` row with `replacedBy`, restarts its published stats, stales `runs.json` proofs and golden judgments, and leaves older projects whose manifest names the old id unable to `add` its fragments cleanly. When revising a stack, keep its id; if you think it's wrong, say so with these costs.

Name what a developer would type: the main technology plus either the kind of product (`go-cli`, `typescript-api`) or the defining second technology (`tauri-react`). Test the candidate:

- The second word must not suggest a product the stack doesn't build. `astro-api` is a static Astro site plus a separate Node API, but "api" reads as an API built with Astro; naming both halves would read better.
- When a sibling shares the framework, the name and description say what separates them. `react-router` and `cloudflare-react-router` collide on search and on the npm package name, so the Node-served one has to say "served by Node".
- Use the public name a developer would type, never an internal abbreviation or a major version (`tauri-react`, not `tauri2-react`).
- Say it in a search box (`go cli`, `tauri app`) and run it through the ranker. "full stack" doesn't match a `fullstack` id unless the vocabulary has that alias.

The frontmatter `name` is the human title shown in lists ("Go CLI", "Expo app + Hono API"). It can name both halves when the id can't.

## Write the description in plain English

The frontmatter `description` is the first thing a person or agent reads about the stack, and the ranker weights it 1.5. Write it so someone skimming a list understands in one read what the stack builds and where it runs:

- Open with plain words for the kind of project and its runtime: "A Go command-line tool with...", "A full-stack React Router app on Cloudflare Workers with...".
- Then name the two or three packages people search for by name ("cobra", "FastAPI", "Hono") and the pieces that matter. Leave out the long tail; it belongs in `deps` and the body.
- Keep it to one or two sentences, about 40 words. A 55-word sentence crammed with every package reads as a list.
- No major versions ("Tauri 2") and no internal jargon ("crate-edge policy check"; say "a check on crate dependency direction"). Every unusual word can match an unrelated search: "crate-edge" made tauri-react a strong hit for "edge app".
- Describe what actually ships. "Cross-platform" when Windows is deferred, or "on the local Workers runtime" when it deploys to Workers, misleads the reader.

## What a complete stack has

Validation checks format and references, not substance, so these are on you:

- A body with the sections the bundled stacks use: Layout, numbered Setup, Conventions, Tool configuration, Testing, Commands and Gotchas (combine or add sections where the product needs it). Spend words on what an agent would get wrong, not on what it does anyway.
- Verify steps that prove the deliverable, beyond install, lint, typecheck and test: a serve probe for anything that serves, a smoke command for a CLI, a build for anything that ships an artifact.
- Every decision with `(default: ...)` and what to do when the default can't apply.
- Every claim in `description`, `deps`, decisions, the body and the card checked against `files/`, `adapters/` and `verify`. Common drifts: the description names a capability only an optional fragment adds; `deps` list packages for a branch nothing reaches; a decision's default contradicts the shipped config.

## Tags are a compatibility contract

Fragments pick stacks by tag (`api`, `web`, `typescript`, `node`, `bun`, `go`, `static` and others), and default fragments often need stack-specific guidance through `<!-- stacks:when stack=<id> -->` in the fragment or `<!-- stacks:when with=<fragment> -->` in the stack. For each tag, list the fragments it admits (`grep -rn applies_to packages/cli/registry/fragments`). Compose the brief with each default and optional fragment (`bun run dev validate --brief <id> --with <fragment> --sandbox` from `packages/cli`) and read the result. Add the `with=` guidance the stack needs, and report any fragment whose `stack=` branches should cover the new stack.

## Fill the search card

Write `packages/cli/registry/search/stacks/<id>.json` following `search-card.md`. Stack-specific points:

- `platforms` lists everywhere the stack runs code. Shipping an API means `server`; leaving it out penalizes the stack on every "api" or "backend" request (an audit found an Expo stack with a Hono API ranked fourth for "hono api" for that reason).
- `productKinds` lists what a user would call the product. Add `api` if the stack serves JSON routes. Don't add a kind that is a sibling's main job.
- Add `notFor` phrases only for misses you see in testing ("server-side rendering" on a static stack that wins SSR requests), each checked against a request it should still win.
- Add the predecessor or rival names people search with as `synonyms`.

## Check and hand back

From `packages/cli`: `bun run dev validate`, `bun run dev show <id> --kind stack`, `bun run dev validate --brief <id> --sandbox`, then `bun run test:unit tests/bundled-registry.test.ts tests/registry.test.ts` and the search tests in `search-card.md`. Fix every failure except the ones `search-card.md` lists as staying red on a new draft.

The hand-back lists the files changed, the validate and test results with counts, the search request table, the proposed golden judgments, and the pending user actions:

- card approval and restamp
- a bench run, `bun run bench <id> --agent claude` from `packages/cli` (`docs/maintaining.md`, "The bench"), before the stack counts as proven
- if you edited a stack with `runs.json` records or a fragment in its default composition, that its ledger proof is now stale

## Anti-patterns

| Don't | Do |
| --- | --- |
| A second id word that suggests the wrong product (`astro-api`) | Main technology plus product kind or defining second technology (`go-cli`, `tauri-react`) |
| An id or name that hides what separates it from a sibling | Say the runtime or host in the name and description |
| A description that lists every package | Plain words for what you build and where it runs, then the few packages people search for |
| Major versions or internal jargon in the description | Version-neutral, plain words |
| Claims that only hold with an optional fragment | Describe the stack alone; name optional fragments in project examples |
| A thin body and verify steps that stop at test | Model sections, and a verify step that proves the deliverable |
| Tags chosen without checking which fragments they admit | Compose the brief with each admitted fragment |
| Missing `server` platform on a stack that ships an API | List every platform that runs code |
| Blanket `notFor` phrases on every card | Only misses seen in testing, each checked against a request it should win |
| Setting `reviewedAt` or running restamp yourself | Leave the card a draft for a person |
| Renaming an id to fix search | Fix the card and description; a rename is a release decision |
