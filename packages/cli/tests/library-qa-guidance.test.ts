import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";
import { adapterWorkspace, scaffoldAdapters } from "./helpers/native-adapters";

const space = adapterWorkspace();
afterEach(() => space.cleanup());
const agents = ["claude", "codex", "cursor", "opencode"] as const;
const compositions = [
  { stack: "typescript-api", guide: "typescript-api", required: ["effect-api", "testing"] },
  { stack: "astro-api", guide: "astro-api", required: ["effect-api", "testing", "astro"] },
  {
    stack: "typescript-cli",
    fragments: ["openrouter-chat-cli"],
    guide: "openrouter-chat-cli",
    required: ["tui", "testing", "effect-ai", "openrouter"],
  },
  {
    stack: "react-router",
    fragments: ["openrouter-chat"],
    guide: "openrouter-chat",
    required: ["styling", "testing", "ai-sdk", "openrouter", "rate-limiting"],
  },
];

test.each(compositions.flatMap((c) => agents.map((agent) => ({ ...c, agent }))))(
  "$guide guidance and native references resolve for $agent",
  async ({ stack, fragments, guide, required, agent }) => {
    const result = await scaffoldAdapters({
      home: space.temp(),
      stack,
      fragments,
      agents: [agent],
    });
    const brief = readFileSync(join(result.project, ".stacks/BRIEF.md"), "utf8");
    expect(brief.includes(`docs/guidance/${guide}/index.md`)).toBe(true);
    for (const name of required) {
      const file = `docs/guidance/${guide}/${name}.md`;
      expect(result.written).toContain(file);
      expect(readFileSync(join(result.project, file), "utf8").length).toBeGreaterThan(300);
    }
    for (const file of result.written.filter((f) => /\.(md|mdc)$/.test(f))) {
      const source = readFileSync(join(result.project, file), "utf8");
      for (const match of source.matchAll(/\.claude\/rules\/[\w./-]+\.md/g)) {
        expect(existsSync(join(result.project, match[0])), `${file}: ${match[0]}`).toBe(true);
      }
      if (
        !file.startsWith("docs/guidance/") &&
        !/\.(claude|cursor)\/rules\//.test(file) &&
        !file.endsWith("SKILL.md")
      )
        continue;
      for (const match of source.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
        const target = match[1];
        if (!target || /^(https?:|mailto:)/.test(target)) continue;
        expect(
          existsSync(resolve(result.project, dirname(file), target)),
          `${file}: ${target}`,
        ).toBe(true);
      }
    }
  },
  15_000,
);

test.each(agents)("Effect bootstrap can start without a generated skill for %s", async (agent) => {
  const result = await scaffoldAdapters({
    home: space.temp(),
    stack: "typescript-cli",
    agents: [agent],
  });
  const guide = "docs/guidance/effect/effect.md";
  expect(result.written).toContain(guide);
  const source = readFileSync(join(result.project, guide), "utf8");
  expect(source).toContain("When the project skill does not exist");
  expect(source).toContain("After core compilation");
  expect(source).toContain("installed declarations");
  const services = readFileSync(
    join(result.project, "docs/guidance/typescript-cli/effect-services.md"),
    "utf8",
  );
  expect(services).toContain("When the project skill does not exist");
  expect(services).toContain("installed declarations");
});

test("Python's error model and acceptance require camelCase wire requestId", async () => {
  const { project } = await scaffoldAdapters({
    home: space.temp(),
    stack: "python-react",
    agents: ["codex"],
  });
  const brief = readFileSync(join(project, ".stacks/BRIEF.md"), "utf8");
  expect(brief.includes("requestId on the wire")).toBe(true);
  expect(brief.includes("404, 422 and 500")).toBe(true);
  expect(brief.includes("snake_case on the wire")).toBe(false);
});
