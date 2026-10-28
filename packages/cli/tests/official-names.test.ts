import { sign, verify } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import {
  fixture,
  keyId,
  privateKey,
  proof,
  publicKey,
  readBuild,
  serve,
} from "./fixtures/index/harness";
import { writeLedger } from "./helpers/ledger";
import {
  buildNames,
  defaultOnly,
  git,
  type NamesFixture,
  type NamesSource,
  readNames,
  rejectedNames,
  release,
  releaseSource,
  renameStep,
  succeeded,
  taggedFixture,
  unordered,
} from "./helpers/official-names";
import { minimal, writeEntry } from "./helpers/registry";
import { workspace } from "./helpers/verify";

const shared = workspace();
const space = workspace();
let released: NamesFixture;
// Copy/validate the workspace, create real release tags and sign once for the read/check cases.
beforeAll(async () => {
  released = await taggedFixture(shared.dir());
  await buildNames(released);
}, 60_000);
afterEach(() => space.release());
afterAll(() => shared.release());

test("signed names retain both releases, unproven entries and each optional composition [4.0e#1]", async () => {
  const { envelope, names } = readNames(released.out);
  const { envelope: indexEnvelope, index } = await readBuild(released.out);
  expect(envelope.keyId).toBe(keyId);
  expect(envelope.keyId).toBe(indexEnvelope.keyId);
  expect(
    verify(
      null,
      Buffer.from(envelope.payload),
      publicKey,
      Buffer.from(envelope.signature, "base64"),
    ),
  ).toBe(true);
  expect(names).toMatchObject({
    formatVersion: 1,
    commit: released.commit,
    generatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
  });
  expect(Number.isNaN(Date.parse(index.generatedAt))).toBe(false);
  expect(names).toHaveProperty("sources.length", 3);
  expect(unordered(names)).toEqual(
    expect.objectContaining({
      sources: expect.arrayContaining([
        unordered(releaseSource("0.1.0")),
        unordered(releaseSource("0.2.0")),
        unordered({
          origin: "index",
          fragments: ["tools"],
          stacks: [
            {
              id: "sample",
              compositions: [
                {
                  fragments: ["tools"],
                  steps: ["install", "lint-index", "typecheck", "test", "tools-check"],
                },
              ],
            },
          ],
        }),
      ]),
    }),
  );
  expect(index.entries.map((entry) => `${entry.kind}/${entry.id}`).sort()).toEqual([
    "fragment/tools",
    "stack/sample",
  ]);
});

// Separate repositories are needed for malformed history and carry-forward mutations.
test("an undecodable release retains frontmatter ids and warns with its tag [4.0e#2]", async () => {
  const f = await fixture(space.dir());
  for (const kind of ["stack", "fragment"] as const) {
    writeEntry({
      root: f.registry,
      kind,
      dir: `old-${kind}-directory`,
      frontmatter: minimal(kind, `legacy-${kind}`).replace(
        "schema_version: 1",
        "schema_version: 999",
      ),
    });
  }
  release(f, "v0.0.1");
  rmSync(join(f.registry, "stacks/old-stack-directory"), { recursive: true });
  rmSync(join(f.registry, "fragments/old-fragment-directory"), { recursive: true });
  git(f, "add", "packages/cli/registry");
  git(f, "commit", "--quiet", "-m", "fixture: remove legacy entries");
  const result = await f.invoke(["--out", f.out, "--previous", "none", "--key", privateKey]);
  succeeded(result, true);
  const diagnostics = `${result.stdout}\n${result.stderr}`;
  expect(diagnostics).toMatch(/warn/i);
  expect(diagnostics).toContain("v0.0.1");
  const { names } = readNames(f.out);
  const legacy = names.sources.find(
    (source: NamesSource) => source.origin === "release" && source.version === "0.0.1",
  );
  if (legacy === undefined) throw new Error("Missing legacy release source");
  expect(legacy.stacks.map((stack: NamesSource["stacks"][number]) => stack.id).sort()).toEqual([
    "legacy-stack",
    "never-proven",
    "sample",
  ]);
  expect([...legacy.fragments].sort()).toEqual(["extra", "legacy-fragment", "tools", "unproven"]);
}, 30_000);

