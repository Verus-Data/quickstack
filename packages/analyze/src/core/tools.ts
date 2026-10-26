import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { delimiter, resolve, sep } from "node:path";
import { isExecutable } from "../runtime";
import { countResults, type SarifLog, type SarifRun, validateSarif } from "../schemas/sarif";
import { rewriteRunUris } from "./uri";

export const DEFAULT_TOOLS_JSON_PATH = resolve(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "tools.json",
);

export type ToolEntry = {
  readonly id: string;
  readonly languages: readonly string[];
  readonly binary: string;
  readonly versionArgv: readonly string[];
  readonly sarifArgv: readonly string[];
  readonly timeoutMs: number;
  readonly verified: boolean;
  readonly note?: string;
};

export type ToolStatus = "ran" | "absent" | "failed" | "timeout" | "skipped";

export type ToolLedgerEntry = {
  readonly id: string;
  readonly status: ToolStatus;
  readonly version?: string;
  readonly durationMs: number;
  readonly resultCount: number;
  readonly reason?: string;
  readonly truncated?: boolean;
  readonly exitCode?: number;
};

export type ToolRunResult = {
  readonly ledger: readonly ToolLedgerEntry[];
  readonly runs: readonly SarifRun[];
};

const STDOUT_CAP_BYTES = 32 * 1024 * 1024;

export function loadTools(path: string): ToolEntry[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const out: ToolEntry[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string") continue;
    out.push({
      id: e.id,
      languages: Array.isArray(e.languages)
        ? e.languages.filter((x): x is string => typeof x === "string")
        : [],
      binary: typeof e.binary === "string" ? e.binary : e.id,
      versionArgv: Array.isArray(e.versionArgv)
        ? e.versionArgv.filter((x): x is string => typeof x === "string")
        : [],
      sarifArgv: Array.isArray(e.sarifArgv)
        ? e.sarifArgv.filter((x): x is string => typeof x === "string")
        : [],
      timeoutMs: typeof e.timeoutMs === "number" ? e.timeoutMs : 60000,
      verified: e.verified === true,
      note: typeof e.note === "string" ? e.note : undefined,
    });
  }
  return out;
}

export function resolveBinary(binary: string): string | undefined {
  if (binary.includes(sep)) {
    try {
      accessSync(binary, constants.X_OK);
      return binary;
    } catch {
      return undefined;
    }
  }
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (dir === "") continue;
    const candidate = `${dir}${sep}${binary}`;
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
}

function substituteArgv(argv: readonly string[], targetAbs: string): string[] {
  return argv.map((a) => a.replace("{target}", targetAbs));
}

type SpawnOutcome =
  | {
      readonly ok: true;
      readonly stdout: string;
      readonly exitCode: number;
      readonly truncated: boolean;
    }
  | { readonly ok: false; readonly reason: "timeout" | "spawn-error"; readonly message: string };

function spawnCapturing(
  binary: string,
  argv: readonly string[],
  cwd: string,
  timeoutMs: number,
): Promise<SpawnOutcome> {
  return new Promise((resolvePromise) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binary, argv, {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
      });
    } catch (error) {
      resolvePromise({
        ok: false,
        reason: "spawn-error",
        message: error instanceof Error ? error.message : "spawn failed",
      });
      return;
    }
    if (child.pid === undefined) {
      resolvePromise({ ok: false, reason: "spawn-error", message: "no pid" });
      return;
    }
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let truncated = false;
    let settled = false;
    let timedOut = false;
    let exitCode: number | null = null;

    const stdout = child.stdout;
    if (stdout) {
      stdout.on("data", (chunk: Buffer) => {
        if (truncated) return;
        if (totalBytes + chunk.length > STDOUT_CAP_BYTES) {
          const remaining = STDOUT_CAP_BYTES - totalBytes;
          if (remaining > 0) {
            chunks.push(chunk.subarray(0, remaining));
            totalBytes = STDOUT_CAP_BYTES;
          }
          truncated = true;
          stdout.destroy();
          try {
            if (child.pid) process.kill(-child.pid, "SIGKILL");
          } catch {
            // process group may already be gone
          }
          return;
        }
        chunks.push(chunk);
        totalBytes += chunk.length;
      });
    }
    child.on("exit", (code, signal) => {
      exitCode = code;
      if (signal !== null && code === null) exitCode = null;
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ ok: false, reason: "spawn-error", message: err.message });
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut) {
        resolvePromise({ ok: false, reason: "timeout", message: `exceeded ${timeoutMs}ms` });
        return;
      }
      resolvePromise({
        ok: true,
        stdout: Buffer.concat(chunks).toString("utf8"),
        exitCode: exitCode ?? -1,
        truncated,
      });
    });

    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        // group may be gone
      }
      // if close does not fire within a short grace window, settle as timeout now
      setTimeout(() => {
        if (settled) return;
        settled = true;
        resolvePromise({ ok: false, reason: "timeout", message: `exceeded ${timeoutMs}ms` });
      }, 1000);
    }, timeoutMs);
  });
}

