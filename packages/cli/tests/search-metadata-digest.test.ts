import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { compositionFingerprint, digestOf, proof, rawBundle } from "./fixtures/index/harness";
import { writeLedger } from "./helpers/ledger";
import {
  cardPath,
  copyVocabulary,
  entryAt,
  put,
  searchFindings,
  seed,
  sourceDigest,
  stamp,
  validateSearch,
} from "./helpers/search-metadata";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());
const ref = { kind: "stack", id: "sample" } as const;

test("sidecar edits leave fingerprints, bundle digests and last-green proof unchanged [4.5b#3]", async () => {
  const home = space.dir();
  const registry = join(home, "registry");
  seed(registry, ref);
  const value = await stamp(registry, ref);
  copyVocabulary(registry);
  const fingerprint = await compositionFingerprint(registry);
  const bundle = await digestOf(rawBundle(registry, ref.kind, ref.id));
  writeLedger(registry, [await proof(registry)]);
  const before = await validateSearch(registry, { home, bundled: true });
  expect(before.findings.filter(({ check }) => check.startsWith("ledger-"))).toEqual([]);
  put(
    cardPath(registry, ref),
    JSON.stringify({ ...value, synonyms: ["automation", "batch jobs"] }),
  );
  expect(await compositionFingerprint(registry)).toBe(fingerprint);
  expect(await digestOf(rawBundle(registry, ref.kind, ref.id))).toBe(bundle);
  const after = await validateSearch(registry, { home, bundled: true });
  expect(after.findings.filter(({ check }) => check.startsWith("ledger-"))).toEqual([]);
  expect(searchFindings(after)).toEqual([]);
});

test("the content digest tracks decoded frontmatter and raw body, excluding shipped files [4.5b#2] [4.5b#3]", async () => {
  const root = space.dir();
  seed(root, ref);
  const initial = await sourceDigest(root, ref);
  expect(initial).toMatch(/^sha256:[a-f0-9]{64}$/);
  put(join(root, "stacks/sample/files/new.txt"), "new shipped file");
  expect(await sourceDigest(root, ref)).toBe(initial);
  const file = join(root, "stacks/sample/STACK.md");
  const text = readFileSync(file, "utf8");
  put(file, text.replace("name: sample name", 'name: "sample name"'));
  expect(await sourceDigest(root, ref)).toBe(initial);
  put(file, text.replace("description: sample description.", "description: different purpose."));
  expect(await sourceDigest(root, ref)).not.toBe(initial);
  put(file, `${text}\nClarification.\n`);
  expect(await sourceDigest(root, ref)).not.toBe(initial);
  const { searchSourceDigest } = await import("../src/core/search/digest");
  const entry = await entryAt(root, ref);
  expect(searchSourceDigest({ ...entry, id: "other" })).not.toBe(searchSourceDigest(entry));
});
