import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { denyReason, edit, type Fixture, makeFixture, runHook, write } from "../helpers/hooks";

// Built from pieces so this file never carries the shapes the guard denies.
const home = (user: string, rest: string) => ["", "Users", user, rest].join("/");
const projects = (rest: string) => ["~", "Projects", rest].join("/");

let project: Fixture;
beforeEach(() => {
  project = makeFixture();
});
afterEach(() => project.cleanup());
const options = () => ({ cwd: project.dir, env: { CLAUDE_PROJECT_DIR: project.dir } });
const file = (rel: string) => join(project.dir, rel);

describe("repo content guard", () => {
  it.each([
    ["a home path", `see ${home("someone", "work/repo/README.md")}`],
    ["a Linux home path", `cd ${["", "home", "ci", "app"].join("/")}`],
    ["a ~/Projects path", `the layout in ${projects("other-repo/docs")}`],
    ["a $HOME/Projects path", `ls ${["$HOME", "Projects", "x"].join("/")}`],
  ])("denies %s in a tracked file", async (_, content) => {
    const reason = denyReason(
      await runHook(
        "PreToolUse",
        "guard-repo-content",
        write(file("docs/a.md"), content),
        options(),
      ),
    );
    expect(reason).toContain("BLOCKED");
    expect(reason).toContain("docs/a.md");
  });

  it("checks the text an Edit adds", async () => {
    const reason = denyReason(
      await runHook(
        "PreToolUse",
        "guard-repo-content",
        edit(file("AGENTS.md"), home("dev", "notes.md")),
        options(),
      ),
    );
    expect(reason).toContain("home directory");
  });

  it.each([
    "a repo-relative path: packages/cli/src/bin.ts",
    "a user's home, generically: ~/.config/app",
    "the home directory of a user named in prose",
    "/usr/local/bin/bun and /home alone",
  ])("allows %s", async (content) => {
    expect(
      denyReason(
        await runHook(
          "PreToolUse",
          "guard-repo-content",
          write(file("docs/a.md"), content),
          options(),
        ),
      ),
    ).toBeUndefined();
  });

  it("ignores files outside the project and files git ignores", async () => {
    expect(
      denyReason(
        await runHook(
          "PreToolUse",
          "guard-repo-content",
          write("/elsewhere/notes.md", home("someone", "x")),
          options(),
        ),
      ),
    ).toBeUndefined();
    spawnSync("git", ["init", "-q"], { cwd: project.dir });
    writeFileSync(file(".gitignore"), "logs/\n");
    mkdirSync(file("logs"));
    expect(
      denyReason(
        await runHook(
          "PreToolUse",
          "guard-repo-content",
          write(file("logs/cli.log"), home("someone", "x")),
          options(),
        ),
      ),
    ).toBeUndefined();
  });

  it("denies patterns from the local pattern file and skips malformed lines", async () => {
    mkdirSync(file(".claude/hooks"), { recursive: true });
    writeFileSync(
      file(".claude/hooks/private-patterns.local"),
      "# local names\n\\binternal-host\\b\n(unclosed\n",
    );
    const reason = denyReason(
      await runHook(
        "PreToolUse",
        "guard-repo-content",
        write(file("plans/a.md"), "deploys go to internal-host first"),
        options(),
      ),
    );
    expect(reason).toContain("private pattern");
    expect(
      denyReason(
        await runHook(
          "PreToolUse",
          "guard-repo-content",
          write(file("plans/a.md"), "nothing private here"),
          options(),
        ),
      ),
    ).toBeUndefined();
  });
});
