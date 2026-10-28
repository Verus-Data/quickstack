import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  bundleFile,
  digestOf,
  entryPath,
  fixture,
  preserve,
  privateKey,
  rawBundle,
  readBuild,
  snapshot,
} from "./fixtures/index/harness";
import { writeLedger } from "./helpers/ledger";
import { reviewSearchFixture } from "./helpers/search-fixture";
import { workspace } from "./helpers/verify";

// Each case copies a workspace and runs real Bun builds, validation and git.
const space = workspace();
afterEach(() => space.release());

test.each(["empty", "without tamper checks"])(
  "unsigned builds include unproven stacks and every fragment only on request: %s ledger",
  async (ledger) => {
    const f = await fixture(space.dir());
    const second = join(entryPath(f.registry, "stack", "never-proven"), "STACK.md");
    writeFileSync(
      second,
      readFileSync(second, "utf8").replace("default: [tools]", "default: [extra]"),
    );
    const tools = join(entryPath(f.registry, "fragment", "tools"), "FRAGMENT.md");
    writeFileSync(tools, readFileSync(tools, "utf8").replace("\n---", "\nrequires: [extra]\n---"));
    reviewSearchFixture(f.registry);
    writeLedger(f.registry, ledger === "empty" ? [] : [{ ...f.record, run: null }]);
    const args = ["--out", f.out, "--previous", "none", "--unsigned"];
    const omitted = await f.invoke(args);
    expect(omitted.status, omitted.stderr).toBe(0);
    expect(omitted.stderr).toBe("");
    expect(omitted.stdout).toContain("Omitted stack/sample");
    expect((await readBuild(f.out)).index.entries).toEqual([]);

    const included = await f.invoke([...args, "--include-unproven"]);
    expect(included.status, included.stderr).toBe(0);
    expect(included.stderr).toBe("");
    expect(included.stdout).toContain("Included stack/sample unproven:");
    const { envelope, index } = await readBuild(f.out);
    expect(envelope.keyId).toBe("unsigned");
    expect(envelope.signature).toBe("");
    expect(index.entries.map((entry) => `${entry.kind}/${entry.id}`)).toEqual([
      "fragment/extra",
      "fragment/tools",
      "fragment/unproven",
      "stack/never-proven",
      "stack/sample",
    ]);
    for (const entry of index.entries) {
      expect(entry).not.toHaveProperty("lastRun");
      expect(entry.digest).toBe(await digestOf(rawBundle(f.registry, entry.kind, entry.id)));
      expect(readFileSync(bundleFile(f.out, entry), "utf8")).not.toBe("");
    }
    expect(index.entries.find((entry) => entry.id === "sample")?.composition).toEqual({
      extra: await digestOf(rawBundle(f.registry, "fragment", "extra")),
      tools: await digestOf(rawBundle(f.registry, "fragment", "tools")),
    });
    expect(index.entries.find((entry) => entry.id === "never-proven")?.composition).toEqual({
      extra: await digestOf(rawBundle(f.registry, "fragment", "extra")),
    });
  },
  30_000,
);

test.each([
  { label: "key", args: ["--key", privateKey] },
  { label: "key and unsigned", args: ["--key", privateKey, "--unsigned"] },
  { label: "check", args: ["--check", "http://127.0.0.1:1"] },
  { label: "check and unsigned", args: ["--check", "http://127.0.0.1:1", "--unsigned"] },
  { label: "no signing mode", args: [] },
])(
  "include-unproven refuses $label with a fixed usage error and preserves output",
  async ({ args }) => {
    const f = await fixture(space.dir());
    const before = preserve(f.out);
    const result = await f.invoke([
      "--out",
      f.out,
      "--previous",
      "none",
      "--include-unproven",
      ...args,
    ]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "--include-unproven requires --unsigned and cannot be used with --key or --check.\n",
    );
    expect(snapshot(f.out)).toEqual(before);
  },
  30_000,
);

test("including unproven stacks preserves real proofs and leaves subsequent signed builds gated", async () => {
  const f = await fixture(space.dir());
  const args = ["--out", f.out, "--previous", "none"];
  const development = await f.invoke([...args, "--unsigned", "--include-unproven"]);
  expect(development.status, development.stderr).toBe(0);
  expect(development.stderr).toBe("");
  expect(development.stdout).toContain("Included stack/never-proven unproven:");
  const dev = await readBuild(f.out);
  expect(dev.index.entries.map((entry) => `${entry.kind}/${entry.id}`)).toEqual([
    "fragment/extra",
    "fragment/tools",
    "fragment/unproven",
    "stack/never-proven",
    "stack/sample",
  ]);
  expect(dev.index.entries.find((entry) => entry.id === "never-proven")).not.toHaveProperty(
    "lastRun",
  );
  expect(dev.index.entries.find((entry) => entry.id === "sample")?.lastRun?.fingerprint).toBe(
    f.record.fingerprint,
  );
  for (const entry of dev.index.entries.filter((entry) => entry.kind === "stack"))
    expect(entry.composition).toEqual({
      tools: await digestOf(rawBundle(f.registry, "fragment", "tools")),
    });

  const signed = await f.invoke([...args, "--key", privateKey]);
  expect(signed.status, signed.stderr).toBe(0);
  expect(signed.stderr).toBe("");
  expect(signed.stdout).toContain("Omitted stack/never-proven");
  const release = await readBuild(f.out);
  expect(release.envelope.signature).not.toBe("");
  expect(release.index.entries).toEqual(
    dev.index.entries.filter((entry) => entry.id === "sample" || entry.id === "tools"),
  );
}, 30_000);
