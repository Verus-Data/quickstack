import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { tempDir } from "./helpers/cli";

const pkg = join(import.meta.dirname, "..");

const nodeProcess = [
  'process.kill(1, "SIGTERM");',
  'process.on("SIGINT", () => {});',
  "process.exit(1);",
  'process.once("exit", () => {});',
  'process.off("SIGINT", () => {});',
  'process.addListener("SIGTERM", () => {});',
  'process.removeListener("SIGTERM", () => {});',
  'process.prependListener("SIGHUP", () => {});',
  'import { kill } from "node:process"; export { kill };',
  'import { spawn } from "node:child_process"; export { spawn };',
  'import { spawn } from "child_process"; export { spawn };',
  'import { NodeServices } from "@effect/platform-node"; export { NodeServices };',
] as const;
const probes = [
  ['import { x } from "bun"; export { x };', "Platform code belongs"],
  ['import { x } from "zod"; export { x };', "Use Schema from effect"],
  ['console.log("x");', "Results use Output"],
  ["export const value = process.env;", "Read environment"],
  ["export const value = process.stdout;", "Only bin.ts"],
  ["export const value = process.stderr;", "Use Output.note"],
  ["export const value = Bun.version;", "The Bun global"],
  ...nodeProcess.map((source) => [source, "Node process APIs belong"] as const),
] as const;
/** Lints `source` written to `path` under a temporary root with only the boundary plugin. */
function lint(path: string, source: string) {
  const dir = tempDir();
  try {
    mkdirSync(join(dir.path, path, ".."), { recursive: true });
    writeFileSync(
      join(dir.path, "biome.json"),
      JSON.stringify({ plugins: [join(pkg, "biome-plugins/boundaries.grit")] }),
    );
    const file = join(dir.path, path);
    writeFileSync(file, `${source}\n`);
    return spawnSync(join(pkg, "node_modules/.bin/biome"), ["lint", file], {
      cwd: dir.path,
      encoding: "utf8",
    });
  } finally {
    dir.cleanup();
  }
}
test.each(probes)("Grit enforces %s", (source, message) => {
  const result = lint("src/core/probe.ts", source);
  expect(result.stdout + result.stderr).toContain(message);
  expect(result.status).not.toBe(0);
});
test.each(nodeProcess)("Grit allows %s in src/platform/process.ts", (source) => {
  const result = lint("src/platform/process.ts", source);
  expect(result.stdout + result.stderr).not.toContain("Node process APIs belong");
  expect(result.status).toBe(0);
});
