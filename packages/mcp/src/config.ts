import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LogLevel } from "effect";

const VALID_LEVELS = new Set<string>([
  "All",
  "Fatal",
  "Error",
  "Warn",
  "Info",
  "Debug",
  "Trace",
  "None",
]);

function parseLogLevel(raw: string | undefined): LogLevel.LogLevel {
  if (raw === undefined) return "Info";
  const capitalized = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  if (VALID_LEVELS.has(capitalized)) {
    return capitalized as LogLevel.LogLevel;
  }
  return "Info";
}

function resolveCliPath(): string {
  const envPath = process.env.STACKS_MCP_CLI;
  if (envPath) return envPath;
  const here = fileURLToPath(new URL(".", import.meta.url));
  return resolve(here, "../../cli/src/bin.ts");
}

export const logLevel: LogLevel.LogLevel = parseLogLevel(process.env.MCP_LOG_LEVEL);

export const cliPath: string = resolveCliPath();
