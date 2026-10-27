import { join } from "node:path";
import { expect, test } from "vitest";
import { quiet, runCli } from "./helpers/cli";

// Briefs as the 1.6b gate runs composed them (`new <stack> --sandbox`). Each test pins a place
// where a run's agent stopped, guessed or worked around the brief.
const bundled = join(import.meta.dirname, "..", "registry");

async function brief(stack: string): Promise<string> {
  const result = await runCli(["validate", "--brief", stack, "--sandbox", "--json"], {
    env: { ...quiet, PATH: process.env.PATH ?? "" },
    host: { registry: bundled },
  });
  expect(result.status).toBe(0);
  return (JSON.parse(result.stdout) as { brief: string }).brief;
}

test("go-cli gives a module path to fall back on instead of stopping to ask for an owner", async () => {
  const text = await brief("go-cli");
  expect(text).not.toContain("Ask if neither exists");
  expect(text).toMatch(/If neither exists, use the bare `<project-slug>`/);
});

test("astro-blog names a create-astro command whose --yes reaches create-astro", async () => {
  const text = await brief("astro-blog");
  // `bun create astro -y`: bun takes -y itself and fails with "Invalid Argument '-y'".
  expect(text).not.toContain("`bun create astro`");
  expect(text).toContain("`bunx create-astro@latest`");
});

test("astro-blog says tests importing astro:content run in the node environment", async () => {
  expect(await brief("astro-blog")).toMatch(/astro:content[^\n]*@vitest-environment node/);
});

test.each(["astro-blog", "python-react"])(
  "%s keeps Prettier off .quickstacks/ and .claude/",
  async (stack) => {
    expect(await brief(stack)).toMatch(
      /`\.prettierignore`[^\n]*`\.quickstacks\/`[^\n]*`\.claude\/`/,
    );
  },
);

test("the sandbox CI workflow pins a release tag when an action publishes no major tag", async () => {
  const text = await brief("python-react");
  expect(text).not.toContain("Major-tag action refs are fine;");
  expect(text).toContain("pin its latest release tag");
});

test.each(["astro-blog", "go-cli", "python-react"])(
  "%s tells the agent edits under .claude/ and to lefthook.yml need the user's approval",
  async (stack) => {
    expect(await brief(stack)).toMatch(
      /Claude Code asks the user before any edit under `\.claude\/` or to `lefthook\.yml`/,
    );
  },
);

test("agent-ops says a formatter alone doesn't count as the linter lint-on-write runs", async () => {
  expect(await brief("astro-blog")).toContain("a formatter alone doesn't count");
});
