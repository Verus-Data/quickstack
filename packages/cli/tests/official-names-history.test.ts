import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { fixture, privateKey, proof, readBuild, serve } from "./fixtures/index/harness";
import { writeLedger } from "./helpers/ledger";
import { buildNames, readNames, renameStep, unordered } from "./helpers/official-names";
import { minimal, writeEntry } from "./helpers/registry";
import { workspace } from "./helpers/verify";

// Each case owns real builds and local HTTP servers; keep the budget per case at 30 seconds.
const space = workspace();
afterEach(() => space.release());

test("sandbox proofs publish pinned names without bundles for omitted default deploy fragments", async () => {
  const f = await fixture(space.dir());
  const file = join(f.registry, "stacks/sample/STACK.md");
  writeFileSync(
    file,
    readFileSync(file, "utf8").replace("default: [tools]", "default: [tools, deploy]"),
  );
  writeEntry({
    root: f.registry,
    kind: "fragment",
    dir: "deploy",
    frontmatter: minimal(
      "fragment",
      "deploy",
      'verify:\n  - { name: deploy-check, layer: check, run: "true" }',
    ).replace("category: tooling", "category: deploy"),
  });
  writeLedger(f.registry, [await proof(f.registry)]);
  await buildNames(f);
  expect(
    (await readBuild(f.out)).index.entries.map((entry) => `${entry.kind}/${entry.id}`),
  ).toEqual(["fragment/tools", "stack/sample"]);
  expect(readNames(f.out).names.sources).toEqual([
    {
      origin: "index",
      fragments: ["tools"],
      stacks: [
        {
          id: "sample",
          compositions: [{ fragments: ["tools"], steps: ["install", "lint", "typecheck", "test"] }],
        },
      ],
    },
  ]);
}, 30_000);

test("published names survive re-proven steps, withdrawal and later generations without release tags", async () => {
  const f = await fixture(space.dir());
  await buildNames(f);
  renameStep(f, "lint", "lint-new");
  writeLedger(f.registry, [await proof(f.registry)]);
  let previous = f.out;
  const updated = join(f.root, "updated");
  const host = await serve(previous);
  try {
    await buildNames(f, updated, `${host.url}/v1/index.json`);
  } finally {
    await host.close();
  }
  previous = updated;
  rmSync(join(f.registry, "stacks"), { recursive: true });
  rmSync(join(f.registry, "fragments/tools"), { recursive: true });
  writeLedger(f.registry, []);
  for (const name of ["withdrawn", "later"]) {
    const server = await serve(previous);
    const out = join(f.root, name);
    try {
      await buildNames(f, out, `${server.url}/v1/index.json`);
    } finally {
      await server.close();
    }
    expect((await readBuild(out)).index.entries).toEqual([]);
    expect(unordered(readNames(out).names.sources)).toEqual(
      unordered([
        {
          origin: "index",
          fragments: ["tools"],
          stacks: [
            {
              id: "sample",
              compositions: [
                { fragments: ["tools"], steps: ["install", "lint", "typecheck", "test"] },
                { fragments: ["tools"], steps: ["install", "lint-new", "typecheck", "test"] },
              ],
            },
          ],
        },
      ]),
    );
    previous = out;
  }
}, 30_000);

test("an index published before names existed bootstraps historical names from its pinned bundles", async () => {
  const f = await fixture(space.dir());
  await buildNames(f);
  rmSync(join(f.out, "v1/names.json"));
  renameStep(f, "lint", "lint-new");
  writeLedger(f.registry, [await proof(f.registry)]);
  const host = await serve(f.out);
  const out = join(f.root, "bootstrapped");
  try {
    await buildNames(f, out, `${host.url}/v1/index.json`);
    const source = readNames(out).names.sources.find((source) => source.origin === "index");
    expect(source?.stacks.find((stack) => stack.id === "sample")?.compositions).toHaveLength(2);
    expect(JSON.stringify(source)).toContain('"lint"');
    expect(JSON.stringify(source)).toContain('"lint-new"');
  } finally {
    await host.close();
  }
}, 30_000);

test("an unverified previous names file cannot silently erase historical names", async () => {
  const f = await fixture(space.dir());
  await buildNames(f);
  const file = join(f.out, "v1/names.json");
  const { envelope } = readNames(f.out);
  writeFileSync(file, JSON.stringify({ ...envelope, signature: "" }));
  const host = await serve(f.out);
  try {
    const result = await f.invoke([
      "--out",
      join(f.root, "refused"),
      "--previous",
      `${host.url}/v1/index.json`,
      "--key",
      privateKey,
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("v1/names.json");
  } finally {
    await host.close();
  }
}, 30_000);
