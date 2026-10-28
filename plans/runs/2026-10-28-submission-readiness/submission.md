# Submission (draft, R0)

## Demo scope

- Composition: `python-react --sandbox`, the site's example and `product/DEMO_OUTLINE.md`'s.
- App: a React view that makes a typed request to the Python API and renders the response, with
  one test that exercises that path end to end. No persistence, no auth, no expense tracker, no
  transaction review.
- Final acceptance: `stacks verify --all`. The sandbox manifest otherwise skips the production
  build; `--all` runs every step in the manifest and adds no fragments.
- Tools: `uv`, `bun`, `make`, `git`, `jq`, each checked with `--version` (`baseline.md`).
- Agent and model: Codex with Terra 6.1 (`gpt-6.1-terra`) for the proof run and rehearsal.
- Rho: excluded (S5, decided by the user 2026-10-28).

## Decisions recorded 2026-10-28

The user runs `npm publish`; agents run `prod:seed`, `prod:deploy` and push the release tag. CLI
version 0.4.0. `STACKS_DEMO` stays unset in production.

## Organizer requirements

The user owns these. Nothing before R6's recording waits on them.

| Item | State |
| --- | --- |
| Deadline and timezone | the user's |
| Video length, format, editing | the user's |
| Required links | the user's |
| Repository access (S6: the private `stacks-app`) | the user's |
| Sponsor eligibility | the user's |
| Live judging table | the user's |
