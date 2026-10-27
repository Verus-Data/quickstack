import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { cli } from "../src/cli";
import { runCli } from "./helpers/cli";
import { declaredFlags } from "./helpers/help";

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

type Command = (typeof cli.subcommands)[number]["commands"][number];
const children = (command: Command) => command.subcommands.flatMap((group) => group.commands);

/** The command path a `quickstacks ...` invocation names: as many words as match subcommands. */
function commandPath(words: ReadonlyArray<string>): string[] {
  const path: string[] = [];
  let command: Command = cli;
  for (const word of words) {
    const child = children(command).find((c) => c.name === word);
    if (child === undefined) break;
    path.push(word);
    command = child;
  }
  return path;
}

/** Each `quickstacks ...` line in a docs code block, joined with its `\` continuation lines. */
const invocations = (block: string) =>
  [...block.replace(/\\\n\s*/g, " ").matchAll(/^\s*quickstacks ([^\n#]*)/gm)].map((m) =>
    (m[1] ?? "").trim().split(/\s+/),
  );

test("every quickstacks command in a docs code block is a real subcommand with real flags", async () => {
  const helps = new Map<string, Set<string>>();
  const flagsOf = async (path: ReadonlyArray<string>) => {
    const key = path.join(" ");
    const known = helps.get(key) ?? declaredFlags((await runCli([...path, "--help"])).stdout);
    helps.set(key, known);
    return known;
  };
  const shown = docs.flatMap((file) =>
    fences(readFileSync(file, "utf8")).flatMap((block) =>
      invocations(block ?? "").map((words) => ({ file, words })),
    ),
  );
  for (const { file, words } of shown.filter(({ words }) => !words[0]?.startsWith("-"))) {
    const where = `${relative(pkg, file)}: quickstacks ${words.join(" ")}`;
    const path = commandPath(words);
    expect(path.length, where).toBeGreaterThan(0);
    const flags = await flagsOf(path);
    for (const word of words.filter((w) => w.startsWith("--")))
      expect(flags.has(word.split("=")[0] ?? ""), `${where}: ${word}`).toBe(true);
  }
});
