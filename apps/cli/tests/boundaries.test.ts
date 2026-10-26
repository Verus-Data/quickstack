import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { tempDir } from "./helpers/cli";

const probes = [
  ['import { x } from "bun"; export { x };', "Platform code belongs"],
  ['import { x } from "zod"; export { x };', "Use Schema from effect"],
  ['console.log("x");', "Results use Output"],
  ["export const value = process.env;", "Read environment"],
  ["export const value = process.stdout;", "Only bin.ts"],
  ["export const value = process.stderr;", "Use Output.note"],
  ["export const value = Bun.version;", "The Bun global"],
] as const;
test.each(probes)("Grit enforces %s", (source, message) => {
  const dir = tempDir();
  try {
    mkdirSync(join(dir.path, "src/core"), { recursive: true });
    writeFileSync(
      join(dir.path, "biome.json"),
      JSON.stringify({ plugins: [join(process.cwd(), "biome-plugins/boundaries.grit")] }),
    );
    const file = join(dir.path, "src/core/probe.ts");
    writeFileSync(file, `${source}\n`);
    const result = spawnSync(join(process.cwd(), "node_modules/.bin/biome"), ["lint", file], {
      cwd: dir.path,
      encoding: "utf8",
    });
    expect(result.stdout + result.stderr).toContain(message);
    expect(result.status).not.toBe(0);
  } finally {
    dir.cleanup();
  }
});
