#!/usr/bin/env bun
import { dirname, isAbsolute, resolve } from "node:path";
// `bun scripts/analyze.ts <path>`: run the analysis core from source and print
// one SARIF 2.1.0 log. A dev script, not a CLI subcommand — the command surface
// is phase 1's. Use --out <file> to write the log to a file, --summary-out <file>
// to write the AnalysisSummary JSON beside it, --tool <id> to select one adapter,
// --exclude <glob> to exclude paths, --sarif <file> to adopt an external log,
// --label <string> to label attribution when no manifest is present.
import { BunServices } from "@effect/platform-bun";
import { Effect, Exit, Layer } from "effect";
import { analyze } from "../src/core/analyze";
import { type AppError, exitCode as exitCodeOf } from "../src/errors";
import { AppLayer } from "../src/runtime";
import { Host } from "../src/services/host";
import { Output, type Writer } from "../src/services/output";
import { Foreground } from "../src/services/processes";

export type Parsed = {
  readonly target: string;
  readonly out?: string;
  readonly label?: string;
  readonly sarif: readonly string[];
  readonly tool: readonly string[];
  readonly exclude: readonly string[];
  readonly summaryOut?: string;
  readonly help: boolean;
  readonly version: boolean;
};

export type ParseResult =
  | { readonly ok: true; readonly parsed: Parsed }
  | { readonly ok: false; readonly reason: string };

const VALUE_FLAGS = new Set([
  "--out",
  "--label",
  "--sarif",
  "--tool",
  "--exclude",
  "--summary-out",
]);

const HELP = `Usage: bun scripts/analyze.ts <path> [options]

Run static analysis over a directory and write one SARIF 2.1.0 log.

Arguments:
  <path>                    Directory to analyze (defaults to the current directory).

Options:
  --out <file>              Write the record to <file> instead of stdout.
  --summary-out <file>      Write the AnalysisSummary JSON to <file>.
  --label <string>          Label attribution when no manifest is present.
  --sarif <file>            Adopt a SARIF log produced elsewhere (repeatable).
  --tool <id>               Run only the named tool adapter id (repeatable).
  --exclude <glob>          Exclude paths matching the glob (repeatable).
  --help                    Show this help and exit.
  --version                 Show the version and exit.

Exit codes:
  0  A record was written.
  2  Usage or input error.
  1  Unexpected defect.
`;

export function helpText(): string {
  return HELP;
}

export function parse(args: readonly string[]): ParseResult {
  const sarif: string[] = [];
  const tool: string[] = [];
  const exclude: string[] = [];
  let out: string | undefined;
  let label: string | undefined;
  let summaryOut: string | undefined;
  let help = false;
  let version = false;
  let target: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === undefined) {
      i += 1;
      continue;
    }
    if (arg === "--help") {
      help = true;
      i += 1;
      continue;
    }
    if (arg === "--version") {
      version = true;
      i += 1;
      continue;
    }
    if (VALUE_FLAGS.has(arg)) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { ok: false, reason: `Flag ${arg} requires a value.` };
      }
      switch (arg) {
        case "--out":
          out = next;
          break;
        case "--label":
          label = next;
          break;
        case "--sarif":
          sarif.push(next);
          break;
        case "--tool":
          tool.push(next);
          break;
        case "--exclude":
          exclude.push(next);
          break;
        case "--summary-out":
          summaryOut = next;
          break;
      }
      i += 2;
      continue;
    }
    if (arg.startsWith("--")) {
      return { ok: false, reason: `Unknown flag: ${arg}` };
    }
    if (target === undefined) {
      target = arg;
    } else {
      return { ok: false, reason: `Unexpected positional argument: ${arg}` };
    }
    i += 1;
  }

  if (help || version) {
    return {
      ok: true,
      parsed: {
        target: target ?? ".",
        out,
        label,
        sarif,
        tool,
        exclude,
        summaryOut,
        help,
        version,
      },
    };
  }

  if (target === undefined) {
    return { ok: false, reason: "A target path is required." };
  }

  return {
    ok: true,
    parsed: { target, out, label, sarif, tool, exclude, summaryOut, help, version },
  };
}

