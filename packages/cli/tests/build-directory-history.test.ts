import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { fixture, preserve, privateKey, proof, serve, snapshot } from "./fixtures/index/harness";
import {
  buildDirectory,
  commitAt,
  datedEntries,
  entryRefs,
  failedDirectory,
  readDirectory,
  removal,
  removedFixture,
  removedRows,
  writeRemoved,
} from "./helpers/directory";
import { gitEnv } from "./helpers/git";
import { writeLedger } from "./helpers/ledger";
import { git, succeeded } from "./helpers/official-names";
import { reviewSearchFixture } from "./helpers/search-fixture";
import { workspace } from "./helpers/verify";

// Each case runs real builds and git history reads; carry-forward also owns an HTTP server.
const space = workspace();
afterEach(() => space.release());

test.each(["old-stack", "aaa-old-tool"])(
  "released entry %s cannot disappear without a removal record [4.2c#2]",
  async (missing) => {
    const f = await removedFixture(space.dir());
    writeRemoved(
      f,
      Object.fromEntries(Object.entries(removedRows()).filter(([id]) => id !== missing)),
    );
    const result = await f.invoke(["--out", f.out, "--previous", "none", "--key", privateKey]);
    failedDirectory(result);
    expect(result.stderr).toContain(missing);
    expect(existsSync(f.out)).toBe(false);
  },
  30_000,
);

test("an id from a previous index needs a removal record even without release tags [4.2c#2]", async () => {
  const f = await fixture(space.dir());
  writeRemoved(f, {});
  const previous = join(f.root, "previous");
  await buildDirectory(f, previous);
  rmSync(join(f.registry, "stacks/sample"), { recursive: true });
  rmSync(join(f.registry, "search/stacks/sample.json"));
  writeLedger(f.registry, []);
  commitAt(f, "2026-11-01T09:00:00Z", "fixture: remove index-only stack");
  const host = await serve(previous);
  try {
    const result = await f.invoke([
      "--out",
      f.out,
      "--previous",
      `${host.url}/v1/index.json`,
      "--key",
      privateKey,
    ]);
    failedDirectory(result);
    expect(result.stderr).toContain("sample");
    expect(existsSync(f.out)).toBe(false);
  } finally {
    await host.close();
  }
}, 30_000);

test.each([true, false])(
  "removed content comes from its last shipping tag, replacement=%s [4.2c#2] [4.2c#3]",
  async (replacement) => {
    const f = await removedFixture(space.dir());
    writeRemoved(f, removedRows(replacement));
    await buildDirectory(f);
    const directory = await readDirectory(f.out);
    const { replacedBy, ...withoutReplacement } = removal;
    expect(directory.removed).toEqual([
      {
        id: "aaa-old-tool",
        kind: "fragment",
        removedAt: "2026-11-04",
        reason: "Retired tool",
        last: {
          version: "v0.10.0",
          name: "aaa-old-tool name",
          description: "aaa-old-tool description.",
          tags: [],
          steps: [],
        },
      },
      {
        id: "old-stack",
        ...(replacement ? removal : withoutReplacement),
        last: {
          version: "v0.10.0",
          name: "Last shipped name",
          description: "old-stack description.",
          tags: ["api"],
          steps: [
            { name: "test", phase: "check", layer: "test", run: "bun run test" },
            { name: "inspect", phase: "check", run: "bun run inspect" },
          ],
          lastRun: f.historicalProof,
        },
      },
    ]);
    expect(entryRefs(directory.entries)).toEqual([
      { id: "tools", kind: "fragment" },
      { id: "sample", kind: "stack" },
    ]);
  },
  30_000,
);

test("a replacement must name a current entry [4.2c#2] [4.2c#8]", async () => {
  const f = await removedFixture(space.dir());
  writeRemoved(f, { ...removedRows(), "old-stack": { ...removal, replacedBy: "missing-stack" } });
  const before = preserve(f.out);
  const result = await f.invoke(["--out", f.out, "--previous", "none", "--key", privateKey]);
  failedDirectory(result);
  expect(result.stderr).toContain("missing-stack");
  expect(snapshot(f.out)).toEqual(before);
  expect(readFileSync(join(f.root, "unrelated"), "utf8")).toBe("keep sibling\n");
}, 30_000);

