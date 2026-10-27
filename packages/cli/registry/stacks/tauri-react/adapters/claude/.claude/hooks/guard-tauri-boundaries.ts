// PreToolUse (Edit|Write): deny imports that cross the frontend's layer boundaries. Biome's
// noRestrictedImports overrides enforce the same rules at lint time; this catches them on write.
//
//   src/core/   framework-free TypeScript: no React packages, no ~/ (the app layer), no
//               zustand React entries (use zustand/vanilla). Only src/core/transport/** and
//               src/core/app-transport.ts may import @tauri-apps/* or the generated
//               `commands`/`events`.
//   src/app/, src/main.tsx, tests/ (except tests/hooks/, which tests these guards)
//               reach Rust only through @core/transport, so the mock can stand in: no
//               @tauri-apps/*, no generated `commands`/`events` (types are fine), and no
//               direct import of the native adapter.
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { deny, projectRoot, readPayload, text, writtenText } from "./_lib";

const WS = "[ \\t\\n\\v\\f\\r]*";
const SPEC = (pattern: string) => new RegExp(`(?:from|import)${WS}\\(?${WS}["'](?:${pattern})["']`);

const REACT_IN_CORE = SPEC(
  [
    "react(?:-dom|-router)?(?:/[^\"']*)?",
    "@tanstack/react-[^\"']+",
    "lucide-react",
    "@testing-library/react",
    "zustand(?:/react[^\"']*|/traditional)?",
  ].join("|"),
);
const APP_IN_CORE = SPEC("~/[^\"']*|(?:\\.\\./)+app(?:/[^\"']*)?");
const TAURI = SPEC("@tauri-apps/[^\"']+");
const NATIVE_ADAPTER = SPEC("@core/transport/[^\"']*|[^\"']*/core/transport/[^\"']*");
// A value import or re-export of the generated bindings that can reach `commands`/`events`:
// named ({ commands }), namespace (* as b), or default. `import type` is always fine.
const GENERATED_CALLS = new RegExp(
  `(?:import|export)${WS}(?:\\*${WS}as${WS}\\w+|\\{[^}]*\\b(?:commands|events)\\b[^}]*\\}|\\w+)${WS}from${WS}["'][^"']*generated/bindings["']`,
);

/** The written text without comment lines and trailing // comments. */
function code(written: string): string {
  return written
    .split("\n")
    .filter((line) => !/^[ \t]*(\/\*|\*)/.test(line))
    .map((line) => line.replace(/(^|[ \t])\/\/.*$/, ""))
    .join("\n");
}

function physical(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return dir;
  }
}

/** The path relative to the project root, or to a worktree under .claude/worktrees/. */
function relPath(filePath: string): string | undefined {
  const given = projectRoot().replace(/\/+$/, "");
  const abs = isAbsolute(filePath) ? filePath : resolve(given, filePath);
  const root = [given, physical(given || "/").replace(/\/+$/, "")].find((d) =>
    abs.startsWith(`${d}/`),
  );
  if (root === undefined) return undefined;
  return abs.slice(root.length + 1).replace(/^\.claude\/worktrees\/[^/]+\//, "");
}

function violation(path: string, src: string): string | undefined {
  if (!/\.tsx?$/.test(path)) return undefined;
  if (path.startsWith("src/core/")) {
    if (path.startsWith("src/core/generated/")) return undefined;
    if (REACT_IN_CORE.test(src)) {
      return "src/core/ is framework-free: no React packages or zustand React entries (use zustand/vanilla). Put React code under src/app/.";
    }
    if (APP_IN_CORE.test(src)) {
      return "src/core/ must not import the app layer (~/ or src/app/). Move the shared code into src/core/.";
    }
    const adapter = path.startsWith("src/core/transport/") || path === "src/core/app-transport.ts";
    if (!adapter && (TAURI.test(src) || GENERATED_CALLS.test(src))) {
      return "only src/core/transport/** and src/core/app-transport.ts touch @tauri-apps/* or the generated commands/events. Add the call to the Transport contract and both adapters.";
    }
    return undefined;
  }
  const app = path.startsWith("src/app/") || path === "src/main.tsx";
  const tests = path.startsWith("tests/") && !path.startsWith("tests/hooks/");
  if (!app && !tests) return undefined;
  if (TAURI.test(src)) {
    return "the app layer reaches Rust only through @core/transport, so the mock transport can stand in. Add the call to the Transport contract and both adapters instead of importing @tauri-apps/*.";
  }
  if (GENERATED_CALLS.test(src)) {
    return "import the generated types with `import type`, not `commands` or `events`: call Rust through @core/transport so the mock transport can stand in.";
  }
  if (NATIVE_ADAPTER.test(src)) {
    return "don't import the native adapter directly; use the transport from its provider so the mock can stand in.";
  }
  return undefined;
}

const payload = readPayload();
const given = text(payload?.tool_input?.file_path);
const path = given ? relPath(given) : undefined;
if (path) {
  const written = writtenText(payload?.tool_input);
  const reason = written ? violation(path, code(written)) : undefined;
  if (reason) deny(`BLOCKED: ${path}: ${reason}`);
}
