import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Effect, Schema, Terminal } from "effect";
import { Command } from "effect/cli";
import { afterEach, expect, test } from "vitest";
import { cli } from "../src/cli";
import { CreateResult } from "../src/schemas/create";
import { BriefPreview, ValidateReport } from "../src/schemas/validate";
import { VERSION } from "../src/version";
import {
  authoringGuide,
  createCli,
  created,
  createFailure,
  createWorkspace,
  entryPath,
  entrySnapshot,
  jsonResult,
  putCreate,
  releaseCreate,
  userRoot,
} from "./helpers/create";
import { minimal, writeEntry } from "./helpers/registry";

afterEach(releaseCreate);

test.each(["null", "true", "123"])(
  "a YAML-looking id %s stays a string in its skeleton",
  async (id) => {
    const home = createWorkspace();
    await created(await createCli(home, ["create", "stack", id, "--json"]));
    const report = jsonResult(
      await createCli(home, ["validate", entryPath(home, "stack", id), "--json"]),
      ValidateReport,
    );
    expect(report.findings).toEqual([]);
  },
);

test("working copies preserve empty directories, binary bytes and asymmetric executable bits", async () => {
  const home = createWorkspace();
  const registry = createWorkspace();
  const entry = writeEntry({
    root: registry,
    kind: "fragment",
    dir: "x",
    frontmatter: minimal("fragment", "x"),
  });
  mkdirSync(join(entry, "empty"));
  putCreate(entry, "files/data.bin", Buffer.from([0, 255, 13, 10]));
  putCreate(entry, "adapters/claude/hook.sh", "#!/bin/sh\nexit 0\n");
  chmodSync(join(entry, "adapters/claude/hook.sh"), 0o744);
  await created(
    await createCli(home, ["create", "fragment", "x", "--from", "bundled", "--json"], {
      host: { registry },
    }),
  );
  expect(entrySnapshot(entryPath(home, "fragment", "x"))).toEqual(entrySnapshot(entry));
});

function answering(args: string[], answer: string) {
  return Effect.gen(function* () {
    const terminal = yield* Terminal.Terminal;
    yield* Command.runWith(cli, { version: VERSION, renderErrors: false })(args).pipe(
      Effect.provideService(
        Terminal.Terminal,
        Terminal.make({ ...terminal, readLine: Effect.succeed(answer) }),
      ),
    );
  });
}

test.each(["yes", "n", ""])("a person answers %j after the full trust report", async (answer) => {
  const home = createWorkspace();
  const source = writeEntry({
    root: join(home, ".stacks"),
    kind: "fragment",
    dir: "x",
    frontmatter: minimal("fragment", "x"),
    body: "REVIEW BEFORE COPYING\n",
  });
  const args = ["create", "fragment", "x", "--from", "project", "--json"];
  const run = await createCli(home, args, {
    host: { stdinIsTTY: true },
    program: answering(args, answer),
  });
  expect(run.stderr.indexOf("REVIEW BEFORE COPYING")).toBeGreaterThanOrEqual(0);
  expect(run.stderr.indexOf("REVIEW BEFORE COPYING")).toBeLessThan(run.stderr.indexOf("[y/N]"));
  if (answer === "yes") {
    expect(run.status).toBe(0);
    expect(run.stdout.trim().split("\n")).toHaveLength(1);
    expect(Schema.decodeUnknownSync(CreateResult)(JSON.parse(run.stdout))).toMatchObject({
      kind: "fragment",
      id: "x",
    });
    expect(entrySnapshot(entryPath(home, "fragment", "x"))).toEqual(entrySnapshot(source));
    expect(run.stderr).not.toContain('"error"');
  } else {
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(JSON.parse(run.stderr.trim().split("\n").at(-1) ?? "")).toMatchObject({
      error: { tag: "BadInput", details: { flag: "confirmation" } },
    });
    expect(existsSync(userRoot(home))).toBe(false);
    expect(readFileSync(join(source, "FRAGMENT.md"), "utf8")).toContain("REVIEW BEFORE COPYING");
  }
});

