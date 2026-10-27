import { Duration, Effect } from "effect";
import { SpawnFailed } from "../../errors";
import type { SarifRun } from "../../schemas/analyze";
import { type SarifLog, validateSarif } from "../../schemas/analyze";
import type { Captured } from "../../services/processes";
import { Processes } from "../../services/processes";
import { rewriteRunUris } from "./record";

export type ToolEntry = {
  readonly id: string;
  readonly languages: readonly string[];
  /** `argv[0]` — the program to spawn. */
  readonly binary: string;
  /** Everything after `argv[0]` — arguments only, never the program itself. */
  readonly sarifArgv: readonly string[];
  readonly timeoutMs: number;
  readonly verified: boolean;
  readonly note?: string;
};

export type ToolStatus = "ran" | "absent" | "failed" | "timeout" | "skipped";

export type ToolNotRunStatus = "absent" | "skipped" | "failed" | "timeout";

export type ToolNotRunEntry = {
  readonly id: string;
  readonly status: ToolNotRunStatus;
  readonly reason?: string;
};

export type ToolLedgerEntry = {
  readonly id: string;
  readonly status: ToolStatus;
  readonly reason?: string;
};

export type ToolRunResult = {
  readonly ledger: readonly ToolLedgerEntry[];
  readonly runs: readonly SarifRun[];
  readonly adapterOrder: readonly string[];
};

// The adapter table — data, not code loaded from disk. A const cannot have the
// path-resolution defect the JSON file version had (resolved relative to src/,
// where the file did not live).
export const TOOLS: readonly ToolEntry[] = [
  {
    id: "semgrep",
    languages: [],
    binary: "semgrep",
    sarifArgv: ["scan", "--sarif", "--config", "auto", "--metrics", "off", "{target}"],
    timeoutMs: 120000,
    verified: false,
    note: "Confirm --sarif writes SARIF 2.1.0 to stdout against the installed semgrep binary; the {target} placeholder is substituted with the absolute target path. The first run needs network to fetch the auto ruleset; results are cached afterwards, so subsequent runs are offline. Telemetry is disabled with --metrics off. The digest and metrics are unaffected either way: semgrep writes its SARIF to stdout and does not create a cache or log directory inside the target.",
  },
  {
    id: "ruff",
    languages: ["python"],
    binary: "ruff",
    sarifArgv: ["check", "--no-cache", "--output-format", "sarif", "{target}"],
    timeoutMs: 60000,
    verified: true,
    note: "Confirmed against ruff 0.15.10: --output-format sarif emits SARIF 2.1.0 on stdout. --no-cache prevents ruff from creating .ruff_cache/ inside the target; verified empirically that no cache directory appears.",
  },
  {
    id: "eslint",
    languages: ["javascript", "typescript"],
    binary: "eslint",
    sarifArgv: ["-f", "@microsoft/eslint-formatter-sarif", "{target}"],
    timeoutMs: 120000,
    verified: false,
    note: "Requires @microsoft/eslint-formatter-sarif to be installed in the target; confirm the formatter emits SARIF 2.1.0. Verify the formatter package name and flag against the installed ESLint. Read-only: ESLint only writes .eslintcache when --cache is passed, which this adapter never does.",
  },
  {
    id: "golangci-lint",
    languages: ["go"],
    binary: "golangci-lint",
    sarifArgv: ["run", "--out-format", "sarif", "{target}"],
    timeoutMs: 180000,
    verified: false,
    note: "Confirm --out-format sarif writes SARIF 2.1.0 to stdout with the installed golangci-lint; the {target} path may need to be a Go package path. Read-only audit: golangci-lint may write to a cache under HOME; it does not create a cache directory inside the target. Confirm against the installed binary.",
  },
  {
    id: "trivy",
    languages: [],
    binary: "trivy",
    sarifArgv: ["fs", "--format", "sarif", "--scanners", "vuln", "{target}"],
    timeoutMs: 120000,
    verified: false,
    note: "Confirm trivy fs --format sarif writes SARIF 2.1.0 to stdout against the installed trivy; verify --scanners spelling. Read-only audit: trivy stores its DB under HOME/.cache, not inside the target; confirm it does not write into the target.",
  },
  {
    id: "gitleaks",
    languages: [],
    binary: "gitleaks",
    sarifArgv: [
      "dir",
      "{target}",
      "--report-path",
      "-",
      "--report-format",
      "sarif",
      "--no-banner",
      "--redact",
    ],
    timeoutMs: 120000,
    verified: false,
    note: 'Flags read from gitleaks cmd/root.go upstream source, not confirmed on a machine: -r/--report-path is documented as "report file (use \\"-\\" for stdout)" and -f/--report-format accepts sarif. --no-banner keeps the banner out of stdout so the SARIF parses; --redact (default 100%) keeps secrets out of the stored record — a finding needs the rule, path and line, not the secret. The subcommand is dir, not a bare target path. Read-only: with --report-path - gitleaks writes to stdout; if a file path were used it must be outside the target.',
  },
] as const;

