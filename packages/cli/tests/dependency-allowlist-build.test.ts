import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DependencyAllowlist } from "@steamfield/stacks-format";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { entryPath, fixture, privateKey, proof } from "./fixtures/index/harness";
import { tempDir } from "./helpers/cli";
import { writeLedger } from "./helpers/ledger";
import { reviewSearchFixture } from "./helpers/search-fixture";

test("build:index names the bundled entry and dependency missing from the allowlist [4.2d#3]", async () => {
  const temporary = tempDir();
  try {
    const built = await fixture(temporary.path);
    const file = join(entryPath(built.registry, "stack", "sample"), "STACK.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "tags: [scripts]",
        "tags: [scripts]\ndeps:\n  runtime: [missing-public-package]",
      ),
    );
    const allowlist = Schema.decodeUnknownSync(DependencyAllowlist)({
      formatVersion: 1,
      generatedAt: "2026-10-28T00:00:00Z",
      names: { npm: ["react"], pypi: [], go: [], crates: [] },
    });
    writeFileSync(join(built.registry, "allowlist.json"), JSON.stringify(allowlist));
    reviewSearchFixture(built.registry);
    writeLedger(built.registry, [await proof(built.registry)]);
    execFileSync("git", ["add", "packages/cli/registry"], { cwd: built.root });
    execFileSync("git", ["commit", "--quiet", "-m", "fixture: unknown dependency"], {
      cwd: built.root,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.invalid",
        GIT_COMMITTER_NAME: "Fixture",
        GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      },
    });
    const result = await built.invoke([
      "--out",
      built.out,
      "--previous",
      "none",
      "--key",
      privateKey,
    ]);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("sample");
    expect(`${result.stdout}\n${result.stderr}`).toContain("missing-public-package");
  } finally {
    temporary.cleanup();
  }
}, 90_000);
