import { Result } from "effect";
import { parse as parseToml } from "smol-toml";

export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

export function json(text: string): Record<string, unknown> | null {
  const parsed = Result.try(() => JSON.parse(text) as unknown);
  return Result.isSuccess(parsed) ? object(parsed.success) : null;
}

export function toml(text: string): Record<string, unknown> | null {
  const parsed = Result.try(() => parseToml(text));
  return Result.isSuccess(parsed) ? object(parsed.success) : null;
}

export function major(version: unknown): string | null {
  if (typeof version !== "string") return null;
  const parts = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)(?=\.|[a-zA-Z+-]|$)/u.exec(version);
  if (parts === null) return null;
  return parts[1] === "0" ? `0.${parts[2]}` : (parts[1] ?? null);
}

export function names(value: unknown): ReadonlyArray<string> {
  const record = object(value);
  return record === null ? [] : Object.keys(record);
}

function rootReferences(
  rows: ReadonlyArray<Record<string, unknown>>,
  normalize: (name: string) => string,
  rootName: string,
): Map<string, string | null> {
  const references = new Map<string, string | null>();
  const root = rows.find(
    (row) => typeof row.name === "string" && normalize(row.name) === normalize(rootName),
  );
  if (!Array.isArray(root?.dependencies)) return references;
  for (const entry of root.dependencies) {
    const row = object(entry);
    let name = row?.name;
    let version = row?.version;
    if (typeof entry === "string") {
      const words = entry.split(/\s+/u);
      name = words[0];
      version = words[1];
    }
    if (typeof name === "string" && typeof version === "string") {
      references.set(normalize(name), major(version));
    }
  }
  return references;
}

export function packageMajors(
  value: unknown,
  normalize: (name: string) => string,
  rootName?: string,
): Map<string, string | null> {
  const majors = new Map<string, string | null>();
  if (!Array.isArray(value)) return majors;
  const rows = value.map(object).filter((row) => row !== null);
  for (const row of rows) {
    if (typeof row.name !== "string" || typeof row.version !== "string") continue;
    const name = normalize(row.name);
    const found = major(row.version);
    if (majors.has(name) && majors.get(name) !== found) majors.set(name, null);
    else if (!majors.has(name)) majors.set(name, found);
  }
  if (rootName !== undefined) {
    for (const [name, version] of rootReferences(rows, normalize, rootName))
      majors.set(name, version);
  }
  return majors;
}
