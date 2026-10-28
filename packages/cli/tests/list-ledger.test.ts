import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { ListResult } from "../src/schemas/list";
import { ShowReport } from "../src/schemas/show";
import { quiet, runCli, terminal } from "./helpers/cli";
import { ledgerRecord, ledgerRegistry, writeLedger } from "./helpers/ledger";
import { minimal, writeEntry } from "./helpers/registry";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());
const decode = (stdout: string) =>
  Schema.decodeUnknownSync(ListResult, { onExcessProperty: "error" })(JSON.parse(stdout));

test("list attaches only the latest default-composition bundled proof and preserves other fields [2.0c#4]", async () => {
  const home = space.dir();
  const registry = ledgerRegistry(space.dir());
  writeEntry({
    root: registry,
    kind: "stack",
    dir: "unproven",
    frontmatter: minimal("stack", "unproven"),
  });
  writeEntry({
    root: registry,
    kind: "fragment",
    dir: "extra",
    frontmatter: minimal("fragment", "extra"),
  });
  writeEntry({
    root: registry,
    kind: "stack",
    dir: "shadowed",
    frontmatter: minimal("stack", "shadowed"),
  });
  const user = join(home, "config", "stacks");
  writeEntry({
    root: user,
    kind: "stack",
    dir: "shadowed",
    frontmatter: minimal("stack", "shadowed"),
  });
  writeEntry({
    root: user,
    kind: "stack",
    dir: "user-only",
    frontmatter: minimal("stack", "user-only"),
  });
  const list = () => runCli(["list", "--json"], { home, env: quiet, host: { registry } });
  const before = await list();
  expect(before.status).toBe(0);
  expect(before.stderr).toBe("");
  const baseline = decode(before.stdout);
  expect(baseline.rejected).toEqual([]);
  expect(baseline.entries).toEqual([
    ...[
      { id: "sample", origin: "bundled", shadows: [] },
      { id: "shadowed", origin: "user", shadows: ["bundled"] },
      { id: "unproven", origin: "bundled", shadows: [] },
      { id: "user-only", origin: "user", shadows: [] },
    ].map(({ id, origin, shadows }) => ({
      id,
      kind: "stack",
      name: `${id} name`,
      description: `${id} description.`,
      tags: [],
      origin,
      trusted: true,
      shadows,
      lastRun: null,
    })),
    {
      id: "extra",
      kind: "fragment",
      name: "extra name",
      description: "extra description.",
      tags: [],
      category: "tooling",
      appliesTo: [],
      origin: "bundled",
      trusted: true,
      shadows: [],
      lastRun: null,
    },
  ]);
  expect(baseline.entries.map((row) => row.id)).toEqual([
    "sample",
    "shadowed",
    "unproven",
    "user-only",
    "extra",
  ]);
  const old = await ledgerRecord(registry, { date: "2026-10-25" });
  const latest = {
    ...old,
    date: "2026-10-26",
    agent: "codex" as const,
    preset: "default",
    result: "fail" as const,
  };
  writeLedger(registry, [
    latest,
    old,
    { ...old, date: "2026-10-28", with: ["extra"] },
    { ...old, stack: "shadowed" },
    { ...old, stack: "user-only" },
    { ...old, stack: "extra" },
  ]);
  writeLedger(user, [{ ...old, stack: "user-only", date: "2026-10-29" }]);
  const after = await list();
  expect(after.status).toBe(0);
  expect(after.stderr).toBe("");
  const listed = decode(after.stdout);
  expect(listed.rejected).toEqual([]);
  expect(listed.entries.map(({ lastRun, ...row }) => row)).toEqual(
    baseline.entries.map(({ lastRun, ...row }) => row),
  );
  expect(listed.entries.map((row) => ({ id: row.id, lastRun: row.lastRun }))).toEqual([
    {
      id: "sample",
      lastRun: {
        date: latest.date,
        result: latest.result,
        agent: latest.agent,
        preset: latest.preset,
        fingerprint: latest.fingerprint,
      },
    },
    ...["shadowed", "unproven", "user-only", "extra"].map((id) => ({ id, lastRun: null })),
  ]);
});

test("human and agent list label passing, failed and unproven stacks [2.0c#4]", async () => {
  const home = space.dir();
  const registry = ledgerRegistry(space.dir());
  writeEntry({
    root: registry,
    kind: "stack",
    dir: "failed",
    frontmatter: minimal("stack", "failed"),
  });
  writeEntry({
    root: registry,
    kind: "stack",
    dir: "unproven",
    frontmatter: minimal("stack", "unproven"),
  });
  const record = await ledgerRecord(registry);
  writeLedger(registry, [record, { ...record, stack: "failed", result: "fail" }]);
  for (const host of [terminal, { stdoutIsTTY: false }]) {
    const result = await runCli(["list"], { home, env: quiet, host: { ...host, registry } });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const lines = result.stdout.split("\n");
    expect(lines.find((line) => /^\s+sample(?:\s|$)/.test(line))).toMatch(
      /\bhistorical pass\s+2026-10-27\b/,
    );
    expect(lines.find((line) => /^\s+failed(?:\s|$)/.test(line))).toMatch(/\bfail\s+2026-10-27\b/);
    expect(lines.find((line) => /^\s+unproven(?:\s|$)/.test(line))).toMatch(
      /\bunproven\b.*\bunproven\b/,
    );
  }
});

test("catalog passes remain explicitly historical after content changes", async () => {
  const home = space.dir();
  const registry = ledgerRegistry(space.dir());
  const record = await ledgerRecord(registry);
  writeLedger(registry, [record]);
  const original = readFileSync(join(registry, "stacks/sample/files/README.md.tmpl"), "utf8");
  for (const content of [original, "# changed after the pass\n"]) {
    writeFileSync(join(registry, "stacks/sample/files/README.md.tmpl"), content);
    for (const host of [terminal, { stdoutIsTTY: false }]) {
      const result = await runCli(["list", "stacks"], {
        home,
        env: quiet,
        host: { ...host, registry },
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("historical pass 2026-10-27");
      expect(result.stdout).not.toMatch(/\bproven\b/);
    }
    const json = await runCli(["list", "stacks", "--json"], {
      home,
      env: quiet,
      host: { registry },
    });
    expect(json.status).toBe(0);
    expect(json.stderr).toBe("");
    expect(decode(json.stdout).entries[0]?.lastRun).toMatchObject({
      result: "pass",
      fingerprint: record.fingerprint,
    });
    const shown = await runCli(["show", "sample", "--json"], {
      home,
      env: quiet,
      host: { registry },
    });
    expect(shown.status).toBe(0);
    expect(shown.stderr).toBe("");
    expect(
      Schema.decodeUnknownSync(ShowReport)(JSON.parse(shown.stdout)).lastRun?.sameContent,
    ).toBe(content === original);
  }
});

test.each(["missing", "", "{ broken", '{"schemaVersion":2,"records":[]}'])(
  "list tolerates a %s ledger without rejecting entries [2.0c#8]",
  async (text) => {
    const home = space.dir();
    const registry = ledgerRegistry(space.dir());
    if (text !== "missing") writeFileSync(join(registry, "runs.json"), text);
    const result = await runCli(["list", "--json"], { home, env: quiet, host: { registry } });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const listed = decode(result.stdout);
    expect(listed.rejected).toEqual([]);
    expect(listed.entries).toHaveLength(1);
    expect(listed.entries[0]).toMatchObject({ id: "sample", lastRun: null });
  },
);