async function probeVersion(
  binary: string,
  argv: readonly string[],
  cwd: string,
): Promise<string | undefined> {
  const result = await spawnCapturing(binary, argv, cwd, 10000);
  if (result.ok) {
    return result.stdout.trim().split("\n")[0]?.slice(0, 120);
  }
  return undefined;
}

export async function runTools(
  targetAbs: string,
  toolIds: readonly string[],
  toolsJsonPath: string,
): Promise<ToolRunResult> {
  const all = loadTools(toolsJsonPath);
  const selecting = toolIds.length > 0;
  const selected = selecting ? all.filter((t) => toolIds.includes(t.id)) : all;
  const ledger: ToolLedgerEntry[] = [];
  const runs: SarifRun[] = [];

  if (selecting) {
    for (const tool of all) {
      if (toolIds.includes(tool.id)) continue;
      ledger.push({
        id: tool.id,
        status: "skipped",
        durationMs: 0,
        resultCount: 0,
        reason: "not-selected",
      });
    }
  }

  for (const tool of selected) {
    const start = Date.now();
    const resolved = resolveBinary(tool.binary);
    if (resolved === undefined) {
      ledger.push({
        id: tool.id,
        status: "absent",
        durationMs: Date.now() - start,
        resultCount: 0,
      });
      continue;
    }
    try {
      accessSync(resolved, constants.X_OK);
    } catch {
      ledger.push({
        id: tool.id,
        status: "failed",
        durationMs: Date.now() - start,
        resultCount: 0,
        reason: "not-executable",
      });
      continue;
    }
    const version =
      tool.versionArgv.length > 0
        ? await probeVersion(resolved, tool.versionArgv, targetAbs)
        : undefined;
    const argv = substituteArgv(tool.sarifArgv, targetAbs);
    const result = await spawnCapturing(resolved, argv, targetAbs, tool.timeoutMs);
    const durationMs = Date.now() - start;
    if (!result.ok) {
      ledger.push({
        id: tool.id,
        status: result.reason === "timeout" ? "timeout" : "failed",
        version,
        durationMs,
        resultCount: 0,
        reason: result.reason === "timeout" ? "timeout" : result.message,
      });
      continue;
    }
    const exitCode = result.exitCode;
    if (exitCode !== 0 && result.stdout.trim() === "") {
      ledger.push({
        id: tool.id,
        status: "failed",
        version,
        durationMs,
        resultCount: 0,
        reason: `exit-code:${exitCode}`,
        exitCode,
      });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      ledger.push({
        id: tool.id,
        status: "failed",
        version,
        durationMs,
        resultCount: 0,
        reason: `invalid-sarif: ${error instanceof Error ? error.message : "invalid JSON"}`,
        exitCode,
      });
      continue;
    }
    const validation = validateSarif(parsed);
    if (!validation.ok) {
      ledger.push({
        id: tool.id,
        status: "failed",
        version,
        durationMs,
        resultCount: 0,
        reason: `invalid-sarif: ${validation.reason}`,
        exitCode,
      });
      continue;
    }
    const log: SarifLog = validation.log;
    for (const run of log.runs) {
      runs.push(rewriteRunUris(run, targetAbs));
    }
    ledger.push({
      id: tool.id,
      status: "ran",
      version,
      durationMs,
      resultCount: countResults(log),
      truncated: result.truncated || undefined,
      exitCode,
    });
  }

  return { ledger, runs };
}
