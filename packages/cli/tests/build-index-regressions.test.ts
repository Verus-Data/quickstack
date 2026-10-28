import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EntryBundle } from "@steamfield/stacks-format";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import {
  bundleFile,
  compositionFingerprint,
  digestOf,
  entryPath,
  fixture,
  privateKey,
  proof,
  readBuild,
  serve,
} from "./fixtures/index/harness";
import { writeLedger } from "./helpers/ledger";
import { reviewSearchFixture } from "./helpers/search-fixture";
import { workspace } from "./helpers/verify";

// Real builds and loopback servers, including three generations, need a 30 s budget.
const space = workspace();
afterEach(() => space.release());
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function build(f: Fixture, out: string, previous = "none") {
  const result = await f.invoke(["--out", out, "--previous", previous, "--key", privateKey]);
  expect(result.status, result.stderr).toBe(0);
  return readBuild(out);
}

test("a second carry-forward keeps fragment metadata aligned with its advertised bundle", async () => {
  const f = await fixture(space.dir());
  const secondRecord = await proof(f.registry, {
    stack: "never-proven",
    fingerprint: await compositionFingerprint(f.registry, { stack: "never-proven" }),
  });
  writeLedger(f.registry, [f.record, secondRecord]);
  const first = join(f.root, "first");
  await build(f, first);
  const source = join(entryPath(f.registry, "fragment", "tools"), "FRAGMENT.md");
  writeFileSync(
    source,
    readFileSync(source, "utf8")
      .replace("tools name", "tools revised name")
      .replace("tools description.", "tools revised description."),
  );
  reviewSearchFixture(f.registry);
  writeLedger(f.registry, [
    f.record,
    secondRecord,
    await proof(f.registry, { date: "2026-10-28" }),
  ]);
  // The first stack retains v1 while sample has a new proof for v2.
  const firstHost = await serve(first);
  const second = join(f.root, "second");
  try {
    await build(f, second, `${firstHost.url}/v1/index.json`);
  } finally {
    await firstHost.close();
  }
  writeLedger(f.registry, []);
  const secondHost = await serve(second);
  try {
    const { index } = await build(f, f.out, `${secondHost.url}/v1/index.json`);
    const entry = index.entries.find((entry) => entry.kind === "fragment" && entry.id === "tools");
    if (entry === undefined) throw new Error("Missing tools entry");
    const bundle = Schema.decodeUnknownSync(EntryBundle)(
      JSON.parse(readFileSync(bundleFile(f.out, entry), "utf8")),
    );
    const file = bundle.files.find((file) => file.path === "FRAGMENT.md");
    if (file === undefined) throw new Error("Missing fragment metadata");
    const text =
      file.encoding === "utf8"
        ? file.content
        : Buffer.from(file.content, "base64").toString("utf8");
    expect(text).toContain(`name: ${entry.name}\n`);
    expect(text).toContain(`description: ${entry.description}\n`);
  } finally {
    await secondHost.close();
  }
}, 30_000);

test("malformed check URLs fail concisely without a runtime stack", async () => {
  const f = await fixture(space.dir());
  const result = await f.invoke(["--check", "not-a-url"]);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim().split("\n")).toHaveLength(1);
  expect(result.stderr).not.toMatch(/TypeError|Error:|\n\s+at /);
}, 30_000);

test("an executing agent can prove content targeting a different adapter", async () => {
  const f = await fixture(space.dir());
  const adapter = join(entryPath(f.registry, "stack", "sample"), "adapters/claude");
  mkdirSync(adapter, { recursive: true });
  writeFileSync(join(adapter, "adapter.txt"), "Use this adapter.\n");
  writeLedger(f.registry, [await proof(f.registry, { agent: "codex" })]);
  const { index } = await build(f, f.out);
  const stack = index.entries.find((entry) => entry.kind === "stack" && entry.id === "sample");
  expect(stack?.lastRun?.agent).toBe("codex");
}, 30_000);

test("a cached previous index can fetch its bundles after a proven update", async () => {
  const f = await fixture(space.dir());
  const first = join(f.root, "first");
  const old = await build(f, first);
  for (const entry of old.index.entries) {
    const name = entry.kind === "stack" ? "STACK.md" : "FRAGMENT.md";
    const source = join(entryPath(f.registry, entry.kind, entry.id), name);
    writeFileSync(source, `${readFileSync(source, "utf8")}\nNew guidance.\n`);
  }
  reviewSearchFixture(f.registry);
  writeLedger(f.registry, [await proof(f.registry)]);
  const firstHost = await serve(first);
  try {
    const current = await build(f, f.out, `${firstHost.url}/v1/index.json`);
    for (const entry of old.index.entries)
      expect(
        current.index.entries.find((item) => item.kind === entry.kind && item.id === entry.id)
          ?.digest,
      ).not.toBe(entry.digest);
  } finally {
    await firstHost.close();
  }
  const host = await serve(f.out);
  try {
    for (const entry of old.index.entries) {
      const response = await fetch(
        `${host.url}/v1/entries/${entry.kind}/${entry.id}/${entry.digest}.json`,
      );
      expect(response.status).toBe(200);
      const bundle = Schema.decodeUnknownSync(EntryBundle)(await response.json());
      expect(await digestOf(bundle)).toBe(entry.digest);
    }
  } finally {
    await host.close();
  }
}, 30_000);
