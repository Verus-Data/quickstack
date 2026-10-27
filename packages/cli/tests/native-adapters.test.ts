import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, matchesGlob, normalize } from "node:path";
import { AgentId } from "@stacks/format";
import { Schema } from "effect";
import { parse } from "smol-toml";
import { afterEach, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  adapterWorkspace,
  bundled,
  nativeAgents,
  scaffoldAdapters,
} from "./helpers/native-adapters";

const space = adapterWorkspace();
afterEach(() => space.cleanup());
const stacks = readdirSync(join(bundled, "stacks"))
  .filter((id) => existsSync(join(bundled, "stacks", id, "STACK.md")))
  .sort();
const configs = {
  claude: ".claude/settings.json",
  codex: ".codex/hooks.json",
  opencode: "opencode.json",
  cursor: ".cursor/hooks.json",
};
const Hook = Schema.Struct({ command: Schema.String });
const JsonObject = Schema.Record(Schema.String, Schema.Unknown);

test.each(["openrouter-chat", "openrouter-chat-cli"])(
  "Cursor requests the long %s rule by description",
  (fragment) => {
    const meta = instructionMetadata(
      join(bundled, "fragments", fragment, "adapters/cursor/.cursor/rules", `${fragment}.mdc.tmpl`),
    );
    expect(meta.alwaysApply).toBe(false);
    expect(meta.description).toEqual(expect.stringMatching(/\S/));
  },
);

function instructionMetadata(file: string) {
  const text = readFileSync(file, "utf8");
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  expect(header, `${file} frontmatter`).not.toBeNull();
  const value: unknown = parseYaml(header?.[1] ?? "");
  expect(text.slice(header?.[0].length ?? 0).trim()).not.toBe("");
  return Schema.decodeUnknownSync(JsonObject)(value);
}

