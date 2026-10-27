import { readFileSync } from "node:fs";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { authoringGuide, createCli, createWorkspace, releaseCreate } from "./helpers/create";

afterEach(releaseCreate);
// Like the skill test, inspect code examples rather than executing documentation as shell text.
function examples(body: string) {
  const code = [...body.matchAll(/```[^\n]*\n([\s\S]*?)```|`([^`\n]+)`/g)]
    .map((match) => match[1] ?? match[2] ?? "")
    .join("\n");
  return [
    ...code.matchAll(
      /\bquickstacks(?:@[^\s`]+)?[ \t]+([a-z][a-z-]*)(.*?)(?=\bquickstacks[ \t]|&&|\|\||[;|\n]|$)/g,
    ),
  ].map((match) => {
    const name = match[1] ?? "";
    const tail = match[2] ?? "";
    const subcommand = name === "create" ? /^\s+([a-z][a-z-]*)\b/.exec(tail)?.[1] : undefined;
    return {
      name,
      command: subcommand ? [name, subcommand] : [name],
      flags: [...new Set(tail.match(/--[a-z][a-z-]*/g) ?? [])],
    };
  });
}
function declaredFlags(help: string) {
  const flags = new Set<string>();
  let options = false;
  for (const line of help.split("\n")) {
    if (/^[A-Z][A-Z ]*$/.test(line)) options = line === "FLAGS" || line === "GLOBAL FLAGS";
    if (options) {
      const flag = /^ {2}(--[a-z][a-z-]*)(?=[ ,\t]|$)/.exec(line)?.[1];
      if (flag) flags.add(flag);
    }
  }
  return flags;
}

test("the packaged authoring guide's commands and flags exist in the real tree [3.1b#8]", async () => {
  const body = readFileSync(authoringGuide, "utf8");
  const commands = examples(body);
  expect(commands.map((example) => example.name)).toEqual(
    expect.arrayContaining(["create", "show", "validate", "new", "verify"]),
  );
  expect(commands.map((example) => example.command.join(" "))).toEqual(
    expect.arrayContaining(["create stack", "create fragment"]),
  );
  const advertised = new Set<string>();
  for (const example of commands) {
    // Help bypasses missing positionals and option values; inspect declarations as well.
    const run = await createCli(createWorkspace(), [
      ...example.command,
      ...example.flags,
      "--help",
    ]);
    expect(run.status, `${example.command.join(" ")}: ${run.stderr}`).toBe(0);
    expect(run.stderr).toBe("");
    const help = example.flags.includes("--json")
      ? Schema.decodeUnknownSync(Schema.Struct({ help: Schema.String }))(JSON.parse(run.stdout))
          .help
      : run.stdout;
    expect(help).toContain(example.name);
    const flags = declaredFlags(help);
    for (const flag of example.flags)
      expect(flags.has(flag), `${example.command.join(" ")} ${flag}`).toBe(true);
    for (const flag of flags) advertised.add(flag);
  }
  for (const flag of body.match(/--[a-z][a-z-]*/g) ?? [])
    expect(advertised.has(flag), flag).toBe(true);
});

test.each([
  { host: { stdoutIsTTY: true, stdinIsTTY: true }, env: {} },
  { host: { stdoutIsTTY: false, stdinIsTTY: false }, env: { CLAUDECODE: "1" } },
])("create prints the entry and guide paths in text audiences: %j [3.1b#8]", async (options) => {
  const home = createWorkspace();
  const run = await createCli(home, ["create", "fragment", "my-ci"], options);
  expect(run.status).toBe(0);
  expect(run.stderr).toBe("");
  // Agent rendering may use a cwd-relative path.
  expect(run.stdout).toContain("config/quickstacks/fragments/my-ci");
  expect(run.stdout).toContain(authoringGuide);
});
