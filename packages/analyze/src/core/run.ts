import { sep } from "node:path";
import type { SarifLog, SarifRun } from "../schemas/sarif";
import { sarifSchemaUri } from "../schemas/sarif";
import type { Attribution } from "./attribution";
import type { DigestResult } from "./digest";
import type { Metrics } from "./inventory";
import type { ToolLedgerEntry } from "./tools";
import { rewriteRunUris } from "./uri";

export const RECORD_VERSION = 1;
export const DRIVER_NAME = "quickstacks-analyze";
export const DRIVER_VERSION = "0.1.0";

export type AssembleInput = {
  readonly targetAbs: string;
  readonly digest: DigestResult;
  readonly metrics: Metrics;
  readonly attribution: Attribution;
  readonly tools: readonly ToolLedgerEntry[];
  readonly toolRuns: readonly SarifRun[];
  readonly sarifInputs: readonly { readonly id: string; readonly log: SarifLog }[];
  readonly createdAt: string;
  readonly runId: string;
};

function fileUri(dir: string): string {
  const normalized = dir.endsWith(sep) ? dir.slice(0, -1) : dir;
  const withSlashes = normalized.replace(/\\/g, "/");
  return `file://${withSlashes.startsWith("/") ? withSlashes : `/${withSlashes}`}/`;
}

function metricsBlock(metrics: Metrics): Record<string, unknown> {
  return {
    files: metrics.files,
    bytes: metrics.bytes,
    lines: metrics.lines,
    codeLines: metrics.codeLines,
    blankLines: metrics.blankLines,
    commentLines: metrics.commentLines,
    byLanguage: metrics.byLanguage,
    testRatio: Number(metrics.testRatio.toFixed(4)),
    testFiles: metrics.testFiles,
    sourceFiles: metrics.sourceFiles,
    markers: metrics.markers,
    largestFiles: metrics.largestFiles,
    manifests: metrics.manifests,
    filesByLanguage: metrics.filesByLanguage,
  };
}

function attributionBlock(attribution: Attribution): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: attribution.kind };
  if (attribution.stack !== undefined) out.stack = attribution.stack;
  if (attribution.with !== undefined) out.with = attribution.with;
  if (attribution.preset !== undefined) out.preset = attribution.preset;
  if (attribution.agent !== undefined) out.agent = attribution.agent;
  if (attribution.fingerprint !== undefined) out.fingerprint = attribution.fingerprint;
  if (attribution.label !== undefined) out.label = attribution.label;
  return out;
}

export function assemble(input: AssembleInput): SarifLog {
  const base = fileUri(input.targetAbs);
  const envelopeRun: SarifRun = {
    tool: {
      driver: {
        name: DRIVER_NAME,
        version: DRIVER_VERSION,
        rules: [],
      },
    },
    invocations: [
      {
        executionSuccessful: true,
        startTimeUtc: input.createdAt,
        endTimeUtc: input.createdAt,
      },
    ],
    results: [],
    originalUriBaseIds: { "%SRCROOT%": { uri: base } },
    properties: {
      quickstacks: {
        recordVersion: RECORD_VERSION,
        runId: input.runId,
        createdAt: input.createdAt,
        target: {
          digest: input.digest.digest,
          files: input.digest.files,
          bytes: input.digest.bytes,
          excluded: input.digest.excluded,
          skippedSymlinks: input.digest.skippedSymlinks,
        },
        attribution: attributionBlock(input.attribution),
        metrics: metricsBlock(input.metrics),
        tools: input.tools,
      },
    },
  };

  const runs: SarifRun[] = [envelopeRun, ...input.toolRuns];
  for (const sarifInput of input.sarifInputs) {
    for (const run of sarifInput.log.runs) {
      runs.push(rewriteRunUris(run, input.targetAbs));
    }
  }

  return {
    version: "2.1.0",
    $schema: sarifSchemaUri(),
    runs,
  };
}