function readInstruction(file: string) {
  if (basename(file) === "SKILL.md") {
    const meta = Schema.decodeUnknownSync(
      Schema.Struct({
        name: Schema.NonEmptyString,
        description: Schema.NonEmptyString,
      }),
    )(instructionMetadata(file));
    expect(meta.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(meta.name).toBe(basename(dirname(file)));
    expect(meta.description.length).toBeLessThanOrEqual(1024);
  }
  if (file.endsWith(".mdc")) {
    const meta = Schema.decodeUnknownSync(
      Schema.Struct({
        alwaysApply: Schema.optionalKey(Schema.Boolean),
        description: Schema.optionalKey(Schema.String),
        globs: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
      }),
    )(instructionMetadata(file));
    expect(
      meta.alwaysApply === true || Boolean(meta.description?.trim()) || Boolean(meta.globs?.length),
    ).toBe(true);
  }
  return readFileSync(file, "utf8");
}

function checkNativeFiles(result: Awaited<ReturnType<typeof scaffoldAdapters>>) {
  for (const agent of AgentId.literals) {
    expect(result.written.includes(configs[agent]), `${agent} config`).toBe(
      result.agents.includes(agent),
    );
    if (result.agents.includes(agent)) {
      Schema.decodeUnknownSync(JsonObject)(
        JSON.parse(readFileSync(join(result.project, configs[agent]), "utf8")),
      );
    }
  }
  if (!result.agents.includes("codex")) expect(result.written).not.toContain(".codex/config.toml");
  if (!result.agents.includes("claude")) expect(result.written).not.toContain("CLAUDE.md");
  if (result.agents.includes("codex")) {
    const config = parse(readFileSync(join(result.project, ".codex/config.toml"), "utf8"));
    expect(config.sandbox_mode).toBe("workspace-write");
    expect(config.approval_policy).toBe("on-request");
  }
  if (result.agents.includes("opencode")) {
    expect(result.written.some((f) => /^\.opencode\/plugins\/.*\.[cm]?[jt]s$/.test(f))).toBe(true);
  }
  if (result.agents.includes("cursor")) {
    const rules = result.written.filter((f) => /^\.cursor\/rules\/.*\.mdc$/.test(f));
    expect(rules.length).toBeGreaterThan(0);
    expect(
      rules.some((f) => instructionMetadata(join(result.project, f)).alwaysApply === true),
    ).toBe(true);
    const hooks = Schema.decodeUnknownSync(
      Schema.Struct({
        version: Schema.Literal(1),
        hooks: Schema.Record(Schema.String, Schema.Array(Hook)),
      }),
    )(JSON.parse(readFileSync(join(result.project, ".cursor/hooks.json"), "utf8")));
    expect(hooks.hooks.preToolUse?.length).toBeGreaterThan(0);
  }
}

function configuredInstructions(
  result: Awaited<ReturnType<typeof scaffoldAdapters>>,
  agent: string,
) {
  if (agent === "codex") {
    const path = join(result.project, ".codex/config.toml");
    if (!existsSync(path)) return [];
    const config = parse(readFileSync(path, "utf8"));
    return typeof config.model_instructions_file === "string"
      ? [normalize(join(".codex", config.model_instructions_file))]
      : [];
  }
  if (agent !== "opencode") return [];
  const path = join(result.project, "opencode.json");
  if (!existsSync(path)) return [];
  return (
    Schema.decodeUnknownSync(
      Schema.Struct({ instructions: Schema.optionalKey(Schema.Array(Schema.String)) }),
    )(JSON.parse(readFileSync(path, "utf8"))).instructions ?? []
  );
}

test.each(stacks.flatMap((stack) => AgentId.literals.map((agent) => ({ stack, agent }))))(
  "$stack writes only the selected $agent adapter [3.4b#1]",
  async ({ stack, agent }) => {
    const result = await scaffoldAdapters({ home: space.temp(), stack, agents: [agent] });
    expect(result.agents).toEqual([agent]);
    for (const file of result.written)
      expect(existsSync(join(result.project, file)), file).toBe(true);
    checkNativeFiles(result);
  },
  // Each case composes a real bundled stack and initializes git; no builds or agents run.
  15_000,
);

test.each(stacks)(
  "%s composes Claude and Codex together without losing either config [3.4b#1]",
  async (stack) => {
    const result = await scaffoldAdapters({
      home: space.temp(),
      stack,
      agents: ["claude", "codex"],
    });
    expect(result.agents).toEqual(["claude", "codex"]);
    expect(new Set(result.written).size).toBe(result.written.length);
    checkNativeFiles(result);
  },
  15_000,
);

test.each(nativeAgents)(
  "explicit %s selection beats an inherited agent marker and drops duplicates [3.4b#8]",
  async (agent) => {
    const result = await scaffoldAdapters({
      home: space.temp(),
      agents: [agent, agent],
      env: { CLAUDECODE: "1" },
    });
    expect(result.agents).toEqual([agent]);
    expect(result.handoff).toMatchObject({ kind: "inside-agent", agent: "claude" });
    checkNativeFiles(result);
  },
);

test.each(
  [
    { fragment: "effect", stack: "typescript-cli", token: "Effect" },
    { fragment: "bun-release", stack: "typescript-cli", token: "SHA256SUMS" },
    { fragment: "rr", stack: "go-cli", token: "rr test" },
    { fragment: "openrouter-chat", stack: "react-router", token: "OpenRouter" },
    { fragment: "openrouter-chat-cli", stack: "typescript-cli", token: "OpenRouter" },
  ].flatMap((row) => nativeAgents.map((agent) => ({ ...row, agent }))),
)(
  "$fragment supplies $agent-readable guidance in a documented instruction file [3.4b#1]",
  async ({ fragment, stack, token, agent }) => {
    const result = await scaffoldAdapters({
      home: space.temp(),
      stack,
      fragments: [fragment],
      agents: [agent],
    });
    const configured = configuredInstructions(result, agent);
    const instructionFiles = result.written.filter((f) => {
      if (configured.some((pattern) => matchesGlob(f, pattern))) return true;
      if (agent === "cursor") return /^\.cursor\/rules\/.*\.mdc$/.test(f);
      if (agent === "codex")
        return /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(f) || f === "AGENTS.md";
      return /^\.(?:opencode|agents)\/skills\/[^/]+\/SKILL\.md$/.test(f) || f === "AGENTS.md";
    });
    // The brief is deliberately excluded: it is not automatically loaded by these agents.
    const guidance = instructionFiles
      .map((f) => readInstruction(join(result.project, f)))
      .join("\n");
    expect(guidance).toContain(token);
    expect(result.written).not.toContain(".claude/settings.json");
  },
  15_000,
);

test("the agent table distinguishes enforcement, instructions and unproved runs [3.4b#10]", () => {
  const readme = readFileSync(join(bundled, "..", "docs", "agents.md"), "utf8");
  for (const agent of ["claude", ...nativeAgents]) {
    const row = readme
      .split("\n")
      .find((line) => line.startsWith("|") && new RegExp(`\\b${agent}\\b`, "i").test(line));
    expect(row, `${agent} table row`).toBeDefined();
    expect(row).toMatch(/enforced|instructions/i);
    if (agent === "opencode" || agent === "cursor")
      expect(row).toMatch(/unproved.*bench|bench.*unproved/i);
  }
});
