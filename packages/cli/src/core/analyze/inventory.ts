import { createHash } from "node:crypto";
import { Effect, FileSystem, Option, Path } from "effect";

// The ignore policy lives here, not in the target's .gitignore: the target may
// not be a git repository at all (a freshly built project, a temp directory, an
// unpacked tarball), nested repositories each carry their own ignore rules, and
// the digest has to be identical on any machine. A closed, documented list is
// the only way to keep that contract. Honouring a target's own .gitignore when
// one exists would be a later feature, not a silent fallback.
export const EXCLUDED_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "vendor",
  "target",
  ".ruff_cache",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".eslintcache",
  ".semgrep",
  ".gradle",
  ".next",
  ".turbo",
  ".cache",
]);

export type DigestResult = {
  readonly digest: string;
  readonly files: number;
  readonly bytes: number;
  readonly excluded: readonly string[];
  readonly skippedSymlinks: number;
};

export type DigestOptions = {
  readonly excludeGlobs: readonly string[];
  readonly outputFile?: string;
};

export function matchGlob(pattern: string, posixPath: string): boolean {
  return globToRegex(pattern).test(posixPath);
}

function globToRegex(pattern: string): RegExp {
  let src = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === undefined) break;
    if (ch === "*") {
      const next = pattern[i + 1];
      if (next === "*") {
        src += ".*";
        i += 2;
        if (pattern[i] === "/") i += 1;
        continue;
      }
      src += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      src += "[^/]";
      i += 1;
      continue;
    }
    if ("\\^$.+()|{}[]".includes(ch)) {
      src += `\\${ch}`;
    } else {
      src += ch;
    }
    i += 1;
  }
  return new RegExp(`^${src}$`);
}

function matchesAnyExclude(posixRel: string, globs: readonly string[]): boolean {
  for (const g of globs) {
    if (matchGlob(g, posixRel)) return true;
  }
  return false;
}

type FileEntry = { readonly rel: string; readonly bytes: Uint8Array };

type WalkState = {
  readonly options: DigestOptions;
  readonly acc: FileEntry[];
  skippedSymlinks: number;
};

function walkDigest(
  dir: string,
  root: string,
  state: WalkState,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<void> {
  const { options, acc } = state;
  return Effect.gen(function* () {
    const entriesOption = yield* Effect.option(fs.readDirectory(dir));
    if (Option.isNone(entriesOption)) return;
    const entries = entriesOption.value;
    entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of entries) {
      const full = path.join(dir, name);
      const rel = toPosix(path.relative(root, full), path);
      const info = yield* Effect.option(fs.lstat(full));
      if (Option.isNone(info)) continue;
      const type = info.value.type;
      if (type === "SymbolicLink") {
        if (matchesAnyExclude(rel, options.excludeGlobs)) continue;
        state.skippedSymlinks += 1;
        continue;
      }
      if (type === "Directory") {
        if (EXCLUDED_NAMES.has(name)) continue;
        if (matchesAnyExclude(rel, options.excludeGlobs)) continue;
        yield* walkDigest(full, root, state, fs, path);
        continue;
      }
      if (type === "File") {
        if (EXCLUDED_NAMES.has(name)) continue;
        if (matchesAnyExclude(rel, options.excludeGlobs)) continue;
        if (options.outputFile !== undefined) {
          const outAbs = path.normalize(path.resolve(options.outputFile));
          if (path.normalize(full) === outAbs) continue;
        }
        const bytesOption = yield* Effect.option(fs.readFile(full));
        if (Option.isNone(bytesOption)) continue;
        acc.push({ rel, bytes: bytesOption.value });
      }
    }
  });
}

