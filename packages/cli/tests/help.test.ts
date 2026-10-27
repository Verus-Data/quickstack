import { expect, test } from "vitest";
import { cli } from "../src/cli";
import { errorTable } from "../src/errors";
import { runCli } from "./helpers/cli";
import { declaredFlags, helpSection } from "./helpers/help";

type Node = { readonly path: ReadonlyArray<string>; readonly command: Command };
type Command = (typeof cli.subcommands)[number]["commands"][number];

const children = (command: Command) => command.subcommands.flatMap((group) => group.commands);

/** Every command below the root, depth first, with the argv that reaches it. */
function walk(command: Command, path: ReadonlyArray<string> = []): Node[] {
  return children(command).flatMap((child) => {
    const node = { path: [...path, child.name], command: child };
    return [node, ...walk(child, node.path)];
  });
}

const nodes = walk(cli);
const leaves = nodes.filter((node) => children(node.command).length === 0);
const help = async (path: ReadonlyArray<string>) => {
  const run = await runCli([...path, "--help"]);
  expect(run.status, `${path.join(" ")}: ${run.stderr}`).toBe(0);
  return run.stdout;
};

test("every command has a description and a one-line short description for the root list", () => {
  expect(nodes.map((node) => node.path.join(" "))).toContain("skill install");
  for (const { path, command } of nodes) {
    const name = path.join(" ");
    expect(command.description?.trim(), name).toBeTruthy();
    expect(command.shortDescription?.trim(), name).toBeTruthy();
    expect(command.shortDescription?.length ?? 0, name).toBeLessThanOrEqual(80);
    expect(command.shortDescription, name).not.toContain("\n");
  }
});

test("the root --help lists subcommands alphabetically by their short descriptions", async () => {
  const listed = helpSection(await help([]), "SUBCOMMANDS").map((line) => line.trim());
  const names = listed.map((line) => line.split(/\s+/)[0]);
  expect(names).toEqual([...names].sort());
  for (const command of children(cli)) {
    const line = listed.find((entry) => entry.startsWith(`${command.name} `));
    expect(line?.replace(/^\S+\s+/, ""), command.name).toBe(command.shortDescription);
  }
});

test("every flag and argument in a command's help has a description", async () => {
  for (const { path } of nodes) {
    const text = await help(path);
    for (const heading of ["ARGUMENTS", "FLAGS"])
      for (const line of helpSection(text, heading))
        expect(line, `${path.join(" ")} ${heading}`).toMatch(/^ {2}\S.*? {2,}\S/);
  }
});

test("every leaf command's help has examples whose flags that command declares", async () => {
  for (const { path } of leaves) {
    const name = path.join(" ");
    const text = await help(path);
    const examples = helpSection(text, "EXAMPLES").filter((line) => !line.trim().startsWith("#"));
    expect(examples.length, name).toBeGreaterThanOrEqual(2);
    const flags = declaredFlags(text);
    for (const example of examples) {
      const argv = example.trim().split(/\s+/);
      expect(argv.slice(0, path.length + 1), example).toEqual(["quickstacks", ...path]);
      for (const flag of argv.filter((word) => word.startsWith("--")))
        expect(flags.has(flag), `${example}: ${flag}`).toBe(true);
    }
  }
});

test("every exit code a command's description states is 0 or one errorTable maps to", () => {
  const exits = new Set<number>([0, ...Object.values(errorTable).map((row) => row.exit)]);
  const tags = new Set(Object.keys(errorTable));
  for (const { path, command } of leaves) {
    const name = path.join(" ");
    const sentence = /Exits (.*)$/.exec(command.description ?? "")?.[1];
    expect(sentence, `${name} states its exit codes`).toBeDefined();
    for (const code of sentence?.match(/\b\d+\b/g) ?? [])
      expect(exits.has(Number(code)), `${name}: ${code}`).toBe(true);
    for (const tag of command.description?.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g) ?? [])
      expect(tags.has(tag), `${name}: ${tag}`).toBe(true);
  }
});
