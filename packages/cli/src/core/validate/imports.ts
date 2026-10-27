import { posix } from "node:path";
import { Effect } from "effect";
import type { Finding } from "../../schemas/validate";
import type { Entry } from "../registry/entry";
import { shellWords } from "./commands";
import { sourceOf, uniqueFindings } from "./composed";
import { type Check, finding, type View } from "./view";

type ImportRef = { spec: string; line: number };
const JS_EXT = /\.(?:ts|tsx|js|mjs)$/;

/** Mask comments and record code positions without interpreting import-like literal text. */
function javascript(text: string) {
  const chars = text.split("");
  const code = new Uint8Array(text.length);
  let quote: string | undefined;
  let comment: "line" | "block" | undefined;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (comment) {
      if (char !== "\n" && char !== "\r") chars[index] = " ";
      if (comment === "line" && char === "\n") comment = undefined;
      else if (comment === "block" && char === "*" && next === "/") {
        chars[++index] = " ";
        comment = undefined;
      }
    } else if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = undefined;
    } else if (char === "/" && (next === "/" || next === "*")) {
      comment = next === "/" ? "line" : "block";
      chars[index] = " ";
      chars[++index] = " ";
    } else {
      code[index] = 1;
      if (char === '"' || char === "'" || char === "`") quote = char;
    }
  }
  return { text: chars.join(""), code };
}

/** Static relative imports only; package imports belong to the generated dependency setup. */
function imports(text: string, js: boolean): ImportRef[] {
  const refs: ImportRef[] = [];
  if (js) {
    const scanned = javascript(text);
    for (const pattern of [
      /^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*(["'])([^"'\n]+)\1/gm,
      /^[ \t]*import\s*(["'])([^"'\n]+)\1/gm,
      /\brequire\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g,
    ])
      for (const match of scanned.text.matchAll(pattern)) {
        const keyword = match.index + (match[0].match(/^[ \t]*/)?.[0].length ?? 0);
        const spec = match[2] ?? "";
        if (!scanned.code[keyword] || !/^\.\.?\//.test(spec)) continue;
        refs.push({ spec, line: text.slice(0, match.index).split("\n").length });
      }
  } else {
    for (const match of text.matchAll(/^[ \t]*(?:source|\.)[ \t]+/gm)) {
      let spec = shellWords(text.slice(match.index).split("\n")[0] ?? "")[1];
      if (!spec) continue;
      if (/^\$\{?CLAUDE_PROJECT_DIR\}?\//.test(spec)) spec = spec.replace(/^[^/]+/, "");
      else if (/^\$(?:\{[^}]+\}|\w+)\//.test(spec)) spec = `./${spec.slice(spec.indexOf("/") + 1)}`;
      else if (spec.startsWith("/") || spec.includes("$")) continue;
      else if (!spec.startsWith(".")) spec = `./${spec}`;
      refs.push({ spec, line: text.slice(0, match.index).split("\n").length });
    }
  }
  return refs;
}

function resolve(from: string, spec: string, paths: ReadonlySet<string>, js: boolean) {
  const base = spec.startsWith("/")
    ? posix.normalize(spec.slice(1))
    : posix.join(posix.dirname(from), spec);
  const candidates = [base];
  if (js) {
    if (base.endsWith(".js"))
      candidates.push(base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"));
    if (!posix.extname(base))
      candidates.push(...[".ts", ".tsx", ".js", ".mjs"].map((ext) => base + ext));
    candidates.push(posix.join(base, "index.ts"));
  }
  return candidates.find((candidate) => paths.has(candidate));
}

function allowedOwners(view: View, entry: Entry): Set<string> {
  const allowed = new Set([`${entry.kind}:${entry.id}`]);
  const queue =
    entry.meta.kind === "stack" ? [...entry.meta.fragments.required] : [...entry.meta.requires];
  for (const id of queue) {
    const key = `fragment:${id}`;
    if (allowed.has(key)) continue;
    allowed.add(key);
    const dependency = view.all.find((item) => item.kind === "fragment" && item.id === id);
    if (dependency && "meta" in dependency && dependency.meta.kind === "fragment")
      queue.push(...dependency.meta.requires);
  }
  return allowed;
}

export const importChecks: Check = (view) =>
  Effect.gen(function* () {
    const findings: Finding[] = [];
    for (const snapshot of (yield* view.composed).snapshots) {
      const byPath = new Map(snapshot.files.map((file) => [file.path, file]));
      const paths = new Set(byPath.keys());
      for (const file of snapshot.files) {
        const js = JS_EXT.test(file.path);
        if (!js && !file.path.endsWith(".sh")) continue;
        const source = sourceOf(view, snapshot, file);
        if (!source || !view.entries.some((entry) => entry.dir === source.entry.dir)) continue;
        const allowed = allowedOwners(view, source.entry);
        for (const ref of imports(new TextDecoder().decode(file.bytes), js)) {
          const target = resolve(file.path, ref.spec, paths, js);
          const owner = target === undefined ? undefined : byPath.get(target)?.owner;
          if (owner?.split("+").some((key) => allowed.has(key))) continue;
          const field = source.entry.kind === "stack" ? "fragments.required" : "requires";
          findings.push(
            finding(source.entry, {
              check: "import-closure",
              severity: "error",
              file: view.file(source.entry, source.source.source),
              line: ref.line,
              message: `${file.path} imports ${ref.spec}${target ? ` (${target}, owned by ${owner})` : ", which resolves to no composed file"}; add the owner to ${field} or move the shared file`,
            }),
          );
        }
      }
    }
    return { findings: uniqueFindings(findings) };
  });
