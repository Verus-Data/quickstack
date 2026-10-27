import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Exit } from "effect";
import { describe, expect, test } from "vitest";
import { analyze, TOOLS } from "../../src/core/analyze";
import { type SarifLog, validateSarif } from "../../src/schemas/analyze";
import { runAnalyze } from "./helpers";

const TREE = join(import.meta.dirname, "..", "fixtures", "analyze", "tree");

function copyTree(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else {
      copyFileSync(from, to);
    }
  }
}

async function runMain(
  target: string,
  opts?: {
    exclude?: readonly string[];
    tool?: readonly string[];
    sarif?: readonly string[];
    label?: string;
    outputFile?: string;
  },
) {
  const { exit, capture } = await runAnalyze(
    analyze({
      target,
      exclude: opts?.exclude,
      tool: opts?.tool,
      sarif: opts?.sarif,
      label: opts?.label,
      outputFile: opts?.outputFile,
    }),
  );
  if (Exit.isFailure(exit)) return { ok: false as const, exit, capture };
  return { ok: true as const, result: exit.value, capture };
}

describe("main end-to-end", () => {
  test("returns a SARIF log that decodes against the schema", async () => {
    const out = await runMain(TREE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const validation = validateSarif(out.result.log);
    expect(validation.ok).toBe(true);
  });

  test("runs[0] is the envelope carrying properties.quickstacks", async () => {
    const out = await runMain(TREE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const log = out.result.log;
    const envelope = log.runs[0];
    expect(envelope?.tool?.driver?.name).toBe("quickstacks-analyze");
    const qs = (envelope?.properties as { quickstacks?: { target?: { digest?: string } } })
      ?.quickstacks;
    expect(qs?.target?.digest).toMatch(/^sha256:[0-9a-f]+$/);
  });

  test("every artifact URI in the envelope is relative and POSIX-separated", async () => {
    const out = await runMain(TREE);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const envelope = out.result.log.runs[0];
    const originalUriBaseIds = envelope?.originalUriBaseIds;
    expect(originalUriBaseIds?.["%SRCROOT%"]?.uri).toMatch(/^file:\/\//);
  });

  test("a non-existent target fails with BadInput", async () => {
    const out = await runMain(join(TREE, "does-not-exist"));
    expect(out.ok).toBe(false);
  });

  test("no planted environment variable value appears in the serialised log", async () => {
    process.env.QS_TEST_SECRET = "supersecret-leak-token-xyz";
    process.env.QS_TEST_TOKEN = "another-leak-token-abc";
    try {
      const out = await runMain(TREE);
      if (!out.ok) throw new Error("expected success");
      const serialized = JSON.stringify(out.result.log);
      expect(serialized).not.toContain("supersecret-leak-token-xyz");
      expect(serialized).not.toContain("another-leak-token-abc");
    } finally {
      delete process.env.QS_TEST_SECRET;
      delete process.env.QS_TEST_TOKEN;
    }
  });

  test("outputFile inside the target does not include the output file in the digest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "main-out-"));
    try {
      copyTree(TREE, dir);
      const outFile = join(dir, "record.sarif");
      const out = await runMain(dir, { outputFile: outFile });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      // analyze() returns the log; the script writes it. Write it here to verify the digest.
      writeFileSync(outFile, `${JSON.stringify(out.result.log)}\n`, "utf8");
      const written = readFileSync(outFile, "utf8");
      const parsedLog = JSON.parse(written) as SarifLog;
      const qs = parsedLog.runs[0]?.properties as
        | { quickstacks?: { target?: { files?: number } } }
        | undefined;
      expect(qs?.quickstacks?.target?.files).toBe(6);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the TOOLS const carries all six configured adapters", () => {
    expect(TOOLS.length).toBe(6);
    const ids = TOOLS.map((t) => t.id);
    expect(ids).toEqual(["semgrep", "ruff", "eslint", "golangci-lint", "trivy", "gitleaks"]);
  });

  test("two runs over the same tree are identical once runId, createdAt and durations are stripped (runId is unique per invocation)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "main-det-"));
    try {
      copyTree(TREE, dir);
      const a = await runMain(dir);
      const b = await runMain(dir);
      if (!a.ok || !b.ok) throw new Error("expected success");
      const logA = a.result.log;
      const logB = b.result.log;
      const runIdA = (logA.runs[0]?.properties as { quickstacks?: { runId?: string } })?.quickstacks
        ?.runId;
      const runIdB = (logB.runs[0]?.properties as { quickstacks?: { runId?: string } })?.quickstacks
        ?.runId;
      expect(runIdA).toMatch(/^run-[0-9TZ]+-[0-9a-f]{8}$/);
      expect(runIdB).toMatch(/^run-[0-9TZ]+-[0-9a-f]{8}$/);
      expect(runIdA).not.toBe(runIdB);
      expect(stripVolatile(logA)).toEqual(stripVolatile(logB));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an adopted --sarif log with absolute artifact URIs is rewritten to relative URIs with the base in originalUriBaseIds", async () => {
    const dir = mkdtempSync(join(tmpdir(), "main-sarif-"));
    try {
      copyTree(TREE, dir);
      const absArtifact = `${dir}/src/add.ts`.replace(/\\/g, "/");
      const adopted = {
        version: "2.1.0",
        runs: [
          {
            tool: { driver: { name: "external" } },
            results: [
              {
                ruleId: "x",
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: `file://${absArtifact}` },
                    },
                  },
                ],
              },
            ],
            artifacts: [{ location: { uri: `file://${absArtifact}` } }],
          },
        ],
      };
      const sarifFile = join(dir, "external.sarif");
      writeFileSync(sarifFile, JSON.stringify(adopted), "utf8");
      const out = await runMain(dir, { sarif: [sarifFile] });
      if (!out.ok) throw new Error("expected success");
      const log = out.result.log;
      const adoptedRun = log.runs.find((r) => r.tool?.driver?.name === "external");
      expect(adoptedRun).toBeDefined();
      expect(adoptedRun?.originalUriBaseIds?.["%SRCROOT%"]?.uri).toMatch(/^file:\/\//);
      const artifactUri = adoptedRun?.artifacts?.[0]?.location?.uri;
      expect(artifactUri).toBe("src/add.ts");
      const resultUri =
        adoptedRun?.results?.[0]?.locations?.[0]?.physicalLocation?.artifactLocation?.uri;
      expect(resultUri).toBe("src/add.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function stripVolatile(log: SarifLog): string {
  const clone = JSON.parse(JSON.stringify(log)) as {
    runs: Array<{
      invocations?: Array<{ startTimeUtc?: unknown; endTimeUtc?: unknown }>;
      properties?: { quickstacks?: Record<string, unknown> };
    }>;
  };
  for (const run of clone.runs) {
    if (run.invocations) {
      for (const inv of run.invocations) {
        inv.startTimeUtc = "X";
        inv.endTimeUtc = "X";
      }
    }
    const qs = run.properties?.quickstacks;
    if (qs) {
      qs.runId = "X";
      qs.createdAt = "X";
    }
  }
  return JSON.stringify(clone);
}
