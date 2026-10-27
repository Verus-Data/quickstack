import { expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";
import type { LedgerRecord } from "../src/schemas/ledger";
import { ListResult } from "../src/schemas/list";

const binary = join(import.meta.dir, "../dist/quickstacks");
const registry = join(import.meta.dir, "../registry");

test("the compiled binary reads its shipped ledger, including after relocation [2.0c#6]", async () => {
  const root = mkdtempSync(join(tmpdir(), "quickstacks-ledger-binary-"));
  try {
    const home = join(root, "unrelated cwd");
    mkdirSync(home);
    const invoke = async (executable: string) => {
      const child = Bun.spawn([executable, "list", "--json"], {
        cwd: home,
        env: {
          HOME: home,
          XDG_CONFIG_HOME: join(home, "config"),
          NO_COLOR: "1",
          LOG_LEVEL: "none",
          PATH: "/usr/bin:/bin",
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, status] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(status).toBe(0);
      expect(stderr).toBe("");
      return Schema.decodeUnknownSync(ListResult, { onExcessProperty: "error" })(
        JSON.parse(stdout),
      );
    };
    const listed = await invoke(binary);
    expect(listed.rejected).toEqual([]);
    const proven = listed.entries.find((row) => row.kind === "stack" && row.lastRun !== null);
    expect(proven).toBeDefined();
    // Decode only after checking the binary output, so the missing feature fails as behavior.
    const { Ledger, LedgerRecord } = await import("../src/schemas/ledger");
    const ledger = Schema.decodeUnknownSync(Ledger)(
      JSON.parse(readFileSync(join(registry, "runs.json"), "utf8")),
    );
    const records: LedgerRecord[] = [];
    for (const record of ledger.records)
      records.push(Schema.decodeUnknownSync(LedgerRecord)(record));
    const matching = records.filter(
      (record) => record.stack === proven?.id && record.with.length === 0,
    );
    expect(matching.length).toBeGreaterThan(0);
    const latest = matching.reduce((previous, record) =>
      record.date >= previous.date ? record : previous,
    );
    expect<unknown>(proven?.lastRun).toEqual({
      date: latest.date,
      result: latest.result,
      agent: latest.agent,
      preset: latest.preset,
      fingerprint: latest.fingerprint,
    });

    const prefix = join(root, "relocated package");
    mkdirSync(join(prefix, "dist"), { recursive: true });
    const relocated = join(prefix, "dist/quickstacks");
    copyFileSync(binary, relocated);
    chmodSync(relocated, 0o755);
    cpSync(registry, join(prefix, "registry"), { recursive: true });
    const marker = { ...latest, date: "2099-01-01", result: "fail" };
    writeFileSync(
      join(prefix, "registry/runs.json"),
      JSON.stringify({ schemaVersion: 1, records: [marker] }),
    );
    const moved = await invoke(relocated);
    expect<unknown>(
      moved.entries.find((row) => row.id === marker.stack && row.kind === "stack")?.lastRun,
    ).toEqual({
      date: marker.date,
      result: marker.result,
      agent: marker.agent,
      preset: marker.preset,
      fingerprint: marker.fingerprint,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
