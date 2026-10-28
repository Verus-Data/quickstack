# R10. Source access and judge-facing docs

Priority P0. Depends on R0 (organizer rules) and D6. Evidence: `judge-access.md`. Can run
alongside R1 to R4; must finish before R5 so the release carries the doc fixes.

## Outcome

A judge who lands on any repository, the npm page or the site can tell what stacks is,
install the released version, and reach the source they're allowed to see, without
stale instructions or private details.

## Read first

- `submission.md` (organizer repository-access rules).
- `quickstack/README.md`, `packages/cli/README.md`, `packages/cli/docs/quickstart.md`,
  `packages/cli/docs/README.md`.
- `stacks-api/README.md`, `stacks-api/docs/product/README.md`.

## Current state (2026-10-28)

`github.com/steamfield/stacks` (quickstack) is public with a LICENSE.
`github.com/steamfield/stacks-app` (stacks-api) is private with no LICENSE. The site has no
source link (HANDOFF: "no source link until the repository has a public URL"), though the CLI
repository now has one.

## Steps

1. Access decision (D6). From the organizer rules, write what judges need: public source,
   access for named reviewers, or the CLI repository only. Ask the user to decide D6 if it's
   still open.

2. If stacks-api will become public (the user flips visibility; agents don't):
   - Add a LICENSE matching quickstack's (copy the file; confirm the holder line with the
     user).
   - Audit history for secrets before the flip. Run a secret scanner over full history if one
     is installed (`gitleaks detect --source . --log-opts="--all"`); if none is, ask the user to
     approve installing one. Also grep the current tree for host names, SSH aliases, home
     paths and IPs (`git grep -nE "/Users/|\.local|ssh://|[0-9]{1,3}(\.[0-9]{1,3}){3}"`) and
     list anything that shouldn't be public. Don't rewrite history; report findings to the user.
   - Confirm `.env.example` holds placeholders only.

3. If access is by invitation, write in `submission.md` exactly who needs access and the
   `gh api` command the user will run; agents don't send invitations.

4. Docs a judge reads first. For each of `quickstack/README.md`, `packages/cli/README.md`
   (this becomes the npm page), `packages/cli/docs/quickstart.md` and `stacks-api/README.md`,
   check and fix:
   - the first paragraph says what stacks is in plain words and links the live site;
   - install uses `npx @steamfield/stacks@latest` or the pinned release, and states the
     minimum Node version from `packages/cli/package.json` `engines`;
   - the commands shown exist in the release (`search`, `show`, `new`, `verify --all`) and
     their output matches the released behavior (run each once with the source build);
   - no instruction depends on a source checkout, private host, or env var the release ignores;
   - links resolve (`lychee` if installed, otherwise check each by hand).

5. Site source link. If D6 makes at least one repository public, add a source link to the
   site footer in `stacks-api/apps/web/src/layouts/BaseLayout.astro` pointing at the public
   repository, with a browser test asserting it. Coordinate with the R4 owner (same files).

6. npm page metadata. In `packages/cli/package.json`, check `description`, `homepage`
   (`https://stacks.steamfield.io`), `repository` and `keywords` are set and correct; they show
   on npmjs.com after R5 publishes.

## Done when

- [ ] D6 decided and recorded with the organizer rule it satisfies.
- [ ] If public: LICENSE added, secret and private-detail audit recorded with findings
      resolved by the user.
- [ ] The four docs pass every check in step 4.
- [ ] Source link and npm metadata done where applicable.
