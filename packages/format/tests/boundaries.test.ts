import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { tempDir } from "./helpers/files";

const pkg = join(import.meta.dirname, "..");
const repo = join(pkg, "../..");

function lint(source: string) {
  const dir = tempDir();
  try {
    mkdirSync(join(dir.path, "src"));
    writeFileSync(
      join(dir.path, "biome.json"),
      JSON.stringify({
        plugins: [join(pkg, "biome-plugins/no-platform-imports.grit")],
      }),
    );
    const file = join(dir.path, "src/probe.ts");
    writeFileSync(file, `${source}\n`);
    return spawnSync(join(repo, "node_modules/.bin/biome"), ["lint", file], {
      cwd: dir.path,
      encoding: "utf8",
    });
  } finally {
    dir.cleanup();
  }
}

function lintConfigured(source: string) {
  // Stay under the package so Biome resolves its real config and the root it extends.
  const dir = tempDir(import.meta.dirname);
  try {
    mkdirSync(join(dir.path, "src"));
    const file = join(dir.path, "src/probe.ts");
    writeFileSync(file, `${source}\n`);
    return spawnSync(
      join(repo, "node_modules/.bin/biome"),
      ["lint", "--config-path", join(pkg, "biome.json"), file],
      { cwd: pkg, encoding: "utf8" },
    );
  } finally {
    dir.cleanup();
  }
}

test("format typechecks without Node or Bun ambient types [4.0a#2]", () => {
  const tsc = join(repo, "node_modules/.bin/tsc");
  const shown = spawnSync(tsc, ["--showConfig", "-p", join(pkg, "tsconfig.json")], {
    encoding: "utf8",
  });
  expect(shown.status, shown.stdout + shown.stderr).toBe(0);
  const config = Schema.decodeUnknownSync(
    Schema.Struct({
      compilerOptions: Schema.Struct({ types: Schema.Array(Schema.String) }),
    }),
  )(JSON.parse(shown.stdout));
  expect(config.compilerOptions.types).toEqual([]);
  const result = spawnSync(tsc, ["--noEmit", "-p", join(pkg, "tsconfig.json")], {
    encoding: "utf8",
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("");
});

test.each([
  'import "node:fs";',
  'import { readFile } from "node:fs/promises"; export { readFile };',
  'import { x } from "bun"; export { x };',
  'import { NodeServices } from "@effect/platform-node"; export { NodeServices };',
  'import { BunServices } from "@effect/platform-bun"; export { BunServices };',
  'export { readFile } from "node:fs/promises";',
  'export const load = () => import("node:fs");',
])("platform import fails the real Grit probe: %s [4.0a#2]", (source) => {
  const result = lint(source);
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).toMatch(/src\/probe\.ts:\d+:\d+ plugin/);
});

test("the Grit boundary permits Effect and relative imports [4.0a#2]", () => {
  const result = lint(
    'import { Effect } from "effect"; import { entry } from "./entry"; export { Effect, entry };',
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

test("the package's actual Biome config enables the boundary [4.0a#2]", () => {
  const result = lintConfigured('import "node:fs";');
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).toMatch(/src\/probe\.ts:\d+:\d+ plugin/);
});

test("the package's actual Biome config permits portable source [4.0a#2]", () => {
  const result = lintConfigured(
    'import { Schema } from "effect";\nexport const Name = Schema.String;',
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
