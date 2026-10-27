import { cpSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { ndjson, quiet, runCli, tempDir, terminal } from "./helpers/cli";
import { minimal, newRegistry, smallRegistry, writeEntry } from "./helpers/registry";

// Who reads the output: a human only at a terminal with no agent detected; an agent everywhere
// else (its shell, a pipe, CI); `--json` is the machine contract either way.

const dirs: Array<{ cleanup: () => void }> = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) dir.cleanup();
});
function temp() {
  const dir = tempDir();
  dirs.push(dir);
  return dir.path;
}
const agentShell = { CLAUDECODE: "1" };

describe("the audience is picked once per invocation from the terminal and agent detection", () => {
  // `doctor` at info level writes one command record; where it lands shows the audience.
  const cases = [
    { name: "a terminal with no agent is human", host: terminal, env: {}, human: true },
    {
      name: "a terminal under an agent is an agent",
      host: terminal,
      env: agentShell,
      human: false,
    },
    { name: "a pipe with no agent is an agent", host: {}, env: {}, human: false },
    { name: "a pipe under an agent is an agent", host: {}, env: agentShell, human: false },
  ];
  test.each(cases)("$name", async ({ host, env, human }) => {
    const home = temp();
    const file = join(home, "cli.jsonl");
    const result = await runCli(["doctor"], {
      home,
      host,
      env: { LOG_LEVEL: "info", QUICKSTACKS_LOG_FILE: file, ...env },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Configuration: ok\n");
    if (human) expect(result.stderr).toMatch(/^\S+ INFO command success\s*\n$/);
    else expect(result.stderr).toBe("");
    // The log file gets the record whoever reads the output.
    expect(ndjson(readFileSync(file, "utf8"))).toEqual([
      expect.objectContaining({ msg: "command", outcome: "success" }),
    ]);
  });
  test.each(cases)("--json wins: $name", async ({ host, env }) => {
    const home = temp();
    const file = join(home, "cli.jsonl");
    const result = await runCli(["doctor", "--json"], {
      home,
      host,
      env: { LOG_LEVEL: "info", QUICKSTACKS_LOG_FILE: file, ...env },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ configErrors: [] });
    expect(result.stderr).toBe("");
    expect(ndjson(readFileSync(file, "utf8"))).toHaveLength(1);
  });
});

describe("agent output carries no log lines", () => {
  test("a failure is its message and detail lines only, at the default level", async () => {
    const result = await runCli(["doctr"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Invalid command. Run --help for usage.\n  Did you mean: doctor?\n");
    const human = await runCli(["doctr"], { host: terminal });
    expect(human.stderr).toMatch(/\n\S+ ERROR command failure\s*\n$/);
  });
  test("a warning goes to the log file, not stderr", async () => {
    const home = temp();
    const file = join(home, "cli.jsonl");
    const missing = join(home, "nope");
    const result = await runCli(["list"], {
      home,
      env: { QUICKSTACKS_REGISTRY_DIR: missing, LOG_LEVEL: "warn", QUICKSTACKS_LOG_FILE: file },
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(ndjson(readFileSync(file, "utf8"))).toEqual([
      expect.objectContaining({
        level: "warn",
        msg: `QUICKSTACKS_REGISTRY_DIR is not a directory: ${missing}`,
      }),
    ]);
  });
});

describe("new for an agent", () => {
  const newCli = (home: string, args: string[], options: { cwd?: string; human?: boolean } = {}) =>
    runCli(["new", "fixture-stack", ...args], {
      home,
      env: quiet,
      host: {
        registry: newRegistry,
        cwd: options.cwd ?? home,
        ...(options.human ? terminal : {}),
      },
    });

  test("leaves out the absolute project path and the file listing the brief repeats", async () => {
    const home = temp();
    const agent = await newCli(home, ["app", "--sandbox"]);
    expect(agent.status).toBe(0);
    expect(agent.stderr).toBe("");
    expect(agent.stdout.split("\n")).toEqual([
      "Created app from fixture-stack (sandbox).",
      "Fragments: base-req, hooked, own-repo, ran-check, tooled",
      "Agents: claude",
      "Git: git not found; no repository",
      expect.stringMatching(/^Brief: \.quickstacks\/BRIEF\.md \(\d+ words\)$/),
      "Missing tools (the brief tells the agent):",
      "  qs-stack-tool not found (needed by fixture-stack)",
      "  qs-fragment-tool not found (needed by tooled; skip with --without tooled)",
      "",
      "Next: cd app, then start your coding agent there with this prompt:",
      "  Read .quickstacks/BRIEF.md and carry it out. It is your full task for this project; you're done when `quickstacks verify` passes.",
      "",
    ]);
    const human = await newCli(home, ["app2", "--sandbox"], { human: true });
    expect(human.stdout).toContain(`Project: ${join(home, "app2")}\n`);
    expect(human.stdout).toMatch(/\nWrote \d+ files:\n/);
    const json = await newCli(home, ["app3", "--json"]);
    expect(JSON.parse(json.stdout).project).toBe(join(home, "app3"));
  });

  test("names untrusted entries' directories relative to the working directory", async () => {
    const home = temp();
    cpSync(newRegistry, join(home, "registry"), { recursive: true });
    const run = (args: string[], host = {}) =>
      runCli(["new", "fixture-stack", ...args], {
        home,
        env: { ...quiet, QUICKSTACKS_REGISTRY_DIR: join(home, "registry") },
        host: { cwd: home, ...host },
      });
    const agent = await run(["app"]);
    expect(agent.status).toBe(0);
    expect(agent.stdout).toContain(": registry/stacks/fixture-stack\n");
    expect(agent.stdout).not.toContain(home);
    const human = await run(["app2"], terminal);
    expect(human.stdout).toContain(`: ${join(home, "registry", "stacks", "fixture-stack")}\n`);
  });

  test("a project outside the working directory keeps its absolute path", async () => {
    const home = temp();
    const app = join(temp(), "app");
    const agent = await newCli(home, [app]);
    expect(agent.status).toBe(0);
    expect(agent.stdout).toContain(`Created ${app} from fixture-stack.\n`);
    expect(agent.stdout).toContain(`Next: cd ${app}, then`);
  });

  test("a directory whose name starts with two dots is still inside", async () => {
    const home = temp();
    const agent = await newCli(home, ["..app"]);
    expect(agent.status).toBe(0);
    expect(agent.stdout).toContain("Created ..app from fixture-stack.\n");
    expect(agent.stdout).toContain("Next: cd ..app, then");
  });

  test("the working directory and the project reached by different real paths still nest", async () => {
    // macOS: the temp dir is /var/..., really /private/var/...; elsewhere a symlink plays /var.
    const home = temp();
    const real = realpathSync(home);
    const link = join(temp(), "link");
    symlinkSync(real, link);
    for (const [cwd, dir] of [
      [real, join(link, "via-link")],
      [link, join(real, "via-real")],
      [home, join(real, "from-given")],
    ] as const) {
      const agent = await newCli(home, [dir], { cwd });
      expect(agent.status).toBe(0);
      const name = dir.split("/").at(-1);
      expect(agent.stdout).toContain(`Created ${name} from fixture-stack.\n`);
      expect(agent.stdout).toContain(`Next: cd ${name}, then`);
    }
  });

  test("a working directory that is a symlink to the project's parent", async () => {
    const parent = temp();
    const link = join(temp(), "parent-link");
    symlinkSync(parent, link);
    mkdirSync(join(parent, "sub"));
    const agent = await newCli(parent, ["app"], { cwd: link });
    expect(agent.status).toBe(0);
    expect(agent.stdout).toContain("Created app from fixture-stack.\n");
    expect(readFileSync(join(parent, "app", ".quickstacks", "BRIEF.md"), "utf8")).toMatch(/^# /);
  });
});

describe("list for an agent", () => {
  test("keeps each description whole on one line", async () => {
    const home = temp();
    const user = join(home, "config", "quickstacks");
    const description = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    writeEntry(
      user,
      "stack",
      "long",
      minimal("stack", "long").replace("long description.", description),
    );
    for (const host of [{}, { stdoutIsTTY: true, stdoutColumns: 50 }]) {
      const agent = await runCli(["list", "stacks"], {
        home,
        env: { ...quiet, ...agentShell },
        host: { registry: smallRegistry, ...host },
      });
      expect(agent.status).toBe(0);
      expect(agent.stdout).toContain(`\n  long     user\n    ${description}\n`);
    }
  });

  test("names a rejected entry's directory relative to the working directory", async () => {
    const home = temp();
    const user = join(home, "config", "quickstacks");
    writeEntry(user, "stack", "broken", minimal("stack", "broken", "extra: 1"));
    const agent = await runCli(["list"], {
      home,
      env: quiet,
      host: { registry: smallRegistry },
    });
    expect(agent.status).toBe(0);
    expect(agent.stdout).toContain("\n    config/quickstacks/stacks/broken\n");
  });
});

test("--help documents --json", async () => {
  const result = await runCli(["--help"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toMatch(/--json +Write one JSON result to stdout/);
});
