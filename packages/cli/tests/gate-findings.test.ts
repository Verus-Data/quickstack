import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { quiet, runCli, tempDir } from "./helpers/cli";
import { gitShim } from "./helpers/git";

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

test("astro-blog lists Testing Library's dom peer and the test types tsconfig needs", async () => {
  const text = await brief("astro-blog");
  expect(text).toContain(" @testing-library/dom,");
  expect(text).toMatch(/tsconfig\.json[^\n]*`vitest\/globals`[^\n]*`@testing-library\/jest-dom`/);
});

test("go-cli's main passes the version variables to cli.Execute itself", async () => {
  const text = await brief("go-cli");
  expect(text).not.toContain("calls `cli.Execute()`");
  expect(text).toContain("`cli.Execute(version, commit, date)`");
});

test("python-react's error envelope follows the wire casing", async () => {
  expect(await brief("python-react")).toMatch(/"requestId"\}\}`[^\n]*`request_id`/);
});

test("python-react runs dump_openapi.py as a module so it can import app", async () => {
  expect(await brief("python-react")).toContain("`uv run python -m scripts.dump_openapi`");
});

test("git-hooks keeps a staged-file linter quiet about files its config ignores", async () => {
  expect(await brief("python-react")).toContain("`--no-warn-ignored`");
});

/** `new <stack> app --sandbox` from the bundled registry, with a git shim on PATH. */
async function scaffold(stack: string) {
  const home = tempDir();
  dirs.push(home);
  const bin = gitShim(
    home.path,
    [
      '  rev-parse) echo "fatal: not a git repository" >&2; exit 128 ;;',
      "  init) /bin/mkdir .git ;;",
      "  config) exit 0 ;;",
    ].join("\n"),
  );
  const result = await runCli(["new", stack, "app", "--sandbox", "--no-launch", "--json"], {
    home: home.path,
    env: { ...quiet, PATH: bin },
    host: { registry: bundled, cwd: home.path },
  });
  expect(result.status).toBe(0);
  return join(home.path, "app");
}
const dirs: ReturnType<typeof tempDir>[] = [];
afterAll(() => {
  for (const dir of dirs.splice(0)) dir.cleanup();
});

test.each([
  ["astro-blog", ["lint", "check", "test", "coverage", "build", "format"]],
  [
    "go-cli",
    [
      "vet",
      "lint",
      "fmt",
      "fmt-check",
      "test",
      "test-integration",
      "coverage",
      "build",
      "smoke",
      "ci",
    ],
  ],
])(
  "%s ships allow rules for its make targets, so the agent needn't edit .claude/settings.json",
  async (stack, targets) => {
    const settings = JSON.parse(
      readFileSync(join(await scaffold(stack), ".claude", "settings.json"), "utf8"),
    ) as { permissions: { allow: string[] } };
    for (const target of targets)
      expect(settings.permissions.allow).toContain(`Bash(make ${target})`);
  },
);

test.each(["astro-blog", "go-cli", "python-react"])(
  "%s's brief says its make targets are already allowed",
  async (stack) => {
    expect(await brief(stack)).toContain(
      "merges in allow rules for its non-destructive root scripts",
    );
  },
);
