import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_TOOLS_JSON_PATH, loadTools } from "../src/core/tools";
import type { SarifLog } from "../src/schemas/sarif";

const BIN = join(import.meta.dirname, "..", "src", "bin.ts");
const TREE = join(import.meta.dirname, "..", "tests", "fixtures", "tree");

function copyTree(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
  }
}

async function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; status: number }> {
  const child = Bun.spawn(["bun", BIN, ...args], {
    cwd,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: tmpdir() },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, status };
}

describe("e2e analyze entry point", () => {
  test("runs against the fixture tree and emits a decodable SARIF log", async () => {
    const out = mkdtempSync(join(tmpdir(), "analyze-e2e-"));
    const dir = mkdtempSync(join(tmpdir(), "analyze-e2e-tree-"));
    try {
      copyTree(TREE, dir);
      const report = join(out, "report.sarif");
      const { stdout, stderr, status } = await run([dir, "--out", report], dir);
      expect(status).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toBe("");
      const raw = readFileSync(report, "utf8");
      const log = JSON.parse(raw) as SarifLog;
      expect(log.version).toBe("2.1.0");
      expect(log.runs.length).toBeGreaterThanOrEqual(1);
      const envelope = log.runs[0];
      expect(envelope?.tool?.driver?.name).toBe("quickstacks-analyze");
      const qs = envelope?.properties as
        | { quickstacks?: { target?: { files?: number } } }
        | undefined;
      expect(qs?.quickstacks?.target?.files).toBe(6);
    } finally {
      rmSync(out, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("writes to stdout when --out is not given", async () => {
    const dir = mkdtempSync(join(tmpdir(), "analyze-e2e-stdout-"));
    try {
      copyTree(TREE, dir);
      const { stdout, status } = await run([dir], dir);
      expect(status).toBe(0);
      const log = JSON.parse(stdout) as SarifLog;
      expect(log.version).toBe("2.1.0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a default run has one ledger entry per configured tool (fails if the table is not found)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "analyze-e2e-ledger-"));
    try {
      copyTree(TREE, dir);
      const { stdout, status } = await run([dir], dir);
      expect(status).toBe(0);
      const log = JSON.parse(stdout) as SarifLog;
      const qs = log.runs[0]?.properties as
        | { quickstacks?: { tools?: Array<{ id: string; status: string }> } }
        | undefined;
      const tools = qs?.quickstacks?.tools ?? [];
      const configured = loadTools(DEFAULT_TOOLS_JSON_PATH);
      expect(configured.length).toBe(6);
      expect(tools.length).toBe(configured.length);
      const ids = tools.map((t) => t.id).sort();
      const configuredIds = configured.map((t) => t.id).sort();
      expect(JSON.stringify(ids)).toBe(JSON.stringify(configuredIds));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("exits 2 for an unknown flag", async () => {
    const { status, stderr } = await run([TREE, "--nope"], TREE);
    expect(status).toBe(2);
    expect(stderr).toContain("--nope");
  });

  test("exits 0 for --help", async () => {
    const { status, stdout } = await run(["--help"], TREE);
    expect(status).toBe(0);
    expect(stdout).toContain("Usage:");
  });
});
