import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { adapterWorkspace, scaffoldAdapters } from "./helpers/native-adapters";

const space = adapterWorkspace();
afterEach(() => space.cleanup());
const cases = ["astro-api", "typescript-api"].flatMap((stack) =>
  (["claude", "codex", "opencode", "cursor"] as const).map((agent) => ({ stack, agent })),
);

test.each(cases)("$stack ships tooling tests for $agent", async ({ stack, agent }) => {
  const result = await scaffoldAdapters({ home: space.temp(), stack, agents: [agent] });
  for (const file of [
    "tests/hooks/dev-logs.test.ts",
    "tests/hooks/dev-bg.test.ts",
    "tests/hooks/boundaries-lint.test.ts",
    "tests/hooks/helpers/dev.ts",
  ]) {
    expect(existsSync(join(result.project, file)), file).toBe(true);
  }
  symlinkSync(
    join(import.meta.dirname, "../node_modules"),
    join(result.project, "node_modules"),
    "dir",
  );
  const run = spawnSync(
    process.execPath,
    [
      join(result.project, "node_modules/vitest/vitest.mjs"),
      "run",
      "tests/hooks/dev-logs.test.ts",
      "-t",
      "outputRecord",
      "--maxWorkers",
      "1",
    ],
    {
      cwd: result.project,
      env: { HOME: result.project, PATH: process.env.PATH ?? "" },
      encoding: "utf8",
      timeout: 20_000,
    },
  );
  expect(run.error).toBeUndefined();
  expect(run.status, run.stdout + run.stderr).toBe(0);
  expect(run.stderr).toBe("");
  expect(run.stdout).toContain("12 passed");
});

test("the API tooling tests compile separately from NodeNext application tests", async () => {
  const result = await scaffoldAdapters({
    home: space.temp(),
    stack: "typescript-api",
    agents: ["claude", "codex"],
  });
  symlinkSync(
    join(import.meta.dirname, "../node_modules"),
    join(result.project, "node_modules"),
    "dir",
  );
  writeFileSync(join(result.project, "package.json"), JSON.stringify({ type: "module" }));
  mkdirSync(join(result.project, "src"));
  writeFileSync(join(result.project, "src/health.ts"), "export const healthy = true;\n");
  const strict = {
    target: "ES2023",
    lib: ["ES2023"],
    strict: true,
    noUncheckedIndexedAccess: true,
    verbatimModuleSyntax: true,
    erasableSyntaxOnly: true,
    skipLibCheck: true,
    noEmit: true,
  };
  for (const [name, config] of Object.entries({
    app: {
      compilerOptions: {
        ...strict,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        types: ["node"],
      },
      include: ["src/**/*.ts", "tests/**/*.ts"],
      exclude: ["tests/hooks", "tests/helpers/hooks.ts"],
    },
    tools: {
      compilerOptions: {
        ...strict,
        module: "ESNext",
        moduleResolution: "bundler",
        types: ["node", "bun"],
      },
      include: [
        "scripts/**/*.ts",
        ".claude/hooks/*.ts",
        "tests/hooks/**/*.ts",
        "tests/helpers/hooks.ts",
      ],
    },
  })) {
    const configFile = join(result.project, `tsconfig.${name}.json`);
    writeFileSync(configFile, JSON.stringify(config));
    const checked = spawnSync(join(result.project, "node_modules/.bin/tsc"), ["-p", configFile], {
      cwd: result.project,
      encoding: "utf8",
      timeout: 20_000,
    });
    expect(checked.error).toBeUndefined();
    expect(checked.status, checked.stdout + checked.stderr).toBe(0);
  }
}, 30_000);