const DRIVER_VERSION = "0.1.0";

const writer =
  (stream: NodeJS.WriteStream): Writer =>
  (text) =>
    new Promise((resolvePromise, reject) => {
      stream.write(text, (error) => (error ? reject(error) : resolvePromise()));
    });
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});

const holder = Foreground.make();
const output = Output.layer(false, writer(process.stdout), writer(process.stderr));
const platform = Layer.mergeAll(
  BunServices.layer,
  Foreground.layer(holder),
  Host.layer({
    platform: process.platform,
    executable: process.execPath,
    compiled: false,
    cwd: process.cwd(),
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
    registry: "",
    skill: "",
    invocation: "bun scripts/analyze.ts",
  }),
);
const layer = Layer.provideMerge(AppLayer(output), platform);

if (import.meta.main) {
  const result = parse(process.argv.slice(2));
  if (!result.ok) {
    process.stderr.write(`error: ${result.reason}\n`);
    process.exitCode = 2;
  } else {
    const parsed = result.parsed;
    if (parsed.help) {
      process.stdout.write(`${helpText()}\n`);
      process.exitCode = 0;
    } else if (parsed.version) {
      process.stdout.write(`${DRIVER_VERSION}\n`);
      process.exitCode = 0;
    } else {
      const target = isAbsolute(parsed.target)
        ? parsed.target
        : resolve(process.cwd(), parsed.target);
      const exit = await Effect.runPromiseExit(
        analyze({
          target,
          exclude: parsed.exclude,
          tool: parsed.tool,
          sarif: parsed.sarif,
          label: parsed.label,
          outputFile: parsed.out,
        }).pipe(Effect.provide(layer), Effect.scoped),
      );

      if (Exit.isSuccess(exit)) {
        const { summary, log } = exit.value;
        const serialized = `${JSON.stringify(log)}\n`;

        if (parsed.out !== undefined) {
          const outFile = isAbsolute(parsed.out) ? parsed.out : resolve(process.cwd(), parsed.out);
          const dir = dirname(outFile);
          const { mkdirSync, existsSync, writeFileSync, renameSync, unlinkSync } = await import(
            "node:fs"
          );
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          const tmp = `${outFile}.tmp-${process.pid}`;
          writeFileSync(tmp, serialized, "utf8");
          try {
            renameSync(tmp, outFile);
          } catch {
            if (existsSync(tmp)) {
              try {
                unlinkSync(tmp);
              } catch {
                // ignore
              }
            }
            process.stderr.write(`error: Could not write output file: ${outFile}\n`);
            process.exitCode = 2;
          }
        } else {
          process.stdout.write(serialized);
        }

        if (parsed.summaryOut !== undefined && process.exitCode === undefined) {
          const summaryFile = isAbsolute(parsed.summaryOut)
            ? parsed.summaryOut
            : resolve(process.cwd(), parsed.summaryOut);
          const summaryDir = dirname(summaryFile);
          const { mkdirSync, existsSync, writeFileSync, renameSync, unlinkSync } = await import(
            "node:fs"
          );
          if (!existsSync(summaryDir)) mkdirSync(summaryDir, { recursive: true });
          const tmp = `${summaryFile}.tmp-${process.pid}`;
          writeFileSync(tmp, `${JSON.stringify(summary)}\n`, "utf8");
          try {
            renameSync(tmp, summaryFile);
          } catch {
            if (existsSync(tmp)) {
              try {
                unlinkSync(tmp);
              } catch {
                // ignore
              }
            }
            process.stderr.write(`error: Could not write summary file: ${summaryFile}\n`);
            process.exitCode = 2;
          }
        }

        if (process.exitCode === undefined) process.exitCode = 0;
      } else {
        const error = exit.cause as { error?: AppError; _tag?: string };
        const appError = error.error;
        if (appError && typeof appError === "object" && "_tag" in appError) {
          process.exitCode = exitCodeOf(appError as AppError);
          process.stderr.write(`error: ${(appError as AppError).message}\n`);
        } else {
          process.exitCode = 1;
          process.stderr.write("error: An unexpected error occurred.\n");
        }
      }
    }
  }
}
