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

export const logLevel: LogLevel.LogLevel = parseLogLevel(process.env.MCP_LOG_LEVEL);