function substituteArgv(argv: readonly string[], targetAbs: string): string[] {
  return argv.map((a) => a.replace("{target}", targetAbs));
}

export function runTools(
  targetAbs: string,
  toolIds: readonly string[],
  env: Record<string, string>,
): Effect.Effect<ToolRunResult, never, Processes> {
  return Effect.gen(function* () {
    const processes = yield* Processes;
    return yield* runToolsWith(TOOLS, targetAbs, toolIds, env, processes);
  });
}

export function runToolsWith(
  all: readonly ToolEntry[],
  targetAbs: string,
  toolIds: readonly string[],
  env: Record<string, string>,
  processes: Processes["Service"],
): Effect.Effect<ToolRunResult> {
  return Effect.gen(function* () {
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
          reason: "not-selected",
        });
      }
    }

    for (const tool of selected) {
      // `binary` is `argv[0]`; `sarifArgv` is everything after it.
      const args = substituteArgv(tool.sarifArgv, targetAbs);
      const outcome = yield* processes
        .exec({
          argv: [tool.binary, ...args],
          cwd: targetAbs,
          env,
          timeout: Duration.millis(tool.timeoutMs),
        })
        .pipe(
          Effect.map((result: Captured) => ({ kind: "captured" as const, result })),
          Effect.catchIf(
            (e): e is SpawnFailed => e instanceof SpawnFailed && e.kind === "command",
            (e: SpawnFailed) =>
              Effect.succeed(
                e.errno === "ENOENT"
                  ? { kind: "absent" as const }
                  : { kind: "spawn-failed" as const, errno: e.errno },
              ),
          ),
        );

      if (outcome.kind === "absent") {
        ledger.push({ id: tool.id, status: "absent" });
        continue;
      }

      if (outcome.kind === "spawn-failed") {
        ledger.push({ id: tool.id, status: "failed", reason: `spawn:${outcome.errno}` });
        continue;
      }

      const result = outcome.result;

      if (result.timedOut) {
        ledger.push({ id: tool.id, status: "timeout", reason: "timeout" });
        continue;
      }

      const exitCode = result.exitCode;
      if (exitCode !== 0 && result.stdout.trim() === "") {
        ledger.push({
          id: tool.id,
          status: "failed",
          reason: `exit-code:${exitCode}`,
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
          reason: `invalid-sarif: ${error instanceof Error ? error.message : "invalid JSON"}`,
        });
        continue;
      }

      const validation = validateSarif(parsed);
      if (!validation.ok) {
        ledger.push({
          id: tool.id,
          status: "failed",
          reason: `invalid-sarif: ${validation.reason}`,
        });
        continue;
      }

      const log: SarifLog = validation.log;
      for (const run of log.runs) {
        runs.push(rewriteRunUris(run, targetAbs));
      }
      ledger.push({ id: tool.id, status: "ran" });
    }

    return { ledger, runs, adapterOrder: all.map((t) => t.id) };
  });
}
