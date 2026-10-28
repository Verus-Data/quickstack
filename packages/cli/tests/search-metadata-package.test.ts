import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { beforeAll, expect, test } from "vitest";
import { name, version } from "../package.json";
import { cliRoot } from "./helpers/search-metadata";

let archive = "";
// Build and pack once: this exercises Bun's actual allowlist and bundled dependency graph.
beforeAll(() => {
  execFileSync("bun", ["run", "pack"], { cwd: cliRoot, encoding: "utf8", timeout: 60_000 });
  const filename = `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
  archive = join(cliRoot, "dist/pack", filename);
}, 65_000);

test("the packed CLI contains no maintainer scripts or OpenRouter client [4.5b#13]", () => {
  const members = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
  expect(members).toContain("package/dist/cli.mjs");
  expect(members.filter((path) => path.startsWith("package/scripts/"))).toEqual([]);
  const bundle = execFileSync("tar", ["-xOzf", archive, "package/dist/cli.mjs"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(bundle.includes("openrouter.ai")).toBe(false);
});