export function computeDigest(
  targetAbs: string,
  options: DigestOptions,
): Effect.Effect<DigestResult, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files: FileEntry[] = [];
    const state: WalkState = { options, acc: files, skippedSymlinks: 0 };
    yield* walkDigest(targetAbs, targetAbs, state, fs, path);
    files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    const hash = createHash("sha256");
    let bytes = 0;
    for (const f of files) {
      hash.update(f.rel);
      hash.update("\0");
      hash.update(f.bytes);
      bytes += f.bytes.length;
    }
    return {
      digest: `sha256:${hash.digest("hex")}`,
      files: files.length,
      bytes,
      excluded: [...EXCLUDED_NAMES],
      skippedSymlinks: state.skippedSymlinks,
    };
  });
}

export function isExcludedDir(name: string): boolean {
  return EXCLUDED_NAMES.has(name);
}

// --- Inventory / metrics ---

const EXTENSION_LANGUAGE: Readonly<Record<string, string>> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "css",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".md": "markdown",
  ".mdx": "markdown",
};

const MANIFEST_FILES = new Set([
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "mix.exs",
]);

const MARKERS = ["TODO", "FIXME", "HACK", "XXX"] as const;

const NON_SOURCE_LANGUAGES = new Set(["json", "yaml", "toml", "markdown"]);

type CommentStyle = "slash" | "hash" | "html" | "css" | "none";
const LANGUAGE_COMMENT: Readonly<Record<string, CommentStyle>> = {
  typescript: "slash",
  javascript: "slash",
  go: "slash",
  rust: "slash",
  java: "slash",
  kotlin: "slash",
  swift: "slash",
  c: "slash",
  cpp: "slash",
  csharp: "slash",
  php: "slash",
  json: "none",
  python: "hash",
  ruby: "hash",
  shell: "hash",
  yaml: "hash",
  toml: "hash",
  html: "html",
  css: "css",
  markdown: "none",
};

export type Metrics = {
  readonly files: number;
  readonly bytes: number;
  readonly lines: number;
  readonly codeLines: number;
  readonly blankLines: number;
  readonly commentLines: number;
  readonly byLanguage: Readonly<Record<string, number>>;
  readonly testRatio: number;
  readonly testFiles: number;
  readonly sourceFiles: number;
  readonly markers: Readonly<Record<string, number>>;
  readonly largestFiles: ReadonlyArray<{
    readonly path: string;
    readonly lines: number;
    readonly bytes: number;
    readonly language?: string;
  }>;
  readonly manifests: readonly string[];
  readonly filesByLanguage: Readonly<Record<string, number>>;
};

export type Layout = {
  readonly topLevel: readonly string[];
  readonly maxDepth: number;
};

function languageForName(name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [ext, lang] of Object.entries(EXTENSION_LANGUAGE)) {
    if (lower.endsWith(ext)) return lang;
  }
  return undefined;
}

function isTestFile(posixRel: string, language: string | undefined): boolean {
  const parts = posixRel.split("/");
  const name = (parts[parts.length - 1] ?? "").toLowerCase();
  const inTestDir = parts.some((p) => p === "tests" || p === "__tests__" || p === "test");
  switch (language) {
    case "typescript":
    case "javascript":
      return (
        name.includes(".test.") || name.includes(".spec.") || name.startsWith("test-") || inTestDir
      );
    case "python":
      return name.startsWith("test_") || name.endsWith("_test.py") || inTestDir;
    case "go":
      return name.endsWith("_test.go");
    case "rust":
      return name.endsWith("_test.rs") || inTestDir;
    default:
      return inTestDir;
  }
}

