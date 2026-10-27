import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SarifLog } from "../src/schemas/analyze";

const SCRIPT = join(import.meta.dirname, "..", "scripts", "analyze.ts");
const TREE = join(import.meta.dirname, "..", "tests", "fixtures", "analyze", "tree");

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
  const child = Bun.spawn([process.execPath, SCRIPT, ...args], {
    cwd,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? tmpdir() },
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

describe("scripts/analyze.ts smoke", () => {
  test("runs against the fixture tree and emits a decodable SARIF log on stdout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "analyze-e2e-"));
    try {
      copyTree(TREE, dir);
      const { stdout, stderr, status } = await run([dir], dir);
      expect(status).toBe(0);
      expect(stderr).toBe("");
      const log = JSON.parse(stdout) as SarifLog;
      expect(log.version).toBe("2.1.0");
      expect(log.runs.length).toBeGreaterThanOrEqual(1);
      const envelope = log.runs[0];
      expect(envelope?.tool?.driver?.name).toBe("quickstacks-analyze");
      const qs = envelope?.properties as
        | { quickstacks?: { target?: { files?: number } } }
        | undefined;
      expect(qs?.quickstacks?.target?.files).toBe(6);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
