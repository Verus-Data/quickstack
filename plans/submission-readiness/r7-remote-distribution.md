# R7. Signed remote-only recipe discovery and installation

Priority P1, after submission and the R11 freeze. Depends on R6 and current proofs for
every stack that will be published. Evidence: `remote-index.md`.

## Outcome

A released CLI can find, show and scaffold a stack that isn't in its bundle, fetched from
the signed hosted index, and refuses anything unsigned, tampered or incompatible. The
catalog can then grow without a CLI release.

## Read first

- `plans/phases/phase-4.0c-registry-index.md` and `phase-4.0d-cli-remote-origin.md`,
  including acceptance details and dated lines.
- `stacks-api/docs/operations.md` "Interim choices" and "Publishing a new index".
- Code: `packages/cli/src/bin.ts` (`officialUrl: undefined`, `INDEX_PUBLIC_KEYS`),
  `packages/format/src/index-keys.ts`, `packages/cli/scripts/index/proof.ts`,
  `stacks-api/scripts/production.ts::buildIndex`.

## Decision to make first

Production currently builds an unsigned, include-unproven index and re-signs it with
`~/.config/stacks/index-signing.pem` (key id `stacks-production-local`, created by
`production.ts:94-104`). Ask the user whether that key becomes the official key in
`INDEX_PUBLIC_KEYS` or is replaced by a newly generated key kept outside any repository.
Agents never generate, read or copy private key material; the user does, and gives the
agent only the public key.

## Steps

1. With the user's public key, add it to `packages/format/src/index-keys.ts` (format release,
   user publishes) and to `stacks-api`'s production settings (`INDEX_PUBLIC_KEYS`).
2. Refresh proofs (R3's procedure) for every stack intended for the index. The release index
   (`build:index --key ...`, no `--include-unproven`) publishes only proven stacks; R3 step 9 is
   the check.
3. Switch `prod:deploy` to the release-signed index per operations.md "Publishing a new index"
   and set `STACKS_PRODUCTION=true` only when R8 has replaced seeded data. Until then keep
   the seeded-data configuration.
4. Set `officialUrl` in `bin.ts` to the hosted index URL. Search and recipe resolution must use
   the same signed publication.
5. Tests, against a controlled local server, never the public catalog: a signed fixture entry
   absent from the bundle is found by `search`, shown by `show` and scaffolded by `new`; a local
   entry with the same id shadows it; bad signatures, unknown keys, an incompatible format
   version, a missing bundle and a digest mismatch are all refused with actionable errors;
   offline mode uses the cache and says so.
6. Publisher-attested proof in search. If API search starts reporting `sameContent: true`, it
   rests on the signed index binding the ledger record to the stack digest and fragment digest
   pins, which `proveRecord` checked at build time. Verify those pins before exposing it, label
   it as publisher-attested (not a local recomposition), and leave `sameContent` absent when
   that can't be established.
7. Release a CLI version with `officialUrl` set (R5's procedure, outside a freeze window).

## Done when

- [ ] A released CLI discovers and fetches a newer eligible recipe with no environment
      overrides, and refuses untrusted or tampered ones (tests and one live check).
- [ ] The bundled catalog still works offline and independently.
