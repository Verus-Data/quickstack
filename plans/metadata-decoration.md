# Metadata decoration

Status: IN PROGRESS 2026-10-28 (implementation prepared; human card review blocks publication)

The existing search sidecar now carries directory copy and practical project
ideas alongside its bounded discovery fields. The editorial choices are an
amendment to D37's proposal, prepared for maintainer review. They are not entries
in the settled decisions log.

| Field or source | Purpose | Consumer and boundary |
|---|---|---|
| Entry frontmatter `description` | Technical synopsis of the recipe | Existing CLI display and search/embedding input; remains authoritative about recipe content |
| `summary` | Short search-hit sentence, at most 25 words | Search results and existing ranking/embedding inputs |
| `description` | Fuller explanation of the recipe, first working slice and remaining product work; at most 120 words | Directory details and agent comparison, unscored and unembedded |
| `seoDescription` | Unique, useful page-meta prose; at most 160 Unicode code points | Directory page metadata, unscored and unembedded; the cap is editorial, not a Google snippet guarantee |
| `projectExamples` | 1 to 3 illustrative product ideas; titles at most 8 words, descriptions at most 35 | Directory and agent comparisons, unscored and unembedded; fragment examples name a host `stack`, and `withFragments` names extra selections |
| `requests`, `useCases`, `synonyms`, `goodFor`, `notFor` | User phrasing, fit and explicit non-fit | Existing discovery inputs; no redundant feature or persona catalog |
| Controlled facets | Stacks: platforms, product kinds and languages; fragments: capabilities | Existing vocabulary and discovery rules; apps remain fragments with `category: app` |
| `caveats` | Material platform or operating limits, at most 3 sentences of 25 words each | Shown unscored, including signing requirements, memory history and access limits |
| `source` and existing recipe/index data | Authorship, review, staleness, compatibility, tools and proof | No guessed readiness, difficulty, price, compliance or support claims |

Directory details prefer reviewed sidecar `description` and fall back to entry
description. Page metadata prefers reviewed `seoDescription`, then reviewed
`summary`, then entry description. Drafts must not silently replace reviewed
public copy, and stale sidecars retain their stale label. This change prepares
the contract; it does not implement a directory, ranking or embeddings.

## Compatibility and budgets

All three new fields are optional in schema version 1. Existing author cards,
fixtures and carried-forward index records need no migration. New drafts use
prompt version 2 and request complete editorial fields. `create --from` keeps
copying bytes and provenance; signed index assembly retains enriched fields and
its existing stale annotation behavior.

The drafting client enforces complete new responses before writing: description
and SEO text must be present and nonblank, and project examples must be present,
nonempty and valid. Failure enters the existing single correction retry. Two
invalid replies write nothing and preserve an existing card, while both reported
costs count toward the cap. This stricter new-response boundary leaves legacy
stored/copied/index cards valid. Draft-only response fixtures migrate to that
contract without changing the shared legacy fixture defaults or behavioral
assertions.

The original 150-word budget still covers summary, requests, use cases, synonyms,
fit/non-fit and caveats together. Rich description, SEO and examples have separate
caps. Structural errors are `search-invalid`; oversized text remains a
`search-size` warning. Named examples reuse existing fragment selection rules
for host compatibility, requirements, conflicts and the one-app limit. Selection
does not render or traverse source files for each example.

Metadata stays outside recipe frontmatter, files and adapters, so editorial edits
do not change composition fingerprints, bundle digests or run evidence. Existing
trust and staleness semantics apply to the whole sidecar.

## Coverage and authoring

All 30 bundled entries have distinct rich descriptions, SEO descriptions and two
project examples each: 10 stacks, 18 non-app fragments and 2 app fragments. The
60 examples include 40 named fragment hosts and 7 explicit extra-fragment
selections. Descriptions are 52 to 65 words; SEO prose is 112 to 144 Unicode
characters; existing search text is 71 to 105 words per card.

The author used `ce:writer` with its Engineer, Architect and UX Writer guidance
and forbidden-patterns reference, following the repository's plain style. Copy
was grounded in recipes, decoded metadata, the bundled vocabulary and existing
teaching cards. The architecture skill's structure, coupling and boundary
references informed keeping one sidecar and separate field consumers.

Examples distinguish the recipe from custom product work. Persistence, sign-in,
provider use and deployment are either established by the named recipe/defaults,
explicit additions, or described as work to implement. Browser chat defaults to
memory history and URL-based access; terminal chat uses local files without
concurrent-write locking. No transient QA timings or implementation omissions
became evergreen capability claims.