test("the guide's preview commands render the personal stack they just created", async () => {
  const home = createWorkspace();
  const env = { XDG_CONFIG_HOME: join(home, ".config") };
  const result = jsonResult(
    await createCli(home, ["create", "stack", "my-api", "--json"], { env }),
    CreateResult,
  );
  jsonResult(
    await createCli(home, ["create", "fragment", "my-ci", "--category", "ci", "--json"], { env }),
    CreateResult,
  );
  const markdown = join(result.path, "STACK.md");
  writeFileSync(markdown, `${readFileSync(markdown, "utf8")}\nPERSONAL STACK PREVIEW\n`);
  const commands = readFileSync(authoringGuide, "utf8")
    .split("\n")
    .filter((line) => /^stacks validate .*--brief my-api/.test(line));
  expect(commands).toHaveLength(2);
  for (const command of commands) {
    const args = command
      .split(/\s+/)
      .slice(1)
      .map((arg) => (arg.startsWith("~/") ? join(home, arg.slice(2)) : arg));
    const preview = jsonResult(await createCli(home, [...args, "--json"], { env }), BriefPreview);
    expect(preview.stack).toBe("my-api");
    expect(preview.brief).toContain("PERSONAL STACK PREVIEW");
  }
});

test("relative XDG configuration returns an absolute path rooted at the invocation cwd", async () => {
  const home = createWorkspace();
  const config = join(home, "relative-config");
  const result = jsonResult(
    await createCli(home, ["create", "fragment", "x", "--json"], {
      env: { XDG_CONFIG_HOME: relative(process.cwd(), config) },
      host: { cwd: process.cwd() },
    }),
    CreateResult,
  );
  expect(result.path).toBe(join(config, "stacks/fragments/x"));
  expect(existsSync(join(result.path, "FRAGMENT.md"))).toBe(true);
});

test("a missing source id suggests only usable entries of the same kind in that origin", async () => {
  const home = createWorkspace();
  const registry = createWorkspace();
  writeEntry({
    root: registry,
    kind: "stack",
    dir: "go-cli",
    frontmatter: minimal("stack", "go-cli"),
  });
  writeEntry({
    root: registry,
    kind: "fragment",
    dir: "go-clx",
    frontmatter: minimal("fragment", "go-clx"),
  });
  putCreate(registry, "stacks/go-clj/STACK.md", "invalid entry\n");
  writeEntry({
    root: join(home, ".stacks"),
    kind: "stack",
    dir: "go-clp",
    frontmatter: minimal("stack", "go-clp"),
  });
  const error = createFailure(
    await createCli(home, ["create", "stack", "go-cl", "--from", "bundled", "--json"], {
      host: { registry },
    }),
    2,
    "NotFound",
  );
  expect(error.details).toEqual({ id: "go-cl", kind: "stack", suggestions: ["go-cli"] });
  expect(existsSync(userRoot(home))).toBe(false);
});

test("the printed validate command preserves shell characters in the registry path", async () => {
  const home = createWorkspace();
  const config = join(home, "registry $REGISTRY_NAME's files");
  const run = await createCli(home, ["create", "fragment", "x"], {
    env: { XDG_CONFIG_HOME: config },
  });
  expect(run.status).toBe(0);
  expect(run.stderr).toBe("");
  const next = run.stdout.split("\n").find((line) => line.startsWith("Next:"));
  const argument = /then run stacks validate (.+)\.$/.exec(next ?? "")?.[1];
  expect(argument).toBeDefined();
  const parsed = spawnSync("/bin/sh", ["-c", `set -- ${argument}; printf '%s' "$1"`], {
    cwd: home,
    env: { REGISTRY_NAME: "expanded" },
    encoding: "utf8",
  });
  expect(parsed.status).toBe(0);
  expect(parsed.stderr).toBe("");
  expect(parsed.stdout).toBe(relative(home, join(config, "stacks/fragments/x")));
});
