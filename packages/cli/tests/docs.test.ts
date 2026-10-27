import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { cli } from "../src/cli";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const markdown = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name));
const docs = [join(pkg, "README.md"), ...markdown(join(pkg, "docs"))];

/** Fenced code is left out: a link-looking string inside an example isn't a link. */
const prose = (text: string) => text.replace(/```[\s\S]*?```/g, "");
const fences = (text: string) => [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);

/** GitHub's heading anchors: lowercase, punctuation dropped, spaces to dashes. */
const anchors = (text: string) =>
  new Set(
    [...prose(text).matchAll(/^#{1,6} (.+)$/gm)].map((match) =>
      (match[1] ?? "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .replace(/ /g, "-"),
    ),
  );

test("every relative link in the CLI docs resolves to a file and, with an anchor, a heading", () => {
  expect(docs.map((file) => relative(pkg, file))).toContain("docs/quickstart.md");
  for (const file of docs) {
    const text = readFileSync(file, "utf8");
    for (const [, target = ""] of prose(text).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/.test(target)) continue;
      const [path = "", anchor] = target.split("#");
      const resolved = path === "" ? file : resolve(dirname(file), path);
      const where = `${relative(pkg, file)} -> ${target}`;
      expect(existsSync(resolved), where).toBe(true);
      if (anchor) expect(anchors(readFileSync(resolved, "utf8")).has(anchor), where).toBe(true);
    }
  }
});

test("every quickstacks command in a docs code block is a real subcommand", () => {
  const names = new Set(cli.subcommands.flatMap((group) => group.commands).map((c) => c.name));
  for (const file of docs)
    for (const block of fences(readFileSync(file, "utf8")))
      for (const [, name = ""] of (block ?? "").matchAll(/^\s*quickstacks ([a-z][a-z-]*)/gm))
        expect(names.has(name), `${relative(pkg, file)}: quickstacks ${name}`).toBe(true);
});
