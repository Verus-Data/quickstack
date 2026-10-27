import { Effect, FileSystem, Option, Path } from "effect";
import type { Artifact, Location, SarifLog, SarifRun } from "../../schemas/analyze";
import { sarifSchemaUri } from "../../schemas/analyze";
import type { DigestResult, Layout, Metrics } from "./inventory";
import type { ToolLedgerEntry, ToolNotRunEntry } from "./tools";

// --- Attribution ---

export type AttributionKind = "manifest" | "label" | "none";

export type Attribution = {
  readonly kind: AttributionKind;
  readonly stack?: string;
  readonly with?: readonly string[];
  readonly preset?: string;
  readonly agent?: string;
  readonly fingerprint?: string;
  readonly label?: string;
};

export type AttributionRead = {
  readonly attribution: Attribution;
  readonly warning?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === "string") out.push(v);
  }
  return out;
}

export function readAttribution(
  targetAbs: string,
  label?: string,
): Effect.Effect<AttributionRead, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(targetAbs, ".quickstacks", "manifest.json");
    const exists = yield* Effect.option(fs.exists(manifestPath));
    const manifestExists = Option.isSome(exists) && exists.value;
    if (!manifestExists) {
      if (label !== undefined) {
        return { attribution: { kind: "label", label } };
      }
      return { attribution: { kind: "none" } };
    }
    const rawOption = yield* Effect.option(fs.readFileString(manifestPath));
    if (Option.isNone(rawOption)) {
      return {
        attribution: label !== undefined ? { kind: "label", label } : { kind: "none" },
        warning: `Could not read ${manifestPath}.`,
      };
    }
    const raw = rawOption.value;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "invalid JSON";
      return {
        attribution: label !== undefined ? { kind: "label", label } : { kind: "none" },
        warning: `Manifest at ${manifestPath} is malformed: ${reason}.`,
      };
    }
    if (!isObject(parsed)) {
      return {
        attribution: label !== undefined ? { kind: "label", label } : { kind: "none" },
        warning: `Manifest at ${manifestPath} is not a JSON object.`,
      };
    }
    const stack = asString(parsed.stack);
    const withArr = asStringArray(parsed.with);
    const preset = asString(parsed.preset);
    const agent = asString(parsed.agent);
    const fingerprint = asString(parsed.fingerprint);
    return {
      attribution: {
        kind: "manifest",
        stack,
        with: withArr,
        preset,
        agent,
        fingerprint,
        label,
      },
    };
  });
}

// --- URI relativisation ---

export function relativizeUri(uri: string | undefined, targetAbs: string): string | undefined {
  if (uri === undefined) return undefined;
  if (uri.startsWith("file://")) {
    const p = uri.slice("file://".length);
    const normalized = p.startsWith("/") ? p : `/${p}`;
    const target = targetAbs.replace(/\\/g, "/");
    if (normalized === target || normalized.startsWith(`${target}/`)) {
      return normalized.slice(target.length + 1);
    }
    return normalized.slice(1);
  }
  return uri;
}

export function rewriteRunUris(run: SarifRun, targetAbs: string): SarifRun {
  const sep = targetAbs.includes("/") && !targetAbs.includes("\\") ? "/" : "/";
  const base = `file://${targetAbs.endsWith(sep) ? targetAbs : `${targetAbs}${sep}`}`;
  const originalUriBaseIds = { "%SRCROOT%": { uri: base } };
  const rewrittenArtifacts = Array.isArray(run.artifacts)
    ? run.artifacts.map((a: Artifact) => ({
        ...a,
        location: a.location
          ? { ...a.location, uri: relativizeUri(a.location.uri, targetAbs) }
          : a.location,
      }))
    : run.artifacts;
  const rewrittenResults = Array.isArray(run.results)
    ? run.results.map((r) => {
        const locations = Array.isArray(r.locations)
          ? r.locations.map((loc: Location) => ({
              ...loc,
              physicalLocation: loc.physicalLocation
                ? {
                    ...loc.physicalLocation,
                    artifactLocation: loc.physicalLocation.artifactLocation
                      ? {
                          ...loc.physicalLocation.artifactLocation,
                          uri: relativizeUri(loc.physicalLocation.artifactLocation.uri, targetAbs),
                        }
                      : loc.physicalLocation.artifactLocation,
                  }
                : loc.physicalLocation,
            }))
          : r.locations;
        return { ...r, locations };
      })
    : run.results;
  return {
    ...run,
    originalUriBaseIds,
    artifacts: rewrittenArtifacts,
    results: rewrittenResults,
  };
}

// --- Envelope assembly ---

export const RECORD_VERSION = 1;
export const DRIVER_NAME = "quickstacks-analyze";
export const DRIVER_VERSION = "0.1.0";

export type AssembleInput = {
  readonly targetAbs: string;
  readonly digest: DigestResult;
  readonly metrics: Metrics;
  readonly layout: Layout;
  readonly attribution: Attribution;
  readonly tools: readonly ToolLedgerEntry[];
  readonly adapterOrder: readonly string[];
  readonly toolRuns: readonly SarifRun[];
  readonly sarifInputs: readonly { readonly id: string; readonly log: SarifLog }[];
  readonly createdAt: string;
  readonly runId: string;
};

function fileUri(dir: string): string {
  const normalized = dir.endsWith("/") ? dir.slice(0, -1) : dir;
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

function toolsNotRunBlock(
  tools: readonly ToolLedgerEntry[],
  adapterOrder: readonly string[],
): ToolNotRunEntry[] {
  // A tool that ran successfully is not listed here: its own SARIF run already
  // carries its identity, version and findings, so repeating them in this block
  // would be duplicated bookkeeping that drifts.
  const order = new Map<string, number>();
  for (let i = 0; i < adapterOrder.length; i += 1) {
    order.set(adapterOrder[i] ?? "", i);
  }
  return tools
    .filter((e) => e.status !== "ran")
    .map((e) => {
      const entry: ToolNotRunEntry = {
        id: e.id,
        status: e.status as ToolNotRunEntry["status"],
        ...(e.reason !== undefined ? { reason: e.reason } : {}),
      };
      return entry;
    })
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function assemble(input: AssembleInput): SarifLog {
  const base = fileUri(input.targetAbs);
  const envelopeRun: SarifRun = {
    tool: {
      driver: {
        name: DRIVER_NAME,
        version: DRIVER_VERSION,
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
        toolsNotRun: toolsNotRunBlock(input.tools, input.adapterOrder),
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
