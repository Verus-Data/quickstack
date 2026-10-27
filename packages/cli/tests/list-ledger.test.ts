import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { ListResult } from "../src/schemas/list";
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
  writeEntry(registry, "stack", "unproven", minimal("stack", "unproven"));
  writeEntry(registry, "fragment", "extra", minimal("fragment", "extra"));
  writeEntry(registry, "stack", "shadowed", minimal("stack", "shadowed"));
  const user = join(home, "config", "quickstacks");
  writeEntry(user, "stack", "shadowed", minimal("stack", "shadowed"));
  writeEntry(user, "stack", "user-only", minimal("stack", "user-only"));
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
  writeEntry(registry, "stack", "failed", minimal("stack", "failed"));
  writeEntry(registry, "stack", "unproven", minimal("stack", "unproven"));
  const record = await ledgerRecord(registry);
  writeLedger(registry, [record, { ...record, stack: "failed", result: "fail" }]);
  for (const host of [terminal, { stdoutIsTTY: false }]) {
    const result = await runCli(["list"], { home, env: quiet, host: { ...host, registry } });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const lines = result.stdout.split("\n");
    expect(lines.find((line) => /^\s+sample(?:\s|$)/.test(line))).toMatch(
      /\bproven\s+2026-10-27\b/,
    );
    expect(lines.find((line) => /^\s+failed(?:\s|$)/.test(line))).toMatch(/\bfail\s+2026-10-27\b/);
    expect(lines.find((line) => /^\s+unproven(?:\s|$)/.test(line))).toMatch(
      /\bunproven\b.*\bunproven\b/,
    );
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
