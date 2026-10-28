// Enforce the API's platform, environment, output and schema boundaries before writing TypeScript.
//
//   Node, Bun and @effect/platform-node   only in src/platform/, so the core runs on any host
//   process.env                           only in src/platform/; config.ts reads through Effect
//                                         Config, so the runtime swaps without touching it
//   console.*                             nowhere in src/; logs go through Effect's logger
//   zod, @effect/schema                   never; Schema comes from effect
import { dirname, isAbsolute, resolve } from "node:path";
import { deny, findUp, projectRoot, readPayload, text, writtenText } from "./_lib";

/** The written text as lines, without `//` comments and JSDoc/block-comment lines. */
function codeLines(written: string): string[] {
  return written
    .split("\n")
    .filter((line) => !/^[ \t]*(\/\*|\*)/.test(line))
    .map((line) => line.replace(/(^|[ \t])\/\/.*$/, ""));
}

/** The path under src/ ("handlers/orders.ts"), relative to the nearest package root; else undefined. */
function srcPath(filePath: string): string | undefined {
  if (!/\.tsx?$/.test(filePath)) return undefined;
  const abs = isAbsolute(filePath) ? filePath : resolve(projectRoot(), filePath);
  // The nearest package root above the file: the repo, or a worktree under .claude/worktrees/.
  // .claude/ counts too, so the guard holds in a fresh checkout before package.json exists.
  const pkg = findUp(dirname(abs), "package.json", ".claude");
  if (!pkg) return undefined;
  const rel = abs.slice(pkg.length + 1);
  return rel.startsWith("src/") ? rel.slice(4) : undefined;
}

const PLATFORM_IMPORT =
  /(?:from|import)\s*\(?\s*["'](?:node:[^"']+|bun(?:[:/][^"']*)?|@effect\/platform-(?:node|bun)[^"']*)["']/;

function reasonsFor(file: string, lines: string[]): string[] {
  const has = (pattern: RegExp) => lines.some((line) => pattern.test(line));
  const platformSide = file.startsWith("platform/");
  const reasons: string[] = [];
  if (!platformSide && has(PLATFORM_IMPORT))
    reasons.push(
      "imports a runtime (node:*, bun or @effect/platform-*) outside src/platform/; use Effect's FileSystem, Path and HttpClient services",
    );
  if (
    !platformSide &&
    (has(/(^|[^\w$.])(?:globalThis\.)?(?:Bun|process)\.(?!env\b)\w/) ||
      has(/=\s*(?:globalThis\.)?process\s*;?\s*$/))
  )
    reasons.push("uses the Bun or process global outside src/platform/");
  if (!platformSide && has(/(^|[^\w$.])process\.env\b/))
    reasons.push(
      "reads process.env outside src/platform/; config.ts reads through Effect Config, and platform/node.ts provides ConfigProvider.fromEnv()",
    );
  if (has(/(^|[^\w$.])console\.\w+\s*\(/))
    reasons.push("calls console.*; use Effect.log* with annotations");
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
    deny(
      `BLOCKED: src/${file} ${reasons.join("; ")}. See docs/guidance/typescript-api/effect-api.md.`,
    );
}