Every card retains `by: "drafted"`, `model: "codex/gpt-6.1-sol"`,
`promptVersion: 2` and `reviewedAt: null`. Editorial copy was frozen before
independent query checks. The authoring checkout omits the golden query set;
neither the author nor coding delegate read it, holdout queries or coverage query
fixtures. Query evaluation and the full gate belong to an independent checkout
after that freeze.

## Checks and review gate

| Check | Actual result |
|---|---|
| Seven scoped metadata test files | 107 tests: 104 passed, 3 failed on existing human-review requirements |
| New editorial regression file | 56 passed, including old-card compatibility, separate caps, selector validity, copy/index preservation, prompt provenance and new-response completeness |
| Plan trace and status checks | 139 passed across 2 files |
| Root lint | Passed; 973 files checked, no fixes needed |
| Root and package typecheck | Passed |
| CLI build | Passed |
| Built CLI `validate --json` and human validation | Exit 0; 10 stacks, 20 fragments, 0 errors, 30 warnings and 11 existing notes |
| Key-free `decorate --dry-run mobile-expo` | Exit 0, prompt estimate printed, actual total $0; no provider request |
| `git diff --check` | Passed |

All 30 validation warnings are `search-unreviewed`. There are no search-invalid,
search-size or search-stale findings. The 11 notes are 6 unproven ledger entries,
4 changed ledger entries and 1 existing dead conditional branch; they are not
metadata regressions. The three locked test failures require reviewed bundled
cards, a reviewed copied mobile card and two reviewed registry prompt examples.
Those assertions were left intact.

The final parallel integration run also passed 104 of 107 tests, but the bundled
review and copy cases reached their 5-second watchdog under machine load. A
serial rerun of only those two cases, with a 30-second command-level watchdog,
completed without timeouts and reached the expected `search-unreviewed`
assertions (2 failed, 26 skipped). No test timeout or assertion was edited.

The coding delegate revert-verified the new behavior: removing the editorial
schema produced 39 failures; removing caps/selectors/prompt v2 produced 21 failures
and 18 passes; removing recipe-reference context produced the expected single
failure. After the metadata-only selection refactor, restoring full composition
produced the expected collision-related `search-invalid` failure; the final code
passes that regression while ordinary composition still reports its file clash.
One independent code review found no actionable findings. The final selection
refactor received its targeted regression and normal checks without a second
review of the same deliverable.

Parent diff review found that optional storage fields also allowed incomplete new
model responses to be stamped as prompt version 2. The new stub-backed regression
reproduced that boundary gap. Reverting the client fix produces 8 failures,
6 passes and 42 skipped tests, including incomplete replies written without a
correction. The fixed client requires all editorial fields and sanitizes
correction diagnostics to trusted field names. The authorized fixture migration
adds editorial fields only to mocked new responses and their expected output;
legacy storage fixtures and shared fixture defaults remain unchanged. Editorial
plus original decoration tests now have 67 passes and the one existing
reviewed-example failure (68 total).

Synthetic invalid selectors were also checked through agent, human and JSON
output: exit 2, with example position and the missing reference. Copy/index tests
exercise real filesystem and bundle paths. The full gate and query evaluation
were deliberately not run in this sparse authoring checkout; an independent
full checkout performs those after the editorial freeze.

Human review remains required for every card. Read descriptions and examples
against the recipe, inspect named additions, then run the guarded `decorate
--approve <id>` operation as a person at a terminal. Agents cannot approve these
drafts, and `--restamp` cannot turn an unread draft into a reviewed one. The
bundled zero-warning gate remains blocked until that review is complete.

## Independent integration checks (2026-10-28)

The parent checked the frozen implementation in a separate full checkout. The
partitioned `rr check` passed 5 of 6 partitions: static checks, hooks, format,
bench and all 35 installed-package end-to-end tests. CLI tests reported 2,275
passed, 11 failed and 1 skipped. Five failures require reviewed cards; six were
5-second timeouts. A serial rerun of editorial, validation and holdout files
completed with 82 passes and only the two review prerequisites failing. All 56
editorial tests passed without changing their watchdogs or assertions.

The bundled request anti-copy check passed. A separate program compared the
actual fallback drafting prompts against all 47 golden query strings without
showing queries to the copy author. Both the original implementation and this
candidate had 60 substring matches across 30 prompts; all were already present
in the shared controlled vocabulary. There were zero additional matches from
the new copy, teaching examples or recipe-reference catalog. Thus the existing
whole-prompt exclusion assertion will still need reconciliation with its
vocabulary input once its reviewed-card prerequisite is satisfied. Neither
query fixtures nor copy were changed in response to this check.

These checks establish compatibility with the existing review-blocked baseline;
they do not establish a green publication gate. Keep this branch separate from
recipe fixes until integration, then refresh unreviewed source digests against
the final recipes before human review.
