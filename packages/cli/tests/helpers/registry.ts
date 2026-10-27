import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const fixtures = join(import.meta.dirname, "..", "fixtures");
/** Two stacks, four fragments (one app, one with a literal `files/.gitignore`), all valid. */
export const smallRegistry = join(fixtures, "registry");
/** Five realistic entries: a TypeScript CLI stack, three fragments and an app. */
export const realRegistry = join(fixtures, "registry-real");
/** Entries that don't load as they are: an unknown key, and `schema_version: 2`. */
export const brokenRegistry = join(fixtures, "registry-broken");
/**
 * Composition cases around the `web-stack` stack: requirements, a cycle, conflicts both ways,
 * merged settings, env and step clashes, two apps, a release fragment another one requires, and
 * stacks with a misfit default and a required app.
 */
export const composeRegistry = join(fixtures, "registry-compose");

/** Writes `<root>/<stacks|fragments>/<dir>/<STACK|FRAGMENT>.md` and returns the entry directory. */
export function writeEntry(
  root: string,
  kind: "stack" | "fragment",
  dir: string,
  frontmatter: string,
  body = "# Guidance\n",
): string {
  const entry = join(root, kind === "stack" ? "stacks" : "fragments", dir);
  mkdirSync(entry, { recursive: true });
  writeFileSync(
    join(entry, kind === "stack" ? "STACK.md" : "FRAGMENT.md"),
    `---\n${frontmatter.trim()}\n---\n${body}`,
  );
  return entry;
}
/** Minimal valid frontmatter for a stack or fragment with `id`. */
export function minimal(kind: "stack" | "fragment", id: string, extra = ""): string {
  return [
    "schema_version: 1",
    `id: ${id}`,
    `kind: ${kind}`,
    `name: ${id} name`,
    `description: ${id} description.`,
    ...(kind === "fragment" ? ["category: tooling"] : []),
    extra,
  ].join("\n");
}
/** Copies one entry directory from a fixture registry into `root`. */
export function copyEntry(from: string, root: string, kindDir: "stacks" | "fragments", id: string) {
  cpSync(join(from, kindDir, id), join(root, kindDir, id), { recursive: true });
}
