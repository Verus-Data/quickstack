import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, expect, test } from "vitest";
import { VERSION } from "../src/version";
import { runCli, tempDir } from "./helpers/cli";

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
  ["unknown", "--json"],
  ["--unexpected", "--json"],
  ["doctor", "extra", "--json"],
  ["--log-level", "--json"],
  ["--completions", "--json"],
])("usage failure has empty stdout and exactly one JSON error for %j", async (...args) => {
  const result = await runCli(args);
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toEqual({
    error: { tag: "Usage", message: "Invalid command. Run --help for usage.", retryable: false },
  });
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
