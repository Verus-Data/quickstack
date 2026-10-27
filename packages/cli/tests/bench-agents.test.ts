import { expect, test } from "vitest";
import type { AgentAdapter } from "../scripts/bench/agents";
import { sample } from "./helpers/bench";

async function adapter(id: "claude" | "codex"): Promise<AgentAdapter> {
  const { agents } = await import("../scripts/bench/agents");
  const found = agents.find((candidate: AgentAdapter) => candidate.id === id);
  if (!found) throw new Error(`missing required ${id} adapter`);
  return found;
}

test("Claude parses its documented single JSON success and error objects [2.0b#9]", async () => {
  const claude = await adapter("claude");
  expect(claude.binary).toBe("claude");
  expect(claude.versionArgs).toEqual(["--version"]);
  expect(claude.auth.env).toBe("CLAUDE_CODE_OAUTH_TOKEN");
  expect(claude.readResult(sample("claude-success.json"))).toMatchObject({
    ended: "exit",
    turns: 4,
  });
  expect(claude.readResult(sample("claude-error.json"))).toMatchObject({
    ended: "error",
    subtype: "error_max_turns",
    turns: 3,
  });
  const args = claude.headlessArgs("Read the bench brief.");
  expect(args).toEqual(
    expect.arrayContaining(["-p", "Read the bench brief.", "--dangerously-skip-permissions"]),
  );
  expect(args[args.indexOf("--output-format") + 1]).toBe("json");
}, 60_000);

test("Codex parses completion and failed-turn JSONL without inventing Claude fields [2.0b#15]", async () => {
  const codex = await adapter("codex");
  expect(codex.binary).toBe("codex");
  expect(codex.versionArgs).toEqual(["--version"]);
  expect(codex.auth.env).toBe("CODEX_ACCESS_TOKEN");
  expect(codex.readResult(sample("codex-success.jsonl"))).toMatchObject({
    ended: "exit",
    turns: 1,
  });
  expect(codex.readResult(sample("codex-error.jsonl"))).toMatchObject({ ended: "error" });
  const args = codex.headlessArgs("Read the bench brief.");
  expect(args[0]).toBe("exec");
  expect(args).toEqual(expect.arrayContaining(["--json", "Read the bench brief."]));
  // Both documented full-access forms satisfy the plan; do not pin one spelling.
  expect(
    args.includes("--dangerously-bypass-approvals-and-sandbox") ||
      args[args.indexOf("--sandbox") + 1] === "danger-full-access",
  ).toBe(true);
}, 60_000);

test.each(["claude", "codex"] as const)(
  "%s never reads a missing or truncated result as success [2.0b#26]",
  async (id) => {
    const agent = await adapter(id);
    for (const tail of [
      "",
      "not JSON\n",
      '{"type":"result",',
      '{"type":"thread.started","thread_id":"fixture"}\n',
    ])
      expect(agent.readResult(tail).ended).toBe("error");
  },
  60_000,
);

test("a later Codex failure wins over an earlier completed turn [2.0b#26]", async () => {
  const codex = await adapter("codex");
  const tail = `${sample("codex-success.jsonl")}\n${sample("codex-error.jsonl")}`;
  expect(codex.readResult(tail).ended).toBe("error");
}, 60_000);

test.each(['{"type":"turn.failed","error":', '{"type":"turn.started"}\n'])(
  "Codex rejects an incomplete later turn after a success: %s [2.0b#26]",
  async (suffix) => {
    const codex = await adapter("codex");
    expect(codex.readResult(`${sample("codex-success.jsonl")}\n${suffix}`).ended).toBe("error");
  },
  60_000,
);