test.each([
  { entry: "stacks/sample/STACK.md", id: "sample", tag: "<api>" },
  { entry: "stacks/sample/STACK.md", id: "sample", tag: "API" },
  { entry: "fragments/tools/FRAGMENT.md", id: "tools", tag: "<api>" },
  { entry: "fragments/tools/FRAGMENT.md", id: "tools", tag: "API" },
])(
  "unsafe tag $tag on $id names its entry and refuses publication [4.2c#3]",
  async ({ entry, id, tag }) => {
    const f = await fixture(space.dir());
    const file = join(f.registry, entry);
    const text = readFileSync(file, "utf8");
    writeFileSync(
      file,
      id === "sample"
        ? text.replace("tags: [scripts]", `tags: [scripts, '${tag}']`)
        : text.replace("category: tooling", `category: tooling\ntags: ['${tag}']`),
    );
    writeLedger(f.registry, [await proof(f.registry)]);
    reviewSearchFixture(f.registry);
    const result = await f.invoke(["--out", f.out, "--previous", "none", "--key", privateKey]);
    failedDirectory(result);
    expect(result.stderr).toContain(id);
    expect(result.stderr).toContain(tag);
    expect(existsSync(f.out)).toBe(false);
  },
  30_000,
);

test.each(["invalid JSON", "newer schema", "missing reason"])(
  "%s removal manifest preserves the previous publication [4.2c#8]",
  async (kind) => {
    const f = await removedFixture(space.dir());
    if (kind === "invalid JSON") writeFileSync(join(f.registry, "removed.json"), "{unfinished");
    else if (kind === "newer schema")
      writeFileSync(
        join(f.registry, "removed.json"),
        JSON.stringify({ schemaVersion: 2, entries: removedRows() }),
      );
    else {
      const { reason: _reason, ...incomplete } = removal;
      writeRemoved(f, { ...removedRows(), "old-stack": incomplete });
    }
    const before = preserve(f.out);
    const result = await f.invoke(["--out", f.out, "--previous", "none", "--key", privateKey]);
    failedDirectory(result);
    expect(result.stderr).toContain("removed.json");
    expect(snapshot(f.out)).toEqual(before);
    expect(readFileSync(join(f.root, "unrelated"), "utf8")).toBe("keep sibling\n");
  },
  30_000,
);

test("shallow history is refused before new output and preserves an existing publication [4.2c#4] [4.2c#8]", async () => {
  const f = await fixture(space.dir());
  writeRemoved(f, {});
  commitAt(f, "2026-11-01T09:00:00Z", "fixture: removal manifest");
  const clone = join(space.dir(), "shallow checkout");
  execFileSync(
    "git",
    ["clone", "--quiet", "--no-checkout", "--depth=1", `file://${f.root}`, clone],
    { env: gitEnv() },
  );
  // Replace only fixture git metadata; fixture modules remain linked to this checkout.
  rmSync(join(f.root, ".git"), { recursive: true });
  renameSync(join(clone, ".git"), join(f.root, ".git"));
  expect(git(f, "rev-parse", "--is-shallow-repository")).toBe("true");
  for (const existing of [false, true]) {
    const before = existing ? preserve(f.out) : {};
    const result = await f.invoke(["--out", f.out, "--previous", "none", "--key", privateKey]);
    failedDirectory(result);
    expect(result.stderr).toMatch(/added dates/i);
    expect(result.stderr).toMatch(/full history/i);
    expect(snapshot(f.out)).toEqual(before);
    if (!existing) expect(existsSync(f.out)).toBe(false);
    else expect(readFileSync(join(f.root, "unrelated"), "utf8")).toBe("keep sibling\n");
  }
}, 30_000);

test("index-only carried fragment gets its added date from historical source [4.2c#10]", async () => {
  const f = await fixture(space.dir());
  writeRemoved(f, {});
  const previous = join(f.root, "previous");
  await buildDirectory(f, previous);
  // The working stack drops tools, but the carried-forward proven stack still pins it.
  for (const id of ["sample", "never-proven"]) {
    const file = join(f.registry, "stacks", id, "STACK.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("default: [tools]", "default: []"));
  }
  rmSync(join(f.registry, "fragments/tools"), { recursive: true });
  rmSync(join(f.registry, "search/fragments/tools.json"));
  writeLedger(f.registry, []);
  commitAt(f, "2026-11-01T09:00:00Z", "fixture: change unproven source and remove fragment");
  const host = await serve(previous);
  try {
    succeeded(
      await f.invoke([
        "--out",
        f.out,
        "--previous",
        `${host.url}/v1/index.json`,
        "--key",
        privateKey,
      ]),
    );
    const old = await readDirectory(previous);
    const directory = await readDirectory(f.out);
    expect(directory.entries).toEqual(old.entries);
    expect(datedEntries(directory.entries)).toEqual([
      { id: "tools", kind: "fragment", addedAt: "2026-10-27T09:00:00.000Z" },
      { id: "sample", kind: "stack", addedAt: "2026-10-27T09:00:00.000Z" },
    ]);
    expect(directory.removed).toEqual([]);
  } finally {
    await host.close();
  }
}, 30_000);
