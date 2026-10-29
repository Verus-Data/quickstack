import { realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { quiet, runCli, terminal } from "./helpers/cli";
import { put } from "./helpers/search-metadata";
import { stack } from "./helpers/show-preview";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());

test("human show uses the exact card for names that share a suffix [4.5f#14]", async () => {
  const home = realpathSync(space.dir());
  const root = join(home, "registry");
  stack(
    root,
    "sample",
    'deps:\n  app: [react, react-dom]\n  dev: ["@types/react", "@types/react-dom"]',
  );
  const source = { by: "author", reviewedAt: "2026-10-29" };
  put(
    join(root, "deps/npm.json"),
    JSON.stringify({
      formatVersion: 1,
      cards: {
        "@types/react": { whatItIs: "React type definitions.", source },
        "@types/react-dom": { whatItIs: "React DOM type definitions.", source },
        react: { whatItIs: "A library for building interfaces.", source },
        "react-dom": { whatItIs: "A browser renderer for React.", source },
      },
    }),
  );
  const result = await runCli(["show", "sample"], {
    home,
    env: quiet,
    host: { registry: root, ...terminal },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("  react: A library for building interfaces.");
  expect(result.stdout).toContain("  react-dom: A browser renderer for React.");
  expect(result.stdout).not.toContain("  react: React type definitions.");
});

test("human show leaves a cross-ecosystem name undefined [4.5f#18]", async () => {
  const home = realpathSync(space.dir());
  const root = join(home, "registry");
  stack(root, "sample", "deps:\n  app: [shared]");
  const source = { by: "author", reviewedAt: "2026-10-29" };
  for (const [ecosystem, whatItIs] of [
    ["npm", "The npm package."],
    ["pypi", "The Python package."],
  ])
    put(
      join(root, `deps/${ecosystem}.json`),
      JSON.stringify({
        formatVersion: 1,
        cards: { shared: { whatItIs, source } },
      }),
    );
  const result = await runCli(["show", "sample"], {
    home,
    env: quiet,
    host: { registry: root, ...terminal },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/^ {2}shared$/m);
  expect(result.stdout).not.toContain("The npm package.");
  expect(result.stdout).not.toContain("The Python package.");
});

test("human show keeps none for an empty app role [4.5f#14]", async () => {
  const home = realpathSync(space.dir());
  const root = join(home, "registry");
  stack(root, "sample", "deps:\n  app: []");
  const result = await runCli(["show", "sample"], {
    home,
    env: quiet,
    host: { registry: root, ...terminal },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/^Dependencies \(app\): none$/m);
});