test("check accepts signed names and rejects a one-byte payload change by filename [4.0e#3]", async () => {
  const file = join(released.out, "v1/names.json");
  const original = readFileSync(file, "utf8");
  const { envelope } = readNames(released.out);
  const changed = envelope.payload.replace("lint-v1", "lint-x1");
  expect(changed).not.toBe(envelope.payload);
  expect(Buffer.byteLength(changed)).toBe(Buffer.byteLength(envelope.payload));
  const host = await serve(released.out);
  try {
    succeeded(await released.invoke(["--check", host.url]));
    expect(host.requests).toContain("/v1/names.json");
    writeFileSync(file, JSON.stringify({ ...envelope, payload: changed }));
    rejectedNames(await released.invoke(["--check", host.url]));
  } finally {
    writeFileSync(file, original);
    await host.close();
  }
}, 30_000);

test("unsigned builds still write decodable names with an empty signature [4.0e#4]", async () => {
  const out = join(released.root, "unsigned names");
  succeeded(await released.invoke(["--out", out, "--previous", "none", "--unsigned"]));
  const { envelope, names } = readNames(out);
  expect(envelope.signature).toBe("");
  expect(unordered(names)).toEqual(
    expect.objectContaining({
      sources: expect.arrayContaining([
        unordered(releaseSource("0.1.0")),
        unordered(releaseSource("0.2.0")),
      ]),
    }),
  );
}, 30_000);

test("release discovery survives an unrelated cwd and inherited git selectors [4.0e#11]", async () => {
  const out = join(released.root, "names from elsewhere");
  succeeded(
    await released.invoke(["--out", out, "--previous", "none", "--key", privateKey], {
      cwd: space.dir(),
      env: { GIT_DIR: join(released.root, "absent.git"), GIT_WORK_TREE: "/missing", AI_AGENT: "1" },
    }),
  );
  expect(unordered(readNames(out).names)).toEqual(
    expect.objectContaining({
      commit: released.commit,
      sources: expect.arrayContaining([
        unordered(releaseSource("0.1.0")),
        unordered(releaseSource("0.2.0")),
      ]),
    }),
  );
}, 30_000);

test("index names come from carried bundles rather than changed working files without release tags [4.0e#12]", async () => {
  const f = await fixture(space.dir());
  defaultOnly(f);
  const fragment = join(f.registry, "fragments/tools/FRAGMENT.md");
  writeEntry({
    root: f.registry,
    kind: "fragment",
    dir: "tools",
    frontmatter: minimal(
      "fragment",
      "tools",
      'verify:\n  - { name: tools-old-check, layer: check, run: "true" }',
    ),
  });
  writeLedger(f.registry, [await proof(f.registry)]);
  const previous = join(f.root, "previous names");
  await buildNames(f, previous);
  const old = await readBuild(previous);
  renameStep(f, "lint", "unproven-lint");
  writeFileSync(
    fragment,
    readFileSync(fragment, "utf8").replace("tools-old-check", "tools-new-check"),
  );
  const host = await serve(previous);
  try {
    await buildNames(f, f.out, `${host.url}/v1/index.json`);
    expect((await readBuild(f.out)).index.entries).toEqual(old.index.entries);
    const { names } = readNames(f.out);
    expect(unordered(names)).toEqual(
      expect.objectContaining({
        sources: [
          {
            origin: "index",
            fragments: ["tools"],
            stacks: [
              {
                id: "sample",
                compositions: [
                  {
                    fragments: ["tools"],
                    steps: ["install", "lint", "typecheck", "test", "tools-old-check"],
                  },
                ],
              },
            ],
          },
        ].map(unordered),
      }),
    );
    expect(JSON.stringify(names)).not.toContain("unproven-lint");
    expect(JSON.stringify(names)).not.toContain("tools-new-check");
  } finally {
    await host.close();
  }
}, 30_000);

test.each(["missing", "unsigned", "invalid payload"])(
  "check rejects %s names even when the index and bundles are valid [4.0e#13]",
  async (kind) => {
    const file = join(released.out, "v1/names.json");
    const original = readFileSync(file, "utf8");
    const { envelope } = readNames(released.out);
    const host = await serve(released.out);
    try {
      if (kind === "missing") rmSync(file);
      else if (kind === "unsigned")
        writeFileSync(file, JSON.stringify({ ...envelope, signature: "" }));
      else {
        const payload = JSON.stringify({ formatVersion: 999, sources: [] });
        const signature = sign(null, Buffer.from(payload), readFileSync(privateKey)).toString(
          "base64",
        );
        expect(
          verify(null, Buffer.from(payload), publicKey, Buffer.from(signature, "base64")),
        ).toBe(true);
        writeFileSync(file, JSON.stringify({ ...envelope, payload, signature }));
      }
      rejectedNames(await released.invoke(["--check", host.url]));
      expect(host.requests).toContain("/v1/names.json");
    } finally {
      writeFileSync(file, original);
      await host.close();
    }
  },
  30_000,
);
