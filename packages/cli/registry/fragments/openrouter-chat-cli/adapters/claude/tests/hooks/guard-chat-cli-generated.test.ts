import { afterAll, describe, expect, it } from "vitest";
import { denyReason, makeFixture, REPO, runHook, write } from "../helpers/hooks";

const run = (filePath: string, env?: Record<string, string>) =>
  runHook("PreToolUse", "guard-chat-cli-generated", write(filePath, "x"), { env });

describe.concurrent("guard-generated denies", () => {
  it.each([
    [`${REPO}/dist/cli`, "is build output"],
    ["dist/SHA256SUMS", "is build output"],
    ["coverage/index.html", "is a coverage report"],
    [`${REPO}/bun.lock`, "bun.lock is written by bun"],
    [`${REPO}/tests/fixtures/openrouter/tool-call.sse`, "is a recorded OpenRouter response"],
    ["tests/fixtures/openrouter/text.sse", "bun run record:openrouter"],
  ])("%s", async (filePath, reason) => {
    expect(denyReason(await run(filePath))).toContain(reason);
  });
});

describe.concurrent("guard-generated allows", () => {
  it.each([
    `${REPO}/src/bin.ts`,
    `${REPO}/src/dist/helper.ts`,
    `${REPO}/tests/fixtures/other/case.json`,
    "distribution/notes.ts",
    "/somewhere/else/dist/cli",
  ])("%s", async (filePath) => {
    const result = await run(filePath);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("guard-generated with a project dir that isn't symlink-resolved", () => {
  const fixture = makeFixture();
  afterAll(fixture.cleanup);

  it("compares against the project dir as given", async () => {
    const result = await run(`${fixture.dir}/dist/cli`, { CLAUDE_PROJECT_DIR: fixture.dir });
    expect(denyReason(result)).toContain("is build output");
  });

  it("matches the symlink-resolved path too", async () => {
    const result = await run(`${fixture.real}/dist/cli`, { CLAUDE_PROJECT_DIR: fixture.dir });
    expect(denyReason(result)).toContain("is build output");
  });

  it("ignores a trailing slash on the project dir", async () => {
    const result = await run(`${fixture.dir}/bun.lock`, { CLAUDE_PROJECT_DIR: `${fixture.dir}/` });
    expect(denyReason(result)).toContain("bun.lock is written by bun");
  });
});
