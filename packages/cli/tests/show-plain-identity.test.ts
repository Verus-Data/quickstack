import { realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { quiet, runCli, terminal } from "./helpers/cli";
import { cardPath, put, seed, stamp } from "./helpers/search-metadata";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());

test("show omits plain copy when a sidecar names a different entry [4.5f#12]", async () => {
  const home = realpathSync(space.dir());
  const root = join(home, "registry");
  const ref = { kind: "stack", id: "sample" } as const;
  seed(root, ref);
  const card = await stamp(root, ref);
  put(
    cardPath(root, ref),
    JSON.stringify({
      ...card,
      id: "other",
      plain: { whatItIs: "The wrong project.", goodAt: ["Wrong work"], notGoodAt: ["Right work"] },
    }),
  );
  const result = await runCli(["show", "sample"], { home, env: quiet, host: { registry: root } });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).not.toContain("The wrong project.");
});

test("human show wraps long plain examples at the terminal width [4.5f#14]", async () => {
  const home = realpathSync(space.dir());
  const root = join(home, "registry");
  const ref = { kind: "stack", id: "sample" } as const;
  seed(root, ref);
  const card = await stamp(root, ref);
  const description = "A project idea with its own implementation work. ".repeat(5).trim();
  put(
    cardPath(root, ref),
    JSON.stringify({
      ...card,
      plain: { whatItIs: "A small command.", goodAt: ["Local work"], notGoodAt: ["Websites"] },
      projectExamples: [{ title: "Inspector", description }],
    }),
  );
  const result = await runCli(["show", "sample"], {
    home,
    env: quiet,
    host: { registry: root, ...terminal },
  });
  expect(result.status, result.stderr).toBe(0);
  const exampleAt = result.stdout.split("\n").findIndex((line) => line.startsWith("Example:"));
  const lines = result.stdout.split("\n");
  expect(exampleAt).toBeGreaterThan(-1);
  expect(lines[exampleAt]?.length).toBeLessThanOrEqual(80);
  expect(lines[exampleAt + 1]?.length).toBeLessThanOrEqual(80);
  expect(lines[exampleAt + 1]).toContain("project idea");
});
