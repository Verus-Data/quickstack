import { verify } from "node:crypto";
import { readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  SearchIndex,
  SearchMetadata,
  SearchVocabulary,
  SignedIndex,
} from "@steamfield/stacks-format";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import {
  entryPath,
  fixture,
  keyId,
  privateKey,
  publicKey,
  readBuild,
  serve,
  snapshot,
} from "./fixtures/index/harness";
import { minimal, writeEntry } from "./helpers/registry";
import { cardPath, copyVocabulary, put, readJson, stamp } from "./helpers/search-metadata";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());

async function setup() {
  const temporary = space.dir();
  // Preseed cards before the locked harness's zero-warning validation. Its entry writes are
  // identical; unproven entries also need cards even though they will not be published.
  const registry = join(realpathSync(temporary), "index workspace café/packages/cli/registry");
  const extra = `tags: [scripts]
fragments:
  default: [tools]
  optional: [extra, unproven]
verify:
  - { name: install, phase: setup, layer: install, run: "true" }
  - { name: lint, layer: lint, run: "true" }
  - { name: typecheck, layer: typecheck, run: "true" }
  - { name: test, layer: test, run: "true" }`;
  for (const id of ["sample", "never-proven"]) {
    writeEntry({
      root: registry,
      kind: "stack",
      dir: id,
      frontmatter: minimal("stack", id, extra),
      body: "# Fixture\n\n## Setup\n\nBuild a small command.\n",
    });
    await stamp(registry, { kind: "stack", id });
  }
  for (const id of ["tools", "extra", "unproven"]) {
    writeEntry({ root: registry, kind: "fragment", dir: id, frontmatter: minimal("fragment", id) });
    await stamp(registry, { kind: "fragment", id });
  }
  copyVocabulary(registry);
  return fixture(temporary);
}
type Fixture = Awaited<ReturnType<typeof setup>>;
async function build(f: Fixture, options: { out?: string; previous?: string } = {}) {
  const out = options.out ?? f.out;
  const result = await f.invoke([
    "--out",
    out,
    "--previous",
    options.previous ?? "none",
    "--key",
    privateKey,
  ]);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.trim()).not.toBe("");
  return readBuild(out);
}
async function searchFile(out: string) {
  const envelope = Schema.decodeUnknownSync(SignedIndex)(readJson(join(out, "v1/search.json")));
  expect(envelope.keyId).toBe(keyId);
  expect(
    verify(
      null,
      Buffer.from(envelope.payload),
      publicKey,
      Buffer.from(envelope.signature, "base64"),
    ),
  ).toBe(true);
  const payload = Schema.decodeUnknownSync(SearchIndex)(JSON.parse(envelope.payload));
  return { envelope, payload };
}

test("signed search metadata matches indexed entries and check detects a changed byte [4.5b#14]", async () => {
  const f = await setup();
  const { index } = await build(f);
  const { envelope, payload } = await searchFile(f.out);
  expect(payload.vocabulary).toEqual(
    Schema.decodeUnknownSync(SearchVocabulary)(
      readJson(join(f.registry, "search/vocabulary.json")),
    ),
  );
  expect(payload.entries.map(({ kind, id }) => `${kind}/${id}`).sort()).toEqual(
    index.entries.map(({ kind, id }) => `${kind}/${id}`).sort(),
  );
  for (const value of payload.entries) {
    expect(value).toEqual(
      Schema.decodeUnknownSync(SearchMetadata)(readJson(cardPath(f.registry, value))),
    );
  }
  const host = await serve(f.out);
  try {
    const good = await f.invoke(["--check", host.url]);
    expect(good.status, good.stderr).toBe(0);
    expect(good.stderr).toBe("");
    expect(good.stdout.trim()).not.toBe("");
    put(
      join(f.out, "v1/search.json"),
      JSON.stringify({
        ...envelope,
        payload: envelope.payload.replace("Small commands", "small commands"),
      }),
    );
    expect(
      Schema.decodeUnknownSync(SignedIndex)(readJson(join(f.out, "v1/search.json"))).payload,
    ).not.toBe(envelope.payload);
    const bad = await f.invoke(["--check", host.url]);
    expect(bad.status).toBeGreaterThan(0);
    expect(bad.stdout).toBe("");
    expect(bad.stderr).toContain("v1/search.json");
  } finally {
    await host.close();
  }
}, 30_000);

test.each([
  ["missing", null],
  ["invalid", '{"schemaVersion":1}'],
])(
  "build:index rejects a %s bundled search vocabulary and names its file [4.5e#13]",
  async (_state, contents) => {
    const f = await setup();
    const file = join(f.registry, "search/vocabulary.json");
    if (contents === null) rmSync(file);
    else put(file, contents);
    const result = await f.invoke(["--out", f.out, "--previous", "none", "--key", privateKey]);
    expect(result.status).toBeGreaterThan(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("search/vocabulary.json");
  },
  30_000,
);

test("a carried-forward bundle keeps the current card marked stale against its old entry [4.5b#14]", async () => {
  const f = await setup();
  const previous = join(f.root, "previous");
  const old = await build(f, { out: previous });
  const file = join(entryPath(f.registry, "stack", "sample"), "STACK.md");
  put(file, `${readFileSync(file, "utf8")}\nChanged guidance.\n`);
  const card = await stamp(f.registry, { kind: "stack", id: "sample" });
  const host = await serve(previous);
  try {
    const { index } = await build(f, { previous: `${host.url}/v1/index.json` });
    expect(index.entries.find(({ kind, id }) => kind === "stack" && id === "sample")?.digest).toBe(
      old.index.entries.find(({ kind, id }) => kind === "stack" && id === "sample")?.digest,
    );
    const { envelope } = await searchFile(f.out);
    const payload = Schema.decodeUnknownSync(
      Schema.Struct({
        entries: Schema.Array(
          Schema.Struct({
            kind: Schema.String,
            id: Schema.String,
            stale: Schema.optionalKey(Schema.Boolean),
            source: Schema.Struct({ digest: Schema.String }),
          }),
        ),
      }),
    )(JSON.parse(envelope.payload));
    expect(
      payload.entries.find(({ kind, id }) => kind === "stack" && id === "sample"),
    ).toMatchObject({ stale: true, source: { digest: card.source.digest } });
    expect(payload.entries.find(({ kind }) => kind === "fragment")?.stale).not.toBe(true);
  } finally {
    await host.close();
  }
}, 30_000);

test("editing a card preserves the bundles and digests actually published by build:index [4.5b#3]", async () => {
  const f = await setup();
  const before = await build(f);
  const bundles = snapshot(join(f.out, "v1/entries"));
  const { SearchMetadata } = await import("@steamfield/stacks-format");
  const path = cardPath(f.registry, { kind: "stack", id: "sample" });
  const card = Schema.decodeUnknownSync(SearchMetadata)(readJson(path));
  put(path, JSON.stringify({ ...card, synonyms: ["batch chores", "automation"] }));
  const out = join(f.root, "second publication");
  const after = await build(f, { out });
  expect(after.index.entries).toEqual(before.index.entries);
  expect(snapshot(join(out, "v1/entries"))).toEqual(bundles);
}, 30_000);
