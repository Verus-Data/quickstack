import { realpathSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { ValidateReport } from "../src/schemas/validate";
import { quiet, runCli } from "./helpers/cli";
import { copyVocabulary, put, seed, stamp } from "./helpers/search-metadata";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());

test("validate warns when dependency prose names a version [4.5f#3]", async () => {
  const home = realpathSync(space.dir());
  const root = join(home, "registry");
  const ref = { kind: "stack", id: "sample" } as const;
  seed(root, ref);
  await stamp(root, ref);
  copyVocabulary(root);
  put(
    join(root, "allowlist.json"),
    JSON.stringify({
      formatVersion: 1,
      generatedAt: "2026-10-29T00:00:00Z",
      names: { npm: ["hono"], pypi: [], go: [], crates: [] },
    }),
  );
  put(
    join(root, "deps/npm.json"),
    JSON.stringify({
      formatVersion: 1,
      cards: {
        hono: {
          whatItIs: "A framework for React 19.1 projects.",
          source: { by: "author", reviewedAt: "2026-10-29" },
        },
      },
    }),
  );
  const result = await runCli(["validate", "--json"], {
    home,
    env: quiet,
    host: { registry: root },
  });
  const report = Schema.decodeUnknownSync(ValidateReport)(JSON.parse(result.stdout));
  expect(result.status).toBe(report.findings.some(({ severity }) => severity === "error") ? 2 : 0);
  expect(report.findings.filter(({ check }) => check === "plain-versioned")).toMatchObject([
    { severity: "warning", file: "deps/npm.json" },
  ]);
});
