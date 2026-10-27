import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());
const script = join(import.meta.dirname, "../scripts/bench.ts");

function invoke(args: string[]) {
  const root = space.dir();
  const run = spawnSync("bun", ["--no-env-file", "--config=/dev/null", script, ...args], {
    cwd: root,
    env: {
      HOME: space.dir(),
      TMPDIR: root,
      PATH: process.env.PATH,
      LOG_LEVEL: "none",
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
    },
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(run.error).toBeUndefined();
  expect(run.signal).toBeNull();
  expect(readdirSync(root)).toEqual([]);
  return run;
}

test.each(["0", "-1", "NaN", "Infinity", "", "1e999"])(
  "bench rejects max-minutes=%j before looking for credentials or writing a root",
  (minutes) => {
    const result = invoke(["sample", `--max-minutes=${minutes}`]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("--max-minutes must be a positive number\n");
  },
);

test.each([
  { args: ["../sample"], message: "Invalid stack id" },
  { args: ["sample", "--preset", "unknown"], message: "--preset must be sandbox or default" },
  { args: ["sample", "another"], message: "Usage:" },
])("bench refuses $args before preflight", ({ args, message }) => {
  const result = invoke(args);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(message);
  expect(result.stderr).not.toContain("token");
});

test("bench help works outside git without a token, stack or build", () => {
  const result = invoke(["--help"]);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("Usage: bun scripts/bench.ts <stack>");
  expect(result.stdout).toContain("--no-record");
});
