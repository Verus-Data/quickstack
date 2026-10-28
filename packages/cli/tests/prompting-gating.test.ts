import { Schema } from "effect";
import { expect, test } from "vitest";
import { ErrorEnvelope } from "../src/errors";
import type { Audience } from "../src/services/output";
import { quiet, runCli } from "./helpers/cli";
import { terminalScript } from "./helpers/scripted-terminal";

function unchanged(run: Awaited<ReturnType<typeof runCli>>, command: string, json: boolean) {
  expect(run.status).toBe(command === "create" ? 0 : 2);
  if (command === "create") {
    expect(run.stderr).toBe("");
    const help = json
      ? Schema.decodeUnknownSync(Schema.Struct({ help: Schema.String }))(JSON.parse(run.stdout), {
          onExcessProperty: "error",
        }).help
      : run.stdout;
    expect(help).toMatch(/^DESCRIPTION\n/);
    expect(help).toContain("stacks create <subcommand> [flags]");
    expect(help).toMatch(/SUBCOMMANDS\n\s+stack\s+Create a stack/);
    expect(help).toMatch(/\n\s+fragment\s+Create a fragment/);
    expect(help).not.toContain("Running:");
    return;
  }
  expect(run.stdout).toBe("");
  if (json) {
    expect(run.stderr.trim().split("\n")).toHaveLength(1);
    expect(Schema.decodeUnknownSync(ErrorEnvelope)(JSON.parse(run.stderr))).toEqual({
      error: {
        tag: "Usage",
        message: "Invalid command.",
        retryable: false,
        next: "run stacks --help to list the commands, or stacks <command> --help for one.",
      },
    });
  } else {
    expect(run.stderr).toBe(
      "Invalid command.\n  Next: run stacks --help to list the commands, or stacks <command> --help for one.\n",
    );
  }
}

test("only a human with both terminal streams can prompt [4.4b#1]", async () => {
  const { canPrompt } = await import("../src/core/prompting");
  const audiences: ReadonlyArray<Audience> = ["human", "agent", "json"];
  for (const audience of audiences)
    for (const stdinIsTTY of [false, true])
      for (const stdoutIsTTY of [false, true])
        expect(canPrompt({ audience, stdinIsTTY, stdoutIsTTY })).toBe(
          audience === "human" && stdinIsTTY && stdoutIsTTY,
        );
});

test.each([
  { name: "agent", env: { AI_AGENT: "other" }, host: {}, flags: [] },
  { name: "json", env: {}, host: {}, flags: ["--json"] },
  { name: "stdin pipe", env: {}, host: { stdinIsTTY: false }, flags: [] },
  { name: "stdout pipe", env: {}, host: { stdoutIsTTY: false }, flags: [] },
])("new without a stack keeps Usage under $name [4.4b#1]", async ({ env, host, flags }) => {
  const terminal = terminalScript(["1"]);
  const run = await runCli(["new", ...flags], {
    env: { ...quiet, ...env },
    host: { stdinIsTTY: true, stdoutIsTTY: true, ...host },
    terminal,
  });
  unchanged(
    run,
    "new",
    flags.some((flag) => flag === "--json"),
  );
  expect(terminal.reads).toBe(0);
  expect(terminal.displayed).toEqual([]);
});

test.each(["new", "add", "create", "create stack", "create fragment"])(
  "CI at a terminal preserves the noninteractive %s result [4.4b#7]",
  async (command) => {
    const args = command.split(" ");
    const terminal = terminalScript(["1"]);
    const run = await runCli(args, {
      env: { ...quiet, CI: "true" },
      host: { stdinIsTTY: true, stdoutIsTTY: true },
      terminal,
    });
    unchanged(run, command, false);
    expect(terminal.reads).toBe(0);
    expect(terminal.displayed).toEqual([]);
  },
);

test.each(["add", "create", "create stack", "create fragment"])(
  "%s keeps its current result for agents, JSON and pipes [4.4b#7]",
  async (command) => {
    const args = command.split(" ");
    const modes = [
      { env: { CODEX_THREAD_ID: "thread" }, host: {}, flags: [] },
      { env: {}, host: {}, flags: ["--json"] },
      { env: {}, host: { stdinIsTTY: false }, flags: [] },
      { env: {}, host: { stdoutIsTTY: false }, flags: [] },
    ];
    for (const mode of modes) {
      const terminal = terminalScript(["1"]);
      const run = await runCli([...args, ...mode.flags], {
        env: { ...quiet, ...mode.env },
        host: { stdinIsTTY: true, stdoutIsTTY: true, ...mode.host },
        terminal,
      });
      unchanged(
        run,
        command,
        mode.flags.some((flag) => flag === "--json"),
      );
      expect(terminal.reads).toBe(0);
      expect(terminal.displayed).toEqual([]);
    }
  },
);