function countLines(
  content: string,
  style: CommentStyle,
): {
  lines: number;
  codeLines: number;
  blankLines: number;
  commentLines: number;
} {
  if (content.length === 0) {
    return { lines: 0, codeLines: 0, blankLines: 0, commentLines: 0 };
  }
  const rawLines = content.split("\n");
  const lines = rawLines.length;
  let blank = 0;
  let comment = 0;
  let code = 0;
  let inBlock = false;
  for (let idx = 0; idx < rawLines.length; idx += 1) {
    const raw = rawLines[idx] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "") {
      if (idx === rawLines.length - 1) {
        continue;
      }
      blank += 1;
      continue;
    }
    if (inBlock) {
      comment += 1;
      if (trimmed.includes("*/")) {
        inBlock = false;
      }
      continue;
    }
    const startsComment =
      (style === "slash" && (trimmed.startsWith("//") || trimmed.startsWith("/*"))) ||
      (style === "hash" && trimmed.startsWith("#")) ||
      (style === "html" && trimmed.startsWith("<!--")) ||
      (style === "css" && trimmed.startsWith("/*"));
    if (startsComment) {
      comment += 1;
      if (
        (style === "slash" || style === "css") &&
        trimmed.startsWith("/*") &&
        !trimmed.includes("*/")
      ) {
        inBlock = true;
      }
      if (style === "html" && trimmed.startsWith("<!--") && !trimmed.includes("-->")) {
        inBlock = true;
      }
      continue;
    }
    code += 1;
  }
  return { lines, codeLines: code, blankLines: blank, commentLines: comment };
}

function countMarkers(content: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of MARKERS) {
    out[m] = 0;
  }
  for (const m of MARKERS) {
    const re = new RegExp(`\\b${m}\\b`, "g");
    const matches = content.match(re);
    out[m] = matches ? matches.length : 0;
  }
  return out;
}

type WalkFile = {
  readonly rel: string;
  readonly language: string | undefined;
  readonly bytes: number;
  readonly content: string;
  readonly isText: boolean;
};

function walkInventory(
  dir: string,
  root: string,
  excludeGlobs: readonly string[],
  acc: WalkFile[],
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const entriesOption = yield* Effect.option(fs.readDirectory(dir));
    if (Option.isNone(entriesOption)) return;
    const entries = entriesOption.value;
    entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of entries) {
      const full = path.join(dir, name);
      const rel = toPosix(path.relative(root, full), path);
      const info = yield* Effect.option(fs.lstat(full));
      if (Option.isNone(info)) continue;
      const type = info.value.type;
      if (type === "Directory") {
        if (EXCLUDED_NAMES.has(name)) continue;
        if (matchesAnyExclude(rel, excludeGlobs)) continue;
        yield* walkInventory(full, root, excludeGlobs, acc, fs, path);
        continue;
      }
      if (type === "File" || type === "SymbolicLink") {
        if (EXCLUDED_NAMES.has(name)) continue;
        if (matchesAnyExclude(rel, excludeGlobs)) continue;
        const bytesOption = yield* Effect.option(fs.readFile(full));
        if (Option.isNone(bytesOption)) continue;
        const bytes = bytesOption.value;
        const language = languageForName(name);
        const isText = looksText(bytes);
        const content = isText ? new TextDecoder().decode(bytes) : "";
        acc.push({ rel, language, bytes: bytes.length, content, isText });
      }
    }
  });
}

function looksText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  for (let i = 0; i < sample.length; i += 1) {
    const b = sample[i];
    if (b === undefined) continue;
    if (b === 0) return false;
  }
  return true;
}

