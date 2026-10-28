import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  bash,
  denyReason,
  type Fixture,
  makeFixture,
  runHook,
  withoutGitVars,
} from "../helpers/hooks";

const projects: Fixture[] = [];
afterEach(() => {
  for (const project of projects.splice(0)) project.cleanup();
});

function projectWithRr(enabled: boolean): Fixture {
  const project = makeFixture();
  projects.push(project);
  const options = {
    cwd: project.real,
    env: { ...withoutGitVars(process.env), GIT_CONFIG_COUNT: "0" },
  };
  execFileSync("git", ["init", "--quiet"], options);
  execFileSync("git", ["config", "--local", "stacks.rr", String(enabled)], options);
  return project;
}

function request(command: string, cwd: string, workingDirectory?: string) {
  return {
    ...bash(command),
    cwd,
    tool_input: {
      command,
      ...(workingDirectory === undefined ? {} : { working_directory: workingDirectory }),
    },
  };
}

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const cleanGitEnv = { GIT_CONFIG_COUNT: "0" };

describe("rr policy follows the command's project", () => {
  it("allows a scratch project's suite from an opted-in hook checkout", async () => {
    const opted = projectWithRr(true);
    const scratch = projectWithRr(false);
    const result = await runHook(
      "PreToolUse",
      "guard-commands",
      request("bun run test", scratch.real),
      { cwd: opted.real, env: cleanGitEnv },
    );
    expect(denyReason(result)).toBeUndefined();
  });

  it("uses the tool's working directory ahead of the session directory", async () => {
    const opted = projectWithRr(true);
    const scratch = projectWithRr(false);
    const result = await runHook(
      "PreToolUse",
      "guard-commands",
      request("bun run test", opted.real, scratch.real),
      { cwd: opted.real, env: cleanGitEnv },
    );
    expect(denyReason(result)).toBeUndefined();
  });

  it.each(["cd", "--cwd"])("follows an explicit %s to a scratch project", async (mode) => {
    const opted = projectWithRr(true);
    const scratch = projectWithRr(false);
    const command =
      mode === "cd"
        ? `cd ${quote(scratch.real)} && bun run test`
        : `bun run --cwd ${quote(scratch.real)} test`;
    const result = await runHook("PreToolUse", "guard-commands", request(command, opted.real), {
      cwd: opted.real,
      env: cleanGitEnv,
    });
    expect(denyReason(result)).toBeUndefined();
  });

  it("still queues a suite whose tool directory opts in", async () => {
    const opted = projectWithRr(true);
    const scratch = projectWithRr(false);
    const result = await runHook(
      "PreToolUse",
      "guard-commands",
      request("bun run check", scratch.real, opted.real),
      { cwd: scratch.real, env: cleanGitEnv },
    );
    expect(denyReason(result)).toContain("rr check");
  });

  it("still queues a suite after changing into an opted-in checkout", async () => {
    const opted = projectWithRr(true);
    const scratch = projectWithRr(false);
    const result = await runHook(
      "PreToolUse",
      "guard-commands",
      request(`cd ${quote(opted.real)} && bun run check`, scratch.real),
      { cwd: scratch.real, env: cleanGitEnv },
    );
    expect(denyReason(result)).toContain("rr check");
  });

  it("does not treat script arguments after -- as the package directory", async () => {
    const opted = projectWithRr(true);
    const scratch = projectWithRr(false);
    const result = await runHook(
      "PreToolUse",
      "guard-commands",
      request(`bun run test -- --cwd ${quote(scratch.real)}`, opted.real),
      { cwd: opted.real, env: cleanGitEnv },
    );
    expect(denyReason(result)).toContain("rr check");
  });

  it("permits a scoped Bun TSX test inside an opted-in project", async () => {
    const opted = projectWithRr(true);
    const result = await runHook(
      "PreToolUse",
      "guard-commands",
      request("bun test ./tests/tui/app.test.tsx", opted.real),
      { cwd: opted.real, env: cleanGitEnv },
    );
    expect(denyReason(result)).toBeUndefined();
  });
});
