import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { fixture, proof, readBuild, serve } from "./fixtures/index/harness";
import { buildDirectory, commitAt, readDirectory, writeRemoved } from "./helpers/directory";
import { writeLedger } from "./helpers/ledger";
import { minimal, writeEntry } from "./helpers/registry";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());

const setDefaults = (root: string, from: string, to: string) => {
  for (const id of ["sample", "never-proven"]) {
    const file = join(root, "stacks", id, "STACK.md");
    writeFileSync(file, readFileSync(file, "utf8").replace(from, to));
  }
};

test("a carried fragment keeps its first add date after an undecodable first commit [4.2c#1]", async () => {
  const dir = "draft-tool";
  const f = await fixture(space.dir());
  writeRemoved(f, {});
  writeEntry({
    root: f.registry,
    kind: "fragment",
    dir,
    frontmatter: "schema_version: 999\nid: draft-tool",
  });
  commitAt(f, "2026-10-29T09:00:00Z", "fixture: incomplete draft");
  writeEntry({ root: f.registry, kind: "fragment", dir, frontmatter: minimal("fragment", dir) });
  setDefaults(f.registry, "default: [tools]", "default: [draft-tool]");
  writeLedger(f.registry, [await proof(f.registry)]);
  commitAt(f, "2026-10-30T09:00:00Z", "fixture: publish fixed draft");
  const previous = join(f.root, "previous");
  await buildDirectory(f, previous);
  setDefaults(f.registry, "default: [draft-tool]", "default: []");
  rmSync(join(f.registry, "fragments", dir), { recursive: true });
  rmSync(join(f.registry, "search/fragments", `${dir}.json`));
  writeLedger(f.registry, []);
  commitAt(f, "2026-11-01T09:00:00Z", "fixture: remove draft source");
  const host = await serve(previous);
  try {
    await buildDirectory(f, f.out, `${host.url}/v1/index.json`);
  } finally {
    await host.close();
  }
  const row = (await readDirectory(f.out)).entries.find((entry) => entry.id === dir);
  expect(row?.kind).toBe("fragment");
  expect(new Date(row?.addedAt ?? "").toISOString()).toBe("2026-10-29T09:00:00.000Z");
}, 30_000);

test("an index-only removal keeps its exact last content, without a version, across two generations [4.2c#2]", async () => {
  const f = await fixture(space.dir());
  writeRemoved(f, {});
  await buildDirectory(f);
  const { index } = await readBuild(f.out);
  const lastRun = index.entries.find((entry) => entry.id === "sample")?.lastRun;
  expect(lastRun).toBeDefined();
  rmSync(join(f.registry, "stacks"), { recursive: true });
  rmSync(join(f.registry, "fragments/tools"), { recursive: true });
  rmSync(join(f.registry, "search/stacks"), { recursive: true });
  rmSync(join(f.registry, "search/fragments/tools.json"));
  writeLedger(f.registry, []);
  writeRemoved(f, {
    sample: { kind: "stack", removedAt: "2026-11-01", reason: "Retired sample" },
    tools: { kind: "fragment", removedAt: "2026-11-01", reason: "Retired tools" },
  });
  commitAt(f, "2026-11-01T09:00:00Z", "fixture: withdraw index-only entries");
  let previous = f.out;
  for (const name of ["withdrawn", "later"]) {
    const host = await serve(previous);
    const out = join(f.root, name);
    try {
      await buildDirectory(f, out, `${host.url}/v1/index.json`);
    } finally {
      await host.close();
    }
    const directory = await readDirectory(out);
    expect(directory.entries).toEqual([]);
    expect(directory.removed).toEqual([
      {
        id: "sample",
        kind: "stack",
        removedAt: "2026-11-01",
        reason: "Retired sample",
        last: {
          name: "sample name",
          description: "sample description.",
          tags: ["scripts"],
          steps: [
            { name: "install", phase: "setup", layer: "install", run: "true" },
            { name: "lint", phase: "check", layer: "lint", run: "true" },
            { name: "typecheck", phase: "check", layer: "typecheck", run: "true" },
            { name: "test", phase: "check", layer: "test", run: "true" },
          ],
          lastRun,
        },
      },
      {
        id: "tools",
        kind: "fragment",
        removedAt: "2026-11-01",
        reason: "Retired tools",
        last: { name: "tools name", description: "tools description.", tags: [], steps: [] },
      },
    ]);
    previous = out;
  }
}, 30_000);