export function computeInventory(
  targetAbs: string,
  excludeGlobs: readonly string[],
): Effect.Effect<Metrics, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files: WalkFile[] = [];
    yield* walkInventory(targetAbs, targetAbs, excludeGlobs, files, fs, path);
    files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

    let totalBytes = 0;
    let totalLines = 0;
    let totalCode = 0;
    let totalBlank = 0;
    let totalComment = 0;
    let testFiles = 0;
    let sourceFiles = 0;
    const markers: Record<string, number> = {};
    for (const m of MARKERS) markers[m] = 0;
    const manifests: string[] = [];
    const codeByLang: Record<string, number> = {};
    const filesByLang: Record<string, number> = {};
    const perFile: Array<{
      rel: string;
      lines: number;
      bytes: number;
      language?: string;
    }> = [];

    for (const f of files) {
      totalBytes += f.bytes;
      const name = f.rel.split("/").pop() ?? "";
      if (MANIFEST_FILES.has(name)) {
        manifests.push(f.rel);
      }
      const style = f.language ? (LANGUAGE_COMMENT[f.language] ?? "none") : "none";
      const counts = f.isText
        ? countLines(f.content, style)
        : { lines: 0, codeLines: 0, blankLines: 0, commentLines: 0 };
      totalLines += counts.lines;
      totalCode += counts.codeLines;
      totalBlank += counts.blankLines;
      totalComment += counts.commentLines;
      if (f.isText) {
        const fileMarkers = countMarkers(f.content);
        for (const m of MARKERS) {
          markers[m] = (markers[m] ?? 0) + (fileMarkers[m] ?? 0);
        }
      }
      const isSourceLanguage = f.language !== undefined && !NON_SOURCE_LANGUAGES.has(f.language);
      const isTest = isSourceLanguage && isTestFile(f.rel, f.language as string);
      if (isSourceLanguage) {
        if (isTest) {
          testFiles += 1;
        } else {
          sourceFiles += 1;
        }
      }
      if (f.language !== undefined) {
        filesByLang[f.language] = (filesByLang[f.language] ?? 0) + 1;
        if (f.isText && counts.codeLines > 0) {
          codeByLang[f.language] = (codeByLang[f.language] ?? 0) + counts.codeLines;
        }
      }
      perFile.push({ rel: f.rel, lines: counts.lines, bytes: f.bytes, language: f.language });
    }

    const byLanguage: Record<string, number> = {};
    const totalLangCode = Object.values(codeByLang).reduce((a, b) => a + b, 0);
    for (const [lang, code] of Object.entries(codeByLang)) {
      byLanguage[lang] = totalLangCode > 0 ? Math.round((code / totalLangCode) * 100) : 0;
    }

    const largest = [...perFile].sort((a, b) => b.lines - a.lines).slice(0, 10);

    manifests.sort();

    return {
      files: files.length,
      bytes: totalBytes,
      lines: totalLines,
      codeLines: totalCode,
      blankLines: totalBlank,
      commentLines: totalComment,
      byLanguage,
      testRatio: sourceFiles > 0 ? testFiles / sourceFiles : 0,
      testFiles,
      sourceFiles,
      markers,
      largestFiles: largest.map((f) => ({
        path: f.rel,
        lines: f.lines,
        bytes: f.bytes,
        language: f.language,
      })),
      manifests,
      filesByLanguage: filesByLang,
    };
  });
}

export function computeLayout(
  targetAbs: string,
): Effect.Effect<Layout, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entriesOption = yield* Effect.option(fs.readDirectory(targetAbs));
    if (Option.isNone(entriesOption)) {
      return { topLevel: [], maxDepth: 0 };
    }
    const entries = entriesOption.value;
    entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const topLevel = entries.filter((name) => !EXCLUDED_NAMES.has(name)).slice(0, 40);
    const maxDepth = yield* maxDepthOf(targetAbs, targetAbs, 0, fs, path);
    return { topLevel, maxDepth };
  });
}

function maxDepthOf(
  dir: string,
  root: string,
  current: number,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<number> {
  return Effect.gen(function* () {
    const entriesOption = yield* Effect.option(fs.readDirectory(dir));
    if (Option.isNone(entriesOption)) return current;
    const entries = entriesOption.value;
    let deepest = current;
    for (const name of entries) {
      if (EXCLUDED_NAMES.has(name)) continue;
      const full = path.join(dir, name);
      const info = yield* Effect.option(fs.lstat(full));
      if (Option.isNone(info)) continue;
      if (info.value.type === "Directory") {
        const depth = yield* maxDepthOf(full, root, current + 1, fs, path);
        if (depth > deepest) deepest = depth;
      }
    }
    return deepest;
  });
}

function toPosix(p: string, path: Path.Path): string {
  return p.split(path.sep).join("/");
}
