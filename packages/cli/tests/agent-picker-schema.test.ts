import { existsSync } from "node:fs";
import { join } from "node:path";
import { AgentId } from "@steamfield/stacks-format";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { NewResult } from "../src/schemas/new";
import { fakeAgent } from "./helpers/agents";
import { runCli, scriptedTerminal } from "./helpers/cli";
import { type PickerWorkspace, pickerNew, pickerWorkspace } from "./helpers/picker";

const workspaces: PickerWorkspace[] = [];
afterEach(() => {
  for (const w of workspaces.splice(0)) w.cleanup();
});

test("Harness adds launch-only ids without widening AgentId [4.4c#8]", async () => {
  const { Harness } = await import("@steamfield/stacks-format");
  expect(Harness.literals).toEqual([...AgentId.literals, "copilot", "codex-app"]);
  expect(AgentId.literals).toEqual(["claude", "codex", "opencode", "cursor"]);
});

test("new JSON stays one result and its print schema accepts the new harnesses and not-chosen [4.4c#8]", async () => {
  const w = pickerWorkspace();
  workspaces.push(w);
  const installed = [fakeAgent(w.bin, "claude"), fakeAgent(w.bin, "codex")];
  const terminal = scriptedTerminal(["2"]);
  const run = await pickerNew(w, ["--json"], { terminal });
  expect(run.status).toBe(0);
  expect(run.stderr).toBe("");
  expect(run.stdout.trim().split("\n")).toHaveLength(1);
  const report = Schema.decodeUnknownSync(NewResult)(JSON.parse(run.stdout));
  expect(report.handoff).toMatchObject({ kind: "print", reason: "json" });
  expect(terminal.reads).toBe(0);
  expect(terminal.displayed).toEqual([]);
  expect(installed.every((agent) => !agent.ran())).toBe(true);
  for (const agent of ["copilot", "codex-app"]) {
    const handoff = { ...report.handoff, kind: "print", reason: "agent-not-found", agent };
    expect(Schema.decodeUnknownSync(NewResult)({ ...report, handoff }).handoff).toEqual(handoff);
  }
  const fallback = {
    kind: "print",
    reason: "not-chosen",
    untrusted: [],
    prompt: report.handoff.prompt,
  };
  expect(Schema.decodeUnknownSync(NewResult)({ ...report, handoff: fallback }).handoff).toEqual(
    fallback,
  );
});

test("schema new publishes the harness ids and the not-chosen reason in handoff fields [4.4c#8]", async () => {
  const run = await runCli(["schema", "new", "--json"]);
  expect(run.status).toBe(0);
  expect(run.stderr).toBe("");
  const document: unknown = JSON.parse(run.stdout);
  expect(document).toMatchObject({
    properties: {
      handoff: {
        anyOf: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              kind: expect.objectContaining({ enum: ["print"] }),
              reason: expect.objectContaining({ enum: expect.arrayContaining(["not-chosen"]) }),
              agent: expect.objectContaining({
                enum: expect.arrayContaining(["copilot", "codex-app"]),
              }),
            }),
          }),
        ]),
      },
    },
  });
});

test.each(["copilot", "codex-app"])(
  "--agents %s remains a Usage error and writes no project [4.4c#8]",
  async (agent) => {
    const w = pickerWorkspace();
    workspaces.push(w);
    const terminal = scriptedTerminal(["1"]);
    const run = await pickerNew(w, ["--agents", agent, "--json"], { terminal });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(run.stderr)).toMatchObject({
      error: { tag: "Usage", details: { flag: "--agents", value: agent } },
    });
    expect(terminal.reads).toBe(0);
    expect(existsSync(join(w.home, "app"))).toBe(false);
  },
);
