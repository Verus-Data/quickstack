import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, expect, test } from "vitest";
import { hasFlag } from "../src/main";
import { VERSION } from "../src/version";
import { quiet, runCli, tempDir } from "./helpers/cli";

const dirs: ReturnType<typeof tempDir>[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) d.cleanup();
});
function configFile(content: string) {
  const dir = tempDir();
  dirs.push(dir);
  const parent = join(dir.path, "config", "quickstacks");
  mkdirSync(parent, { recursive: true });
  writeFileSync(join(parent, "config.json"), content);
  return dir.path;
}
test("doctor runs under Node and respects human/JSON result contracts", async () => {
  const human = await runCli(["doctor"]);
  expect(human.status).toBe(0);
  expect(human.stdout).toContain(`quickstacks ${VERSION}`);
  expect(human.stderr).toBe("");
  const json = await runCli(["doctor", "--json"]);
  expect(json.status).toBe(0);
  expect(JSON.parse(json.stdout)).toMatchObject({
    version: VERSION,
    platform: "test-node",
    compiled: false,
    configErrors: [],
  });
});
test.each([
  ["--help"],
  ["doctor", "--help"],
  ["--version"],
  ["--version", "--json"],
  ["--help", "--json"],
  ["--json", "doctor"],
])("successfully handles %j", async (...args) => {
  const result = await runCli(args);
  expect(result.status).toBe(0);
  expect(result.stdout).toBeTruthy();
  expect(result.stdout).not.toContain(String.fromCharCode(27));
  expect(result.stderr).toBe("");
  if (args.includes("--json")) expect(() => JSON.parse(result.stdout)).not.toThrow();
});
test.each([
  ["--unexpected", "--json"],
  ["doctor", "extra", "--json"],
  ["--log-level", "--json"],
  ["--completions", "--json"],
])("Usage (no kept result) has empty stdout and exactly one JSON error for %j", async (...args) => {
  const result = await runCli(args);
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toEqual({
    error: { tag: "Usage", message: "Invalid command. Run --help for usage.", retryable: false },
  });
});
test("a mistyped subcommand is Usage with the close match under the message", async () => {
  const result = await runCli(["doctr"], { env: quiet });
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("Invalid command. Run --help for usage.\n  Did you mean: doctor?\n");
});
test("a mistyped subcommand with --json is one envelope naming the suggestions", async () => {
  const result = await runCli(["doctr", "--json"]);
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr.trimEnd().split("\n").at(-1) ?? "")).toEqual({
    error: {
      tag: "Usage",
      message: "Invalid command. Run --help for usage.",
      retryable: false,
      details: { command: "doctr", suggestions: ["doctor"] },
    },
  });
});
test("an unknown subcommand with no close match gets no suggestion", async () => {
  const human = await runCli(["zzzz"], { env: quiet });
  expect(human.status).toBe(2);
  expect(human.stdout).toBe("");
  expect(human.stderr).toBe("Invalid command. Run --help for usage.\n");
  const json = await runCli(["zzzz", "--json"]);
  expect(json.status).toBe(2);
  expect(json.stdout).toBe("");
  expect(JSON.parse(json.stderr).error.details).toEqual({ command: "zzzz", suggestions: [] });
});
test("broken optional config does not break doctor, help or version", async () => {
  const home = configFile("{broken");
  for (const args of [["doctor", "--json"], ["--help"], ["--version"]]) {
    const result = await runCli(args, { home });
    expect(result.status).toBe(0);
    if (args[0] === "doctor")
      expect(JSON.parse(result.stdout).configErrors).toEqual(["Configuration is invalid."]);
  }
});
test("closed config rejects unknown fields and env overrides valid file values", async () => {
  const bad = configFile('{"unknown":true}');
  expect(
    JSON.parse((await runCli(["doctor", "--json"], { home: bad })).stdout).configErrors,
  ).toHaveLength(1);
  const home = configFile('{"dataDir":"/file-data"}');
  expect(
    JSON.parse(
      (
        await runCli(["doctor", "--json"], {
          home,
          env: { QUICKSTACKS_DATA_DIR: "/env-data" },
        })
      ).stdout,
    ).paths.data,
  ).toBe("/env-data");
});
test("empty env values mean absent and invalid log level falls back safely", async () => {
  const result = await runCli(["doctor", "--json"], {
    env: { LOG_LEVEL: "bogus", QUICKSTACKS_DATA_DIR: "" },
  });
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).paths.data).toContain(".local/share/quickstacks");
  expect(result.stderr).toBe("");
});
test("paths follow the XDG base directories, and an unset HOME means the user's home", async () => {
  const paths = async (env: Record<string, string>) =>
    JSON.parse((await runCli(["doctor", "--json"], { env })).stdout).paths;
  expect(await paths({ XDG_DATA_HOME: "/xdg/data", XDG_CACHE_HOME: "/xdg/cache" })).toMatchObject({
    data: "/xdg/data/quickstacks",
    cache: "/xdg/cache/quickstacks",
  });
  expect(await paths({ HOME: "", XDG_CONFIG_HOME: "" })).toMatchObject({
    config: join(homedir(), ".config", "quickstacks", "config.json"),
    cache: join(homedir(), ".cache", "quickstacks"),
  });
});
test("--json after -- belongs to the command, not quickstacks", async () => {
  expect(hasFlag(["doctor", "--json"], "--json")).toBe(true);
  expect(hasFlag(["doctor", "--", "--json"], "--json")).toBe(false);
  const result = await runCli(["doctor", "--", "--json"]);
  expect(result.status).toBe(2);
  expect(result.stderr).toMatch(/^Invalid command\. Run --help for usage\.\n/);
});
test("a defect's class and stack frames are logged, but not its message", async () => {
  const result = await runCli([], {
    program: Effect.die(new TypeError("private detail")),
    env: { LOG_LEVEL: "error", QUICKSTACKS_LOG_FORMAT: "json" },
  });
  const line = result.stderr.split("\n").find((l) => l.includes('"msg":"command"'));
  const record = JSON.parse(line ?? "") as { defect: string };
  expect(record.defect).toMatch(/^TypeError\nat /);
  expect(result.stderr).not.toContain("private detail");
});
test("main maps a defect once and never leaks its object", async () => {
  const result = await runCli([], {
    program: Effect.die({ token: "secret-value", message: "private" }),
    env: { LOG_LEVEL: "info", QUICKSTACKS_LOG_FORMAT: "json" },
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.match(/"msg":"command"/g)).toHaveLength(1);
  expect(result.stderr).not.toContain("secret-value");
  expect(result.stderr).toContain("An unexpected error occurred.");
});
