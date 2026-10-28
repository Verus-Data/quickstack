import { Schema } from "effect";
import { expect, test } from "vitest";
import { ErrorEnvelope } from "../src/errors";
import { quiet, runCli, terminal } from "./helpers/cli";

test.each([
  {
    args: ["new", "sample", "--dir", "/tmp/x"],
    command: "new",
    flag: "--dir",
    suggestions: ["<dir> (positional argument)"],
  },
  { args: ["list", "--jsno"], command: "list", flag: "--jsno", suggestions: ["--json"] },
  { args: ["list", "--bogus"], command: "list", flag: "--bogus", suggestions: [] },
  { args: ["list", "--naem"], command: "list", flag: "--naem", suggestions: [] },
  { args: ["list", "--jsno=true"], command: "list", flag: "--jsno", suggestions: ["--json"] },
  { args: ["--unexpected"], command: "stacks", flag: "--unexpected", suggestions: [] },
  { args: ["--naem", "new", "sample"], command: "stacks", flag: "--naem", suggestions: [] },
  { args: ["--jsno", "list"], command: "stacks", flag: "--jsno", suggestions: ["--json"] },
])("unknown $flag on $command names the input and command in every audience", async (row) => {
  const { args, command, flag, suggestions } = row;
  const help = command === "stacks" ? "stacks" : `stacks ${command}`;
  const next = `run ${help} --help to list the flags and arguments.`;
  const json = await runCli([...args, "--json"], { env: quiet });
  expect(json.status).toBe(2);
  expect(json.stdout).toBe("");
  expect(
    Schema.decodeUnknownSync(Schema.fromJsonString(ErrorEnvelope))(json.stderr, {
      onExcessProperty: "error",
    }),
  ).toEqual({
    error: {
      tag: "Usage",
      message: "Invalid command.",
      retryable: false,
      next,
      details: { flag, command, suggestions },
    },
  });
  for (const host of [{}, terminal]) {
    const text = await runCli(args, { env: quiet, host });
    expect(text.status).toBe(2);
    expect(text.stdout).toBe("");
    expect(text.stderr).toBe(
      [
        "Invalid command.",
        `  Flag: ${flag}`,
        `  Command: ${command}`,
        ...(suggestions.length ? [`  Did you mean: ${suggestions.join(", ")}?`] : []),
        `  Next: ${next}`,
        "",
      ].join("\n"),
    );
  }
});
