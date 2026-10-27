# Handoff for the next stacks session

Status: DRAFT 2026-10-27 (phases 0 and 1 merged; the doable plans of phases 2 and 3 executed
and production-reviewed, 3.2a/3.2b deferred; plan awaiting the maintainers' review)

Start here, then read repo `AGENTS.md`, the README's
[product summary](README.md#product-to-preserve), and
[PROBLEM_STATEMENT.md](../product/PROBLEM_STATEMENT.md). Keep this file short: current state,
next steps, who owns each. When it grows past a couple of screens, move the dated detail
to `archive/` and leave a link.

## Demo outline (2026-10-27)

[The revised outline](../product/DEMO_OUTLINE.md) leads with collaborative discovery:
describe a product, have the agent compare shared stacks using fit and usage evidence,
then scaffold and verify the selected starter. Rho stays a minimal example. The 4:45
Loom sequence includes narration, a short motion-graphics opener and shot transitions.
It retains the judge review's verification safeguard and measurable results.
Recording depends on the actual agent access to analytics and contribution route; the
official-only index and telemetry deferral below do not yet cover the full pitch.
Implementation status is unchanged. PITCH.md and PREP.md still use the old narrative;
align those and reconcile the wider positioning with the product and registry plans.

## `stacks update` (2026-10-27)

[4.4d](phases/phase-4.4d-self-update.md) landed (D31): `stacks update` reads the latest
version from the npm registry and upgrades a global npm install in place; npx and other
installs get the command to run; an agent gets `PermissionDenied` (exit 6) unless it passes
`--check`. Release 0.3.0 carries it. Not checked live: a real `npm install -g` replacing the
running package (tests use a fake npm).

## The API moved to a private repository (2026-10-27)

D35: the hosted API is `stacks-api`, a separate private repository, so its source isn't
public; `packages/api` is gone and phase 4's plans stay here, with API paths written
`stacks-api/apps/api/...`. It is a bun workspace: `apps/api` (the Effect `HttpApi`
server), `apps/web` (an Astro static site with React islands and Tailwind, which now holds
the directory, browse, stats and dependency pages) and `packages/contract` (the `HttpApi`
definition both apps import). It runs as a Node server on a maintainers' host first (4.0b,
"API skeleton on Node"), serving only `/healthz`, the signed index files and the built site;
the Workers spike and move are 4.0f, deferred until after the hackathon demo. Every storage-
or telemetry-backed sub-phase (4.1b onward) starts after 4.0f, on D1, so no data ever moves
between hosts. The index and `names.json` are still built and signed here. `@stacks/format`
(4.0a) is now published, with a `dist/` build, because the API consumes it across repositories.

The bundled `astro-api` stack is what `stacks-api` is scaffolded from; it builds on the
backend-only `typescript-api`. Until a CLI release includes it, scaffold from this checkout:
`bun run dev new astro-api <path>` (next session, for the new repository). Neither stack has
a bench run yet, so `list` shows them unproven; that first build is the bench. The backend
ships Claude rules for Effect HTTP APIs, REST resource naming, testing through HTTP with
real layers, verification and TypeScript, `/add-resource` and `/add-service` commands, and
boundary and command guards with tests.

## Agent picker (2026-10-27)

[4.4c](phases/phase-4.4c-agent-picker.md) landed: at a terminal with several harnesses and
none configured, `new` and `add` ask which one gets the project after the summary; `--launch`
also takes `copilot` and `codex-app` (macOS). Not checked live: whether the Codex app's
`codex://new?path=&prompt=` link fills the prompt, and which env marker Copilot CLI sets.

## 0.1.0 released (2026-10-27)

The CLI is on npm as `@steamfield/stacks` 0.1.0 and installs the `stacks` command (D34:
npm refused the unscoped `stacks`). It is a Node 22+ ESM bundle (`dist/cli.mjs` behind
the `dist/stacks` entry), packed reproducibly by `bun run pack`; tag `v0.1.0`. The product,
`.stacks/`, `STACKS_*` and the skill name keep stacks. A manual QA pass over the
installed package found one blocker (`validate` with no path checked nothing), fixed before
publishing. Open from that pass, next release:

- Under npx, `--help` USAGE and EXAMPLES still say `stacks` (static effect/cli names); the
  guide, brief and `Next:` lines use the npx form.
- `invocationFor` knows only `_npx`: a project-local install, `pnpm dlx` or `yarn dlx` prints
  bare `stacks`, which isn't on PATH there.
- Scaffolded `AGENTS.md` and `.claude/README.md` (agent-ops) hard-code `stacks verify`.
- An unknown flag (`list --bogus`) gets no `details` naming it.
- The packed `package.json` keeps dev `scripts` and `devDependencies`.
- `bun.lock` still lists the workspace bin as `dist/stacks.mjs`; bun won't rewrite it until a
  dependency changes.
- 1.6c's gate rerun from the packed tarball was not done; release automation and provenance
  stay with 5.0.

## User documentation (2026-10-27)

The CLI's user docs live in `packages/cli/docs/` (index: `docs/README.md`): quick start,
concepts, agents, architecture, the reference pages that used to be the CLI README, and
maintaining. `packages/cli/README.md` is now a short entry page. Every command's `--help`
states its exit codes and examples (`tests/help.test.ts`), and `tests/docs.test.ts` checks
the docs' links and command names. Not done: structured `--help --json` (still `{ help }`),
and `create --from` still lists `user` as a choice it refuses. The Mermaid diagrams weren't
rendered locally; check them on GitHub once pushed.

## 1.6b gate runs (2026-10-27)

[1.6b](phases/phase-1.6b-mvp-gate-runs.md) ran headless from the compiled binary for D13's
three stacks, six rounds with brief fixes between them (rerun log in the plan). Each stack
has a green counting run on `e6f5da2`: [astro-blog](runs/2026-10-27-astro-blog.md),
[go-cli](runs/2026-10-27-go-cli.md), [python-react](runs/2026-10-27-python-react.md).
A maintainer still has to confirm each run, and the other four bundled stacks have none.

- Assumption 1, first result: an agent followed composed briefs of 3,200 to 4,800 words to a green `verify` in 3 to 5 minutes with nothing asked, once the briefs' own contradictions were fixed.
- D5: the 6,000-word budget held with room to spare for these stacks; no run tested a brief near the limit.

## Phases 2 and 3 (2026-10-27, executed)

Phases 2 and 3 are being executed through Codex delegates (`/execute:codex`), one test-author
then one implementer per sub-phase, merged to `main` as each lands. Work runs off the dev build
and the compiled binary: there is no packed tarball until 0.2, so every tarball check is
reworded for `dist/stacks` or deferred in its plan.

- Executed: [2.0a](phases/phase-2.0a-composed-files-and-fingerprint.md) (composed files and
  the fingerprint), [3.5b](phases/phase-3.5b-two-phase-brief.md) (base then app stages in
  `verify`), [3.4c](phases/phase-3.4c-agent-skill.md) (the agent skill and `skill install`),
  [3.1c](phases/phase-3.1c-new-dry-run-and-naming.md) (`new --dry-run`),
  [2.0c](phases/phase-2.0c-run-ledger.md) (the run ledger, `runs`, seeded from the 1.6b notes),
  [3.0](phases/phase-3.0-add-fragments-to-repo.md) (`add`),
  [3.1a](phases/phase-3.1a-show-and-preview.md) (`show` and the brief preview),
  [2.2](phases/phase-2.2-deterministic-rot-checks.md) (rot checks; reread the condensed
  `effect` and `effect-schema` guidance it trimmed to fit `mobile-expo --with effect`),
  [2.0b](phases/phase-2.0b-bench.md) (`bun run bench`, fake-agent tested),
  [3.1b](phases/phase-3.1b-create-and-authoring-guide.md) (`create` and the authoring guide),
  [3.3a](phases/phase-3.3a-release-and-deploy-fragments.md),
  [3.3b](phases/phase-3.3b-bundled-stack-expansion.md) and
  [3.3c](phases/phase-3.3c-service-vendor-and-effect-fragments.md) (the composition and
  safety tests for every bundled entry; bench proofs are the maintainers'),
  [3.4a](phases/phase-3.4a-agent-harness-fragment.md) (the TypeScript destructive guard in
  `claude-harness`, sharing one shell lexer with the repo's own hooks),
  [3.4b](phases/phase-3.4b-native-agent-adapters.md) (Codex, OpenCode and Cursor adapters
  calling the same shell guards, a reference check per config format, and the skill's Claude
  Code plugin; publishing it is a manual step in `packages/cli/docs/maintaining.md`).
- Deferred to phase 4 or later: [3.2a](phases/phase-3.2a-git-sources-and-untrusted-origin.md) and
  [3.2b](phases/phase-3.2b-source-updates-and-trust-report.md), gated on outside demand and open
  question 18.
- Left to maintainers: the real bench runs beyond a few seed runs, and the proofs that need
  them (3.3a-c, parts of 3.4a, 3.4b, 3.5b and 2.0b).
- After the last unit: one codebase-quality refactor (one `fitsStack` rule, an `isStack` guard),
  then two production reviews (CLI; harness and shipped entries), whose fixes are merged: `create`
  refuses to silently shadow an existing id, `add` names what blocks a planned path, project
  names with `"` or `\` are refused, the shipped destructive guard keeps every shell pattern
  when the TypeScript guard runs and fails closed, the shared lexer decodes `$'...'`, and the
  Codex adapter's hooks refuse when their guard is missing. The repo's own Codex delegates now
  run the destructive guard too.
- Open from the reviews, for maintainers:
  - The agent skill (and its plugin copy) falls back to `npx -y stacks@latest`, and the
    npm name is unreserved, so anyone could publish under it. Reserve the name or drop the
    fallback before the plugin is published.
  - `.rr.yaml` names one maintainer's hosts (rr is opt-in per clone, `git config
    stacks.rr true`); another maintainer who opts in needs hosts with the same names.
  - Decided 2026-10-27: the repo's hooks stay separate from the shipped ones and its destructive
    guard stays looser (docs/harness.md, "Repo hooks and shipped hooks").
  - Cursor's `Write` payload for an edit to an existing file isn't recorded; the fixture
    follows the docs. Record a live payload to confirm the secrets guard sees edits.
  - `list` still shows the three 1.6b stacks as proven while `validate` notes their
    compositions changed since that run; rerun them with `bun run bench`.

## Phases 0 and 1 (2026-10-27)

Every phase 0 and phase 1 sub-phase an agent can do is executed and merged to `main`. Open by
design: [0.0](phases/phase-0.0-decisions-and-npm-name.md) (the maintainers' decisions),
[0.2](phases/phase-0.2-npm-distribution-artifact.md) and
[1.6c](phases/phase-1.6c-first-release.md) (packaging, the npm name and the first publish,
the final step before public release, after the roadmap's
[feature gaps](roadmap.md#feature-gaps-to-close-before-release)), and the maintainers'
confirmation of [1.6b](phases/phase-1.6b-mvp-gate-runs.md)'s runs. The CLI runs from the repo
(`bun run dev`) or the compiled binary. CI runs on Linux only; tests named `(macOS)` run in
lefthook's pre-commit on a Mac. The state as of 2026-10-26, including the D18 amendment and
D29 (agent-first output), is in [archive/handoff-2026-10-26.md](archive/handoff-2026-10-26.md).

The plan, in brief:

- [roadmap.md](roadmap.md) has six phases. Phases 0 and 1 are the MVP and the demo, run
  from the repo or the compiled binary. Publishing to npm by hand is the final step
  before public release. Phase 5 holds every CI change and everything that runs an agent
  on a schedule (D23, proposed).
- The roadmap's shared-contracts table is the single owner of every cross-phase type,
  symbol, error tag and schema version, and its [trust model](roadmap.md#trust-model)
  is the one place trust rules live. Phase files cite both.
- Each sub-phase is sized for one agent; large ones are split with letter suffixes
  (for example [1.2a](phases/phase-1.2a-new-scaffold-and-templates.md) and
  [1.2b](phases/phase-1.2b-manifest-state-and-detection.md)). The roadmap's phase tables
  and dependency graph list every file.
- Below the MVP cutline on purpose: `new --dry-run` and naming options
  ([3.1c](phases/phase-3.1c-new-dry-run-and-naming.md)), the agent skill
  ([3.4c](phases/phase-3.4c-agent-skill.md)), the rot checks that only matter once
  stacks age ([2.2](phases/phase-2.2-deterministic-rot-checks.md)), and everything in
  phases 2-5.

D0-D4, D10 and D11 are settled. D5-D9 and D12-D27 are proposals in
[requirements.md](requirements.md#proposed-decisions) (D26 and D28 are superseded by the
amended D18); the roadmap's decision table says which sub-phase each one blocks. D5 (the brief budget) is a hypothesis whose evidence is
[1.6b](phases/phase-1.6b-mvp-gate-runs.md)'s gate runs. A1-A4 are open.

## Next steps

| Step | Owner | Notes |
|---|---|---|
| Agree or change the amended D18 (entry format v1) | Maintainers | Phases 1-3 are built to it; see [requirements.md](requirements.md#proposed-decisions) and the dated entries in each phase file's "What this plan may get wrong" |
| Reserve `stacks` on npm | Maintainers | Part of the final step before public release, with 0.2 and 1.6c; sooner only if someone else takes the name. The name was free on 2026-10-26, see the name check in [0.0](phases/phase-0.0-decisions-and-npm-name.md) |
| Review requirements.md and roadmap.md; decide A1, D12, D22 and D23 first, then D5-D7, D9, D13, D14, D18-D20 | Maintainers | The gating table in [0.0](phases/phase-0.0-decisions-and-npm-name.md) says which can wait |
| Review A2-A4 as answered in 0.3a and 0.3b | Maintainers | Must be in the decisions log before [1.6c](phases/phase-1.6c-first-release.md) publishes |
| Answer the open questions in [risks-and-open-questions.md](risks-and-open-questions.md) | Maintainers | Question 1 (registry audience) decides which stacks ship bundled |
| ~~Apply the batch review's fixes to phase 1 round 1 (1.0, 1.1, 1.2a, 1.2b, 1.5)~~ | Agents | Done 2026-10-26, merged in PR #4; notes in [archive/handoff-2026-10-26.md](archive/handoff-2026-10-26.md) |
| Confirm 1.6b's three gate runs | Maintainers | One green counting run each for astro-blog, go-cli and python-react; the other four bundled stacks have none |
| ~~Choose how `validate` treats a verify step no layer describes (a file-existence or config check)~~ | Maintainers | Decided 2026-10-26: `check` layer added (roadmap, "Verify step `layer`"). `step-layer` stays a warning and `check` isn't a D7 layer; see [1.5](phases/phase-1.5-validate-and-brief-budget.md), "What this plan may get wrong" |
| Decide D19 (project-origin entries untrusted by default) | Maintainers | The only decision [1.0](phases/phase-1.0-entry-format-and-registry.md) blocks on besides D18; phases 1-3 are built to the proposal |
| Execute 0.2 (distribution) | Agent, after A1, D12 and D22 | Deferred 2026-10-26 to the final step before public release, with the npm reservation and 1.6c. Changes `bin.ts` |
| Decide open questions 24-28 (behavior kept on purpose in phases 0-1) | Maintainers | Before 1.0, 1.1, 1.3b and 1.6c, as each question says. Question 26 changed: 1.1 now proposes a warning, not an error, for a `--with` fragment that doesn't fit. The rest (D25, D27, questions 29-31) can wait for phases 3-4 |
