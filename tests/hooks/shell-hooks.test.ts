import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type Fixture, makeFixture, runHook } from "../helpers/hooks";

let project: Fixture;
beforeEach(() => {
  project = makeFixture();
});
afterEach(() => project.cleanup());
const options = () => ({
  cwd: project.dir,
  env: { CLAUDE_PROJECT_DIR: project.dir, TMPDIR: project.dir },
});
test("destructive shell hook denies actual reset and allows status", async () => {
  const denied = await runHook(
    "PreToolUse",
    "block-destructive",
    { tool_name: "Bash", tool_input: { command: "git reset --hard" } },
    options(),
  );
  expect(denied.stdout).toContain('"deny"');
  expect(
    (
      await runHook(
        "PreToolUse",
        "block-destructive",
        { tool_name: "Bash", tool_input: { command: "git status" } },
        options(),
      )
    ).stdout,
  ).toBe("");
});
test("destructive shell hook judges a force push by the push's own arguments", async () => {
  const decide = async (command: string) =>
    (
      await runHook(
        "PreToolUse",
        "block-destructive",
        { tool_name: "Bash", tool_input: { command } },
        options(),
      )
    ).stdout;
  for (const command of [
    "git push --force origin main",
    "git push -f origin main",
    "git push origin +feature:main",
    "git push origin feature:main && git push -f origin other",
  ])
    expect(await decide(command), command).toContain('"deny"');
  for (const command of [
    'git push origin feature:main 2>&1 | grep -E "Tests +[0-9]"',
    "git push origin feature:main; grep -f patterns.txt log",
    "git push --force-with-lease origin feature",
  ])
    expect(await decide(command), command).toBe("");
});
test("destructive shell hook asks the user before a publish instead of denying it", async () => {
  for (const command of ["npm publish ./pkg.tgz --access public", "bun publish"]) {
    const result = await runHook(
      "PreToolUse",
      "block-destructive",
      { tool_name: "Bash", tool_input: { command } },
      options(),
    );
    expect(result.stdout, command).toContain('"ask"');
    expect(result.stdout, command).not.toContain('"deny"');
  }
  const dryRun = await runHook(
    "PreToolUse",
    "block-destructive",
    { tool_name: "Bash", tool_input: { command: "npm publish --dry-run" } },
    options(),
  );
  expect(dryRun.stdout).toBe("");
});
test("secret hook denies a PEM marker and allows environment lookup", async () => {
  const file = join(project.dir, "key.ts");
  const marker = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  expect(
    (
      await runHook(
        "PreToolUse",
        "detect-secrets",
        { tool_name: "Write", tool_input: { file_path: file, content: marker } },
        options(),
      )
    ).stdout,
  ).toContain('"deny"');
  expect(
    (
      await runHook(
        "PreToolUse",
        "detect-secrets",
        {
          tool_name: "Write",
          tool_input: { file_path: file, content: "export const value = process.env.API_KEY;" },
        },
        options(),
      )
    ).stdout,
  ).toBe("");
});
test("session-start produces an advisory for missing local environment", async () => {
  writeFileSync(join(project.dir, ".env.example"), "LOG_LEVEL=warn\n");
  const result = await runHook("SessionStart", "session-start", {}, options());
  expect(result.code).toBe(0);
  expect(result.stdout).toContain(".env");
});
test("lint feedback and stop formatting are limited to recorded session files", async () => {
  writeFileSync(
    join(project.dir, "biome.json"),
    JSON.stringify({
      formatter: { indentStyle: "space" },
      linter: { rules: { preset: "recommended" } },
    }),
  );
  const edited = join(project.dir, "edited.ts"),
    other = join(project.dir, "other.ts");
  const source = "export const item={n:1};\n";
  writeFileSync(edited, source);
  writeFileSync(other, source);
  const payload = {
    session_id: "cli-shell-proof",
    cwd: project.dir,
    tool_name: "Write",
    tool_input: { file_path: edited },
  };
  const lint = await runHook("PostToolUse", "lint-on-write", payload, options());
  expect(lint.stdout).toContain("format");
  expect((await runHook("Stop", "format-changed", payload, options())).code).toBe(0);
  expect(readFileSync(edited, "utf8")).toContain("item = { n: 1 }");
  expect(readFileSync(other, "utf8")).toBe(source);
  expect((await runHook("Stop", "format-changed", {}, options())).stdout).toBe("");
});
