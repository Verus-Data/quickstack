import { Schema } from "effect";
import { afterEach, describe, expect, test } from "vitest";
import { ListResult } from "../src/schemas/list";
import { addCli, addProject, put, releaseAdd, scaffolded } from "./helpers/add";

afterEach(releaseAdd);
const decode = (text: string) => Schema.decodeUnknownSync(ListResult)(JSON.parse(text));
const addable = [
  "ci-github",
  "conflicting",
  "default-only",
  "fixture-tool",
  "named",
  "own-repo",
  "park-a",
  "park-b",
  "park-identical",
  "rollback",
  "step-clash",
];

describe("list's project view", () => {
  test.each([false, true])(
    "default text lists fitting, unapplied fragments with add commands (terminal %s) [3.0#19]",
    async (stdoutIsTTY) => {
      const project = await scaffolded();
      const run = await addCli(project, ["list"], { host: { stdoutIsTTY } });
      expect(run.status).toBe(0);
      expect(run.stderr).toBe("");
      expect(run.stdout).toContain("Fragments you can add");
      const registryIds = new Set([
        ...addable,
        "fixture-required",
        "other-only",
        "fixture-stack",
        "other-stack",
      ]);
      const rows = run.stdout
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[0])
        .filter((id) => id !== undefined && registryIds.has(id));
      expect(rows).toEqual(addable);
      expect(
        [...run.stdout.matchAll(/Next: quickstacks add ([a-z-]+)/g)].map((match) => match[1]),
      ).toEqual(addable);
      expect(run.stdout).not.toMatch(/Next: quickstacks add (?:other-only|fixture-required)\b/);
      expect(run.stdout).toContain("list stacks");
      expect(run.stdout).not.toContain("Next: quickstacks new");
    },
  );

  test("JSON keeps the full registry and adds exact project metadata [3.0#19]", async () => {
    const project = await scaffolded();
    const outside = await addCli(project, ["list", "--json"], { host: { cwd: project.home } });
    expect(outside.status).toBe(0);
    expect(outside.stderr).toBe("");
    const full = decode(outside.stdout);
    expect(full.rejected).toEqual([]);
    const run = await addCli(project, ["list", "--json"]);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("");
    expect(run.stdout.trim().split("\n")).toHaveLength(1);
    const result = decode(run.stdout);
    expect(result.entries).toEqual(full.entries);
    expect(result.rejected).toEqual([]);
    expect(result).toMatchObject({
      project: { stack: "fixture-stack", applied: ["fixture-required"], addable },
    });
    expect(full).not.toHaveProperty("project");
    for (const group of ["stacks", "fragments"]) {
      const explicit = await addCli(project, ["list", group, "--json"]);
      expect(explicit.status).toBe(0);
      expect(explicit.stderr).toBe("");
      expect(decode(explicit.stdout).entries).toEqual(
        full.entries.filter((row) => row.kind === (group === "stacks" ? "stack" : "fragment")),
      );
    }
  });

  test("outside a project the default text still shows stacks before fragments [3.0#19]", async () => {
    const project = addProject();
    const run = await addCli(project, ["list"]);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("");
    expect(run.stdout.indexOf("Stacks")).toBeGreaterThanOrEqual(0);
    expect(run.stdout.indexOf("Stacks")).toBeLessThan(run.stdout.indexOf("Fragments"));
    expect(run.stdout).toContain("Next: quickstacks new fixture-stack");
    expect(run.stdout).not.toContain("Fragments you can add");
  });

  test.each(["{broken", '{"schemaVersion":999}'])(
    "a corrupt or newer manifest falls back with a path and decode warning: %s [3.0#19]",
    async (bytes) => {
      const project = addProject();
      put(project.root, ".quickstacks/manifest.json", bytes);
      const run = await addCli(project, ["list"]);
      expect(run.status).toBe(0);
      expect(run.stderr).toContain(".quickstacks/manifest.json");
      expect(run.stderr).toMatch(/warn|decode|invalid|version/i);
      expect(run.stdout).toContain("Next: quickstacks new fixture-stack");
      expect(run.stdout).not.toContain("Fragments you can add");
    },
  );
});
