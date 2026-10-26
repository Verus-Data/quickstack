// Enforce the CLI's platform and output boundaries before writing TypeScript under packages/cli/src/.
// Other workspace packages (the API, the MCP server) get their own rules, not these.
import { dirname, isAbsolute, resolve } from "node:path";
import { deny, findUp, projectRoot, readPayload, text, writtenText } from "./_lib";

/** The written text as lines, without `//` comments and JSDoc/block-comment lines. */
function codeLines(written: string): string[] {
  return written
    .split("\n")
    .filter((line) => !/^[ \t]*(\/\*|\*)/.test(line))
    .map((line) => line.replace(/(^|[ \t])\/\/.*$/, ""));
}

/** The path under packages/cli/src/ ("core/health.ts"); else undefined. */
function srcPath(filePath: string): string | undefined {
  if (!/\.tsx?$/.test(filePath)) return undefined;
  const abs = isAbsolute(filePath) ? filePath : resolve(projectRoot(), filePath);
  // The nearest package root above the file: packages/cli in the repo or in a worktree under
  // .claude/worktrees/. .claude/ counts too, so the guard holds in a fresh checkout before
  // packages/cli/package.json exists.
  const pkg = findUp(dirname(abs), "package.json", ".claude");
  if (!pkg) return undefined;
  const rel = abs.slice(pkg.length + 1);
  if (pkg.endsWith("/packages/cli")) return rel.startsWith("src/") ? rel.slice(4) : undefined;
  return rel.startsWith("packages/cli/src/") ? rel.slice("packages/cli/src/".length) : undefined;
}

function reasonsFor(file: string, lines: string[]): string[] {
  const has = (pattern: RegExp) => lines.some((line) => pattern.test(line));
  const platformSide = file === "bin.ts" || file.startsWith("platform/");
  const reasons: string[] = [];
  if (
    !platformSide &&
    has(/(?:from|import)\s*\(?\s*["'](?:bun(?:[:/][^"']*)?|@effect\/platform-bun[^"']*)["']/)
  )
    reasons.push("imports Bun outside an explicit platform boundary; use Effect platform services");
  if (!platformSide && has(/(^|[^\w$.])Bun\.\w/))
    reasons.push("uses the Bun global outside an explicit platform boundary");
  if (
    !platformSide &&
    has(
      /(?:from|import)\s*\(?\s*["'](?:node:child_process|child_process|node:process|@effect\/platform-node[^"']*)["']/,
    )
  )
    reasons.push("imports Node process APIs outside bin.ts and src/platform/; use Processes");
  if (
    !platformSide &&
    has(
      /(^|[^\w$.])process\.(?:kill|on|once|off|addListener|removeListener|prependListener|prependOnceListener|exit)\s*\(/,
    )
  )
    reasons.push("calls a Node process API outside bin.ts and src/platform/; use Processes");
  if (!["config.ts", "bin.ts"].includes(file) && has(/(^|[^\w$.])process\.env\b/))
    reasons.push("reads process.env outside config.ts");
  if (has(/(^|[^\w$.])console\.\w+\s*\(/))
    reasons.push("calls console.*; results belong to Output and diagnostics to the logger");
  if (file !== "bin.ts" && has(/(^|[^\w$.])process\.stdout\b/))
    reasons.push("uses process.stdout outside bin.ts");
  if (!["bin.ts", "config.ts", "logging.ts"].includes(file) && has(/(^|[^\w$.])process\.stderr\b/))
    reasons.push("uses process.stderr outside the output/logging boundary");
  if (has(/(?:from|import)\s*\(?\s*["'](?:zod(?:\/[^"']*)?|@effect\/schema(?:\/[^"']*)?)["']/))
    reasons.push("imports a competing schema library; use Schema from effect");
  return reasons;
}
const payload = readPayload();
const filePath = text(payload?.tool_input?.file_path);
const file = filePath ? srcPath(filePath) : undefined;
if (file !== undefined) {
  const written = writtenText(payload?.tool_input);
  const reasons = written ? reasonsFor(file, codeLines(written)) : [];
  if (reasons.length)
    deny(`BLOCKED: packages/cli/src/${file} ${reasons.join("; ")}. See .claude/rules/cli/cli.md.`);
}
