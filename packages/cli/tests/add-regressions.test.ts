import { chmodSync, linkSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { VerifyResult } from "../src/schemas/verify";
import {
  addCli,
  added,
  addProject,
  put,
  read,
  refused,
  releaseAdd,
  scaffolded,
  snapshot,
} from "./helpers/add";
import { minimal, writeEntry } from "./helpers/registry";
import { type StepInput, splitEvents, writeRecordedProject } from "./helpers/verify";

afterEach(releaseAdd);

test("numbered incoming copies above nine stay grouped with their live destination", async () => {
  const project = addProject();
  put(project.root, ".stacks/incoming/README.md", "first\n");
  put(project.root, ".stacks/incoming/README.md.10", "tenth\n");
  const result = await added(await addCli(project, ["add", "named", "--json"]));
  expect(result.mergeNeeded).toEqual([
    {
      path: "README.md",
      incoming: [".stacks/incoming/README.md", ".stacks/incoming/README.md.10"],
    },
  ]);
});

test("an applied application counts toward the one-application limit", async () => {
  const project = addProject();
  for (const id of ["app-first", "app-second"])
    writeEntry({
      root: project.registry,
      kind: "fragment",
      dir: id,
      frontmatter: minimal("fragment", id, "applies_to: [fixture-stack]").replace(
        "category: tooling",
        "category: app",
      ),
    });
  await added(await addCli(project, ["add", "app-first", "--json"]));
  const before = snapshot(project.root);
  const error = refused(
    await addCli(project, ["add", "app-second", "--json"]),
    2,
    "ComposeConflict",
  );
  expect(error.details).toMatchObject({ reason: "app_count", ids: ["app-first", "app-second"] });
  expect(snapshot(project.root)).toEqual(before);
});

test("stack-specific dependencies also warn when a plain repository has no recorded stack", async () => {
  const project = addProject();
  writeEntry({
    root: project.registry,
    kind: "fragment",
    dir: "scoped",
    frontmatter: minimal("fragment", "scoped", "applies_to: [fixture-stack]"),
  });
  writeEntry({
    root: project.registry,
    kind: "fragment",
    dir: "dependent",
    frontmatter: minimal("fragment", "dependent", "requires: [scoped]"),
  });
  const result = await added(await addCli(project, ["add", "dependent", "--json"]));
  expect(result.added).toEqual(["scoped", "dependent"]);
  expect(result.warnings).toEqual([{ code: "with_not_applicable", id: "scoped" }]);
});

test("the project list retains rejected entry diagnostics", async () => {
  const project = await scaffolded();
  writeEntry({
    root: project.registry,
    kind: "fragment",
    dir: "broken",
    frontmatter: minimal("fragment", "broken").replace("category: tooling", "category: unknown"),
  });
  const run = await addCli(project, ["list"]);
  expect(run.status).toBe(0);
  expect(run.stderr).toBe("");
  expect(run.stdout).toContain("Fragments you can add");
  expect(run.stdout).toContain("Rejected");
  expect(run.stdout).toContain("broken");
  expect(run.stdout).toContain("category");
  expect(run.stdout).toContain("registry/fragments/broken");
});

test("list follow-ups keep an explicitly selected project directory with shell quoting", async () => {
  const project = addProject("app space");
  await added(await addCli(project, ["add", "named", "--json"]));
  const run = await addCli(project, ["list", "--dir", "app space"], {
    host: { cwd: project.home },
  });
  expect(run.status).toBe(0);
  expect(run.stderr).toBe("");
  expect(run.stdout).toContain("Next: stacks add ci-github --dir 'app space'");
  expect(run.stdout).toContain("Next: stacks list stacks --dir 'app space'");
});

test("numbered parking copies cannot claim another planned fragment destination", async () => {
  const project = addProject();
  const entry = writeEntry({
    root: project.registry,
    kind: "fragment",
    dir: "collision",
    frontmatter: minimal("fragment", "collision"),
  });
  put(entry, "files/README.md", "first new contribution\n");
  put(entry, "files/README.md.2", "second new contribution\n");
  put(project.root, "README.md", "live first\n");
  put(project.root, "README.md.2", "live second\n");
  put(project.root, ".stacks/incoming/README.md", "old incoming\n");
  await added(await addCli(project, ["add", "collision", "--json"]));
  expect(read(project.root, "README.md")).toBe("live first\n");
  expect(read(project.root, "README.md.2")).toBe("live second\n");
  expect(read(project.root, ".stacks/incoming/README.md.2")).toBe("second new contribution\n");
  expect(read(project.root, ".stacks/incoming/README.md.3")).toBe("first new contribution\n");
});

test.skipIf(process.getuid?.() === 0)(
  "a first add succeeds without state when its state directory cannot be searched",
  async () => {
    const project = addProject();
    const state = join(project.home, "state");
    mkdirSync(state);
    chmodSync(state, 0o000);
    try {
      const result = await added(await addCli(project, ["add", "named", "--json"]));
      expect(result.stateRecord).toBe(false);
      expect(result.createdManifest).toBe(true);
      expect(read(project.root, "name.txt")).toBe("app\n");
    } finally {
      chmodSync(state, 0o755);
    }
  },
);

test("the add brief describes base then app stages in the same order verify runs", async () => {
  const project = addProject();
  const steps: StepInput[] = [
    { name: "app-check", phase: "check", tags: ["app"], run: "true" },
    { name: "base-check", phase: "check", run: "true" },
    { name: "app-setup", phase: "setup", tags: ["app"], run: "true" },
    { name: "base-teardown", phase: "teardown", run: "true" },
    { name: "app-teardown", phase: "teardown", tags: ["app"], run: "true" },
    { name: "base-setup", phase: "setup", run: "true" },
  ];
  writeRecordedProject(project.root, project.home, steps);
  await added(await addCli(project, ["add", "named", "--json"]));
  const run = await addCli(project, ["verify", "--json"]);
  expect(run.status).toBe(0);
  // stderr holds only verify's live events, which start the steps in the same order.
  const { events, rest } = splitEvents(run.stderr);
  expect(rest).toBe("");
  const verified = Schema.decodeUnknownSync(VerifyResult)(JSON.parse(run.stdout));
  const brief = read(project.root, ".stacks/BRIEF.md");
  const order = [
    "base-setup",
    "base-check",
    "base-teardown",
    "app-setup",
    "app-check",
    "app-teardown",
  ];
  expect(verified.steps.map((step) => step.name)).toEqual(order);
  expect(events.flatMap((event) => (event.event === "step-started" ? [event.name] : []))).toEqual(
    order,
  );
  expect([...brief.matchAll(/^# ((?:base|app)-[a-z]+)$/gm)].map((match) => match[1])).toEqual(
    order,
  );
});

test.each([false, true])(
  "rewriting a parked hard link preserves live bytes and permissions (rollback %s)",
  async (rollback) => {
    const project = addProject();
    const entry = writeEntry({
      root: project.registry,
      kind: "fragment",
      dir: "hard-link",
      frontmatter: minimal("fragment", "hard-link"),
    });
    put(entry, "files/.claude/settings.json", '{"new":true}\n');
    put(project.root, ".claude/settings.json", '{ "mine": true }\n');
    chmodSync(join(project.root, ".claude/settings.json"), 0o640);
    mkdirSync(join(project.root, ".stacks/incoming/.claude"), { recursive: true });
    linkSync(
      join(project.root, ".claude/settings.json"),
      join(project.root, ".stacks/incoming/.claude/settings.json"),
    );
    if (rollback) {
      put(entry, "files/z-blocked/child.txt", "new\n");
      put(project.root, "z-blocked", "parent is a file\n");
    }
    const before = snapshot(project.root);
    const run = await addCli(project, ["add", "hard-link", "--json"]);
    if (rollback) {
      refused(run, 6, "PermissionDenied");
      expect(snapshot(project.root)).toEqual(before);
    } else {
      await added(run);
      expect(JSON.parse(read(project.root, ".stacks/incoming/.claude/settings.json"))).toEqual({
        mine: true,
        new: true,
      });
    }
    expect(read(project.root, ".claude/settings.json")).toBe('{ "mine": true }\n');
    expect(
      statSync(join(project.root, ".stacks/incoming/.claude/settings.json")).mode & 0o777,
    ).toBe(0o640);
  },
);

test("a live file written without parking does not consume a numbered incoming slot", async () => {
  const project = addProject();
  const entry = writeEntry({
    root: project.registry,
    kind: "fragment",
    dir: "first-free",
    frontmatter: minimal("fragment", "first-free"),
  });
  put(entry, "files/README.md", "new incoming\n");
  put(entry, "files/README.md.2", "new live\n");
  put(project.root, "README.md", "existing live\n");
  put(project.root, ".stacks/incoming/README.md", "old incoming\n");
  const result = await added(await addCli(project, ["add", "first-free", "--json"]));
  expect(result.written).toEqual(["README.md.2"]);
  expect(read(project.root, "README.md.2")).toBe("new live\n");
  expect(read(project.root, ".stacks/incoming/README.md.2")).toBe("new incoming\n");
});
