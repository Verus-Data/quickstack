import type {
  EntryRef,
  Manifest,
  RunRecord,
  TelemetryErrorEvent,
  TelemetryEvent,
  TelemetryNewEvent,
  TelemetryVerifyEvent,
} from "@steamfield/stacks-format";
import type { Entry } from "../core/registry/entry";
import type { Project } from "./storage";

export type ScaffoldFacts = {
  type: "new" | "add";
  manifest: Manifest;
  without: readonly EntryRef[];
  source?: TelemetryNewEvent["source"];
  steps: readonly string[];
};
export type ShowFacts = Pick<Entry, "kind" | "id" | "origin" | "trusted">;
export type ErrorFacts = {
  command: "new" | "add";
  code: string;
  stack?: Pick<Entry, "id" | "origin" | "trusted">;
};
export type Envelope = Pick<
  TelemetryEvent,
  "schemaVersion" | "eventId" | "installId" | "cliVersion" | "os" | "nodeMajor" | "agent" | "sentAt"
>;
export const official = (entry: { origin: string; trusted?: boolean }) =>
  entry.trusted !== false && (entry.origin === "bundled" || entry.origin === "index");
export const publicId = (entry: { id: string; origin: string; trusted?: boolean }) =>
  official(entry) ? entry.id : "custom";

export function scaffoldEvent(input: ScaffoldFacts) {
  const { manifest } = input;
  const entries = [...(manifest.stack ? [manifest.stack] : []), ...manifest.fragments];
  const origins = new Set(entries.filter(official).map((entry) => entry.origin));
  const origin: TelemetryNewEvent["origin"] = origins.size > 1 ? "mixed" : undefined;
  const single: TelemetryNewEvent["origin"] = origins.has("bundled") ? "bundled" : undefined;
  const resolved = origin ?? single ?? (origins.has("index") ? "index" : undefined);
  const count = (origin: string) => entries.filter((entry) => entry.origin === origin).length;
  const sourceCount = entries.filter(
    (entry) => !official(entry) && !["user", "project"].includes(entry.origin),
  ).length;
  return {
    type: input.type,
    stack: manifest.stack ? publicId(manifest.stack) : "custom",
    fragments: [...manifest.fragments]
      .sort((a, b) => Number(official(b)) - Number(official(a)))
      .map(publicId),
    without: input.without.map(publicId),
    preset: manifest.preset,
    targetAgents: manifest.agents,
    handoff: manifest.handoff?.kind ?? "print",
    ...(input.source === undefined ? {} : { source: input.source }),
    ...(resolved === undefined ? {} : { origin: resolved }),
    nonOfficial: { user: count("user"), project: count("project"), source: sourceCount },
    ...(entries.every(official) && manifest.fingerprint
      ? { fingerprint: manifest.fingerprint }
      : {}),
  };
}
const codes: readonly string[] = [
  "ComposeConflict",
  "EntryInvalid",
  "TargetNotEmpty",
  "NotFound",
  "BadInput",
  "PermissionDenied",
  "Interrupted",
  "Defect",
];
function errorCode(code: string): TelemetryErrorEvent["code"] {
  return codes.find((known): known is TelemetryErrorEvent["code"] => known === code) ?? "other";
}
export const errorEvent = (input: ErrorFacts) => ({
  type: "error" as const,
  command: input.command,
  code: errorCode(input.code),
  ...(input.stack && official(input.stack) ? { stack: input.stack.id } : {}),
});
function duration(ms: number): TelemetryVerifyEvent["steps"][number]["duration"] {
  if (ms <= 5000) return "5s";
  if (ms <= 30000) return "30s";
  if (ms <= 120000) return "2m";
  if (ms <= 600000) return "10m";
  return "longer";
}
export function verifyEvent(record: RunRecord, project: Project | undefined, now: number) {
  const known = new Set(project?.steps ?? []);
  return {
    type: "verify" as const,
    scope: record.scope,
    outcome: record.outcome,
    tamperCheck: record.tamperCheck,
    steps: record.steps.map((step) => ({
      name: known.has(step.name) ? step.name : "custom",
      phase: step.phase,
      ...(step.layer === undefined ? {} : { layer: step.layer }),
      status: step.status,
      ...(step.failureKind === undefined ? {} : { failureKind: step.failureKind }),
      duration: duration(step.durationMs),
    })),
    stepsChanged: project
      ? record.steps.filter((step) => !known.has(step.name)).length
      : record.steps.length,
    secondsSinceScaffold: project
      ? Math.max(0, (now - Date.parse(project.scaffoldedAt)) / 1000)
      : record.secondsSinceCreated,
    ...(project ? { projectId: project.telemetryProjectId } : {}),
    ...(project?.firstTestPassAt
      ? {
          secondsToFirstTestPass: Math.max(
            0,
            (Date.parse(project.firstTestPassAt) - Date.parse(project.scaffoldedAt)) / 1000,
          ),
        }
      : {}),
  };
}

/** Each v1 field's downstream reader; the README carries the same table. */
export const TELEMETRY_FIELD_CONSUMERS = {
  schemaVersion: "Ingest schema selection (4.1b)",
  eventId: "Ingest idempotency (4.1b)",
  type: "Event routing (4.1b)",
  installId: "Distinct installs and per-install caps (4.1b, 4.2a)",
  projectId: "Distinct projects (4.2a)",
  cliVersion: "Released-version check and release counts (4.1b, 4.1d)",
  os: "Platform failure counts (4.1d)",
  nodeMajor: "Node line failure counts (4.1d)",
  agent: "Per-agent green rate (4.2a)",
  sentAt: "Event retention windows (4.1b, 4.2a)",
  stack: "Stack projects and green rate (4.2a)",
  fragments: "Fragment attach rate (4.2a)",
  without: "Without rate (4.2a)",
  preset: "Per-preset green rate (4.2a)",
  targetAgents: "Adapter target share (4.1d)",
  handoff: "Entry-point share (4.2a)",
  source: "Entry-point share (4.2a)",
  origin: "Index reach (4.1d)",
  nonOfficial: "Non-official use counts (4.1d)",
  fingerprint: "Per-composition green rate (4.2a)",
  kind: "Show pick rate (4.2a)",
  id: "Show pick rate (4.2a)",
  command: "Failed scaffold share (4.2a)",
  code: "Failure spikes per release (4.1d)",
  scope: "Verify scope (4.2a)",
  outcome: "Green rate (4.2a)",
  tamperCheck: "Verify trust coverage (4.2a)",
  steps: "Step failures and environment blockage (4.2a)",
  stepsChanged: "Changed-step share (4.2a)",
  secondsSinceScaffold: "Time to green (4.2a)",
  secondsToFirstTestPass: "Time to first test (4.2a)",
} as const;
