import {
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { quiet, runCli, tempDir } from "./helpers/cli";
import { newRegistry } from "./helpers/registry";

const dirs: ReturnType<typeof tempDir>[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) dir.cleanup();
});

test.each(
  ["file", "file-link", "dangling-link"].flatMap((kind) =>
    [false, true].map((dryRun) => ({ kind, dryRun })),
  ),
)("refuses a target beneath a $kind without writing (dryRun=$dryRun)", async ({ kind, dryRun }) => {
  const dir = tempDir();
  dirs.push(dir);
  const home = dir.path;
  const cwd = join(home, "workspace");
  mkdirSync(cwd);
  const blocked = join(cwd, "blocked");
  const source = join(cwd, "source");
  if (kind === "file") writeFileSync(blocked, "keep me");
  else {
    if (kind === "file-link") writeFileSync(source, "keep me");
    symlinkSync(source, blocked);
  }
  const before = readdirSync(cwd).sort();
  const target = join(blocked, "missing", "app");
  const result = await runCli(
    ["new", "fixture-stack", target, ...(dryRun ? ["--dry-run"] : []), "--json"],
    {
      home,
      env: { ...quiet, PATH: "", XDG_STATE_HOME: join(home, "state") },
      host: { registry: newRegistry, cwd },
    },
  );
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim().split("\n")).toHaveLength(1);
  const envelope: unknown = JSON.parse(result.stderr);
  expect(envelope).toEqual({
    error: {
      tag: "TargetNotEmpty",
      message: "The target directory is not empty.",
      retryable: false,
      details: { path: target, entries: [] },
    },
  });
  expect(readdirSync(cwd).sort()).toEqual(before);
  expect(readdirSync(home)).toEqual(["workspace"]);
  if (kind === "file") expect(readFileSync(blocked, "utf8")).toBe("keep me");
  else {
    expect(readlinkSync(blocked)).toBe(source);
    if (kind === "file-link") expect(readFileSync(source, "utf8")).toBe("keep me");
  }
});
