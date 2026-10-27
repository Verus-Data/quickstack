import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { ShowReport } from "../src/schemas/show";
import { quiet, runCli } from "./helpers/cli";
import { ledgerRecord, ledgerRegistry, writeLedger } from "./helpers/ledger";
import { minimal, writeEntry } from "./helpers/registry";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());

function fixture() {
  const home = space.dir();
  const registry = ledgerRegistry(space.dir());
  const invoke = (id = "sample", args = ["--json"], human = false) =>
    runCli(["show", id, ...args], {
      home,
      env: quiet,
      host: { registry, stdoutIsTTY: human },
    });
  return { registry, invoke };
}

test("an unsupported recorded preset stays visible without claiming the content matches", async () => {
  const f = fixture();
  const record = await ledgerRecord(f.registry, { preset: "future-preset" });
  writeLedger(f.registry, [record]);
  const result = await f.invoke();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(Schema.decodeUnknownSync(ShowReport)(JSON.parse(result.stdout)).lastRun).toMatchObject({
    preset: "future-preset",
    sameContent: false,
    fingerprint: record.fingerprint,
  });
});

test.each(["json", "agent", "human"])(
  "%s retains valid evidence and warns once for mixed invalid and newer ledger records",
  async (audience) => {
    const f = fixture();
    const record = await ledgerRecord(f.registry);
    writeLedger(f.registry, [
      record,
      null,
      { ...record, schemaVersion: 2, date: "2026-10-30" },
      { ...record, result: "unsupported", date: "2026-10-31" },
    ]);
    const file = join(f.registry, "runs.json");
    const before = readFileSync(file, "utf8");
    const result = await f.invoke(
      "sample",
      audience === "json" ? ["--json"] : [],
      audience === "human",
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe(
      "Warning: the bundled ledger runs.json is unreadable or contains unsupported records.\n",
    );
    if (audience === "json") {
      expect(Schema.decodeUnknownSync(ShowReport)(JSON.parse(result.stdout)).lastRun).toMatchObject(
        {
          date: record.date,
          result: "pass",
          sameContent: true,
        },
      );
    } else {
      expect(result.stdout).toContain(record.date);
      expect(result.stdout).toContain("pass");
    }
    expect(readFileSync(file, "utf8")).toBe(before);
  },
);

test("a removed stack's newest evidence does not hide a fragment's usable older run", async () => {
  const f = fixture();
  writeEntry({
    root: f.registry,
    kind: "fragment",
    dir: "extra",
    frontmatter: minimal("fragment", "extra"),
  });
  const valid = await ledgerRecord(f.registry, { with: ["extra"] });
  writeLedger(f.registry, [valid, { ...valid, date: "2026-10-28", stack: "removed-stack" }]);
  const result = await f.invoke("extra");
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(Schema.decodeUnknownSync(ShowReport)(JSON.parse(result.stdout)).lastRun).toMatchObject({
    stack: "sample",
    date: valid.date,
  });
});
