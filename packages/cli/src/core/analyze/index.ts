import { randomUUID } from "node:crypto";
import { Effect, FileSystem, Option, Path, Schema } from "effect";
import { AppConfig } from "../../config";
import { BadInput, type PermissionDenied } from "../../errors";
import {
  AnalysisSummary,
  type SarifLog,
  type SarifRun,
  validateSarif,
} from "../../schemas/analyze";
import { Output } from "../../services/output";
import type { Processes } from "../../services/processes";
import {
  computeDigest,
  computeInventory,
  computeLayout,
  type DigestResult,
  type Layout,
  type Metrics,
} from "./inventory";
import { type Attribution, assemble, readAttribution } from "./record";
import { runTools, type ToolLedgerEntry, type ToolNotRunEntry, type ToolRunResult } from "./tools";

export type AnalyzeOptions = {
  readonly target: string;
  readonly exclude?: readonly string[];
  readonly tool?: readonly string[];
  readonly sarif?: readonly string[];
  readonly label?: string;
  readonly outputFile?: string;
};

export type AnalyzeResult = {
  readonly summary: AnalysisSummary;
  readonly log: SarifLog;
};

function findFindings(runs: readonly SarifRun[]): {
  total: number;
  byLevel: { error: number; warning: number; note: number };
} {
  let total = 0;
  const byLevel = { error: 0, warning: 0, note: 0 };
  for (const run of runs) {
    if (!Array.isArray(run.results)) continue;
    for (const result of run.results) {
      total += 1;
      const level = result.level;
      if (level === "error") byLevel.error += 1;
      else if (level === "warning") byLevel.warning += 1;
      else if (level === "note") byLevel.note += 1;
    }
  }
  return { total, byLevel };
}

function buildSummary(
  digest: DigestResult,
  metrics: Metrics,
  layout: Layout,
  attribution: Attribution,
  toolResult: ToolRunResult,
  log: SarifLog,
  createdAt: string,
  runId: string,
): AnalysisSummary {
  const toolsNotRun: ToolNotRunEntry[] = toolResult.ledger
    .filter((e: ToolLedgerEntry) => e.status !== "ran")
    .map((e) => ({
      id: e.id,
      status: e.status as ToolNotRunEntry["status"],
      ...(e.reason !== undefined ? { reason: e.reason } : {}),
    }))
    .sort((a, b) => {
      const order = new Map(toolResult.adapterOrder.map((id, i) => [id, i] as const));
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });

  const findings = findFindings(log.runs as readonly SarifRun[]);

  const summary: AnalysisSummary = {
    schemaVersion: 1,
    runId,
    createdAt,
    digest: digest.digest,
    target: {
      files: digest.files,
      bytes: digest.bytes,
      skippedSymlinks: digest.skippedSymlinks,
      excluded: [...digest.excluded],
    },
    layout: {
      topLevel: [...layout.topLevel].slice(0, 40),
      maxDepth: layout.maxDepth,
    },
    metrics: {
      lines: metrics.lines,
      codeLines: metrics.codeLines,
      blankLines: metrics.blankLines,
      testRatio: Number(metrics.testRatio.toFixed(4)),
      byLanguage: { ...metrics.byLanguage },
      markers: { ...metrics.markers },
      manifests: [...metrics.manifests],
    },
    attribution: {
      kind: attribution.kind,
      ...(attribution.stack !== undefined ? { stack: attribution.stack } : {}),
      with: attribution.with ?? [],
      ...(attribution.preset !== undefined ? { preset: attribution.preset } : {}),
      ...(attribution.agent !== undefined ? { agent: attribution.agent } : {}),
      ...(attribution.fingerprint !== undefined ? { fingerprint: attribution.fingerprint } : {}),
      ...(attribution.label !== undefined ? { label: attribution.label } : {}),
    },
    toolsNotRun,
    findings,
  };
  return summary;
}

export function analyze(
  options: AnalyzeOptions,
): Effect.Effect<
  AnalyzeResult,
  BadInput | PermissionDenied,
  FileSystem.FileSystem | Path.Path | Processes | AppConfig | Output
> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const config = yield* AppConfig;
    const output = yield* Output;
    /** Warnings are non-critical: a closed or unwritable stderr does not fail the analysis. */
    const note = (text: string) => Effect.ignore(output.note(text));

    // Resolve and validate the target path.
    const target = path.resolve(options.target);
    const targetExists = yield* Effect.option(fs.exists(target));
    if (Option.isNone(targetExists) || !targetExists.value) {
      return yield* Effect.fail(new BadInput());
    }
    const stat = yield* Effect.option(fs.stat(target));
    if (Option.isNone(stat) || stat.value.type !== "Directory") {
      return yield* Effect.fail(new BadInput());
    }

    const excludeGlobs = options.exclude ?? [];
    const outputFile =
      options.outputFile !== undefined ? path.resolve(options.outputFile) : undefined;

    // Tier 0: digest, inventory, layout.
    const digest = yield* computeDigest(target, { excludeGlobs, outputFile });
    const metrics = yield* computeInventory(target, excludeGlobs);
    const layout = yield* computeLayout(target);

    // Attribution.
    const { attribution, warning } = yield* readAttribution(target, options.label);
    if (warning !== undefined) {
      yield* note(`warning: ${warning}`);
    }

    // Tier 1: run tool adapters.
    const env = config.childEnv([]);
    const toolResult = yield* runTools(target, options.tool ?? [], env);

    // Tier 2: adopt external SARIF logs.
    const sarifInputs: { id: string; log: SarifLog }[] = [];
    for (const file of options.sarif ?? []) {
      const abs = path.resolve(file);
      const fileExistsOpt = yield* Effect.option(fs.exists(abs));
      if (Option.isNone(fileExistsOpt) || !fileExistsOpt.value) {
        yield* note(`warning: --sarif file not found: ${file}`);
        continue;
      }
      const rawOption = yield* Effect.option(fs.readFileString(abs));
      if (Option.isNone(rawOption)) {
        yield* note(`warning: --sarif file unreadable: ${file}`);
        continue;
      }
      let parsedLog: unknown;
      try {
        parsedLog = JSON.parse(rawOption.value);
      } catch {
        yield* note(`warning: --sarif file is not JSON: ${file}`);
        continue;
      }
      const validation = validateSarif(parsedLog);
      if (!validation.ok) {
        yield* note(`warning: --sarif ${file}: ${validation.reason}`);
        continue;
      }
      sarifInputs.push({ id: `sarif:${file}`, log: validation.log });
    }

    // Build the SARIF log.
    const createdAt = new Date().toISOString();
    const compactUtc = createdAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const runId = `run-${compactUtc}-${randomUUID().slice(0, 8)}`;
    const log = assemble({
      targetAbs: target,
      digest,
      metrics,
      layout,
      attribution,
      tools: toolResult.ledger,
      adapterOrder: toolResult.adapterOrder,
      toolRuns: toolResult.runs,
      sarifInputs,
      createdAt,
      runId,
    });

    // Build the summary and validate it through the schema.
    const summary = buildSummary(
      digest,
      metrics,
      layout,
      attribution,
      toolResult,
      log,
      createdAt,
      runId,
    );
    const encoded = yield* Schema.encodeUnknownEffect(AnalysisSummary)(summary).pipe(Effect.orDie);

    return { summary: encoded as AnalysisSummary, log };
  });
}

export type { Result as SarifResult, SarifLog, SarifRun } from "../../schemas/analyze";
export { countResults, sarifSchemaUri, validateSarif } from "../../schemas/analyze";
export type { DigestResult, Layout, Metrics } from "./inventory";
export {
  computeDigest,
  computeInventory,
  computeLayout,
  EXCLUDED_NAMES,
  matchGlob,
} from "./inventory";
export type { Attribution, AttributionKind } from "./record";
export { assemble, DRIVER_NAME, DRIVER_VERSION, readAttribution, rewriteRunUris } from "./record";
export type {
  ToolEntry,
  ToolLedgerEntry,
  ToolNotRunEntry,
  ToolNotRunStatus,
  ToolRunResult,
  ToolStatus,
} from "./tools";
// Re-export for tests and the script.
export { runToolsWith, TOOLS } from "./tools";
