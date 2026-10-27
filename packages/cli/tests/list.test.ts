import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { ListResult } from "../src/schemas/list";
import { ndjson, quiet, runCli, tempDir } from "./helpers/cli";
import {
  brokenRegistry,
  copyEntry,
  minimal,
  realRegistry,
  smallRegistry,
  writeEntry,
} from "./helpers/registry";

const dirs: ReturnType<typeof tempDir>[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) dir.cleanup();
});
/** A temporary HOME whose cwd is also the project root; `user` and `project` are registry roots. */
function setup() {
  const dir = tempDir();
  dirs.push(dir);
  return {
    home: dir.path,
    user: join(dir.path, "config", "quickstacks"),
    project: join(dir.path, ".quickstacks"),
  };
}
async function list(
  args: string[],
  options: { registry?: string; home?: string; env?: Record<string, string>; host?: object } = {},
) {
  const home = options.home ?? setup().home;
  return runCli(["list", ...args], {
    home,
    env: { ...quiet, ...options.env },
    host: { registry: options.registry ?? smallRegistry, ...options.host },
  });
}
const decode = (stdout: string) => Schema.decodeUnknownSync(ListResult)(JSON.parse(stdout));
const ids = (result: ListResult) => result.entries.map((row) => `${row.kind}:${row.id}`);

test("list --json over the bundled root lists stacks, then fragments, each sorted by id", async () => {
  const result = await list(["--json"]);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  const listed = decode(result.stdout);
  expect(ids(listed)).toEqual([
    "stack:bun-web",
    "stack:go-api",
    "fragment:ci-github",
    "fragment:docker-deploy",
    "fragment:editor-config",
    "fragment:todo-app",
  ]);
  for (const row of listed.entries)
    expect(row).toMatchObject({ origin: "bundled", trusted: true, shadows: [], lastRun: null });
  expect(listed.rejected).toEqual([]);
  expect(listed.entries.find((row) => row.id === "docker-deploy")).toMatchObject({
    category: "deploy",
    appliesTo: ["web", "api"],
  });
  expect(listed.entries[0]).not.toHaveProperty("category");
});

test("every entry in the realistic registry decodes, and its app names what it builds on", async () => {
  const result = await list(["--json"], { registry: realRegistry });
  expect(result.status).toBe(0);
  const listed = decode(result.stdout);
  expect(listed.rejected).toEqual([]);
  expect(ids(listed)).toEqual([
    "stack:typescript-cli",
    "fragment:effect",
    "fragment:effect-schema",
    "fragment:git-hooks",
    "fragment:openrouter-chat-cli",
  ]);
  const app = listed.entries.find((row) => row.category === "app");
  expect(app?.id).toBe("openrouter-chat-cli");
  expect(app?.appliesTo).toEqual(["typescript-cli"]);
});

test("a user-directory stack with a new id is listed as user and trusted", async () => {
  const { home, user } = setup();
  writeEntry(user, "stack", "my-stack", minimal("stack", "my-stack"));
  const listed = decode((await list(["--json"], { home })).stdout);
  expect(listed.entries.find((row) => row.id === "my-stack")).toMatchObject({
    origin: "user",
    trusted: true,
    shadows: [],
  });
});

test("a user-directory copy of a bundled id wins and shadows the bundled copy", async () => {
  const { home, user } = setup();
  writeEntry(user, "stack", "bun-web", minimal("stack", "bun-web"));
  const listed = decode((await list(["--json"], { home })).stdout);
  const rows = listed.entries.filter((row) => row.id === "bun-web");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    origin: "user",
    trusted: true,
    shadows: ["bundled"],
    description: "bun-web description.",
  });
});

test("project entries are untrusted, whether they shadow an id or bring a new one", async () => {
  const { home, project, user } = setup();
  writeEntry(project, "stack", "bun-web", minimal("stack", "bun-web"));
  writeEntry(user, "stack", "bun-web", minimal("stack", "bun-web"));
  writeEntry(project, "fragment", "local-only", minimal("fragment", "local-only"));
  const listed = decode((await list(["--json"], { home })).stdout);
  expect(listed.entries.find((row) => row.id === "bun-web")).toMatchObject({
    origin: "project",
    trusted: false,
    shadows: ["user", "bundled"],
  });
  expect(listed.entries.find((row) => row.id === "local-only")).toMatchObject({
    origin: "project",
    trusted: false,
    shadows: [],
  });
});

test.each([
  [
    "an unknown key",
    "stack",
    "s",
    minimal("stack", "s", "extra_key: 1"),
    /^extra_key: unknown key$/,
  ],
  [
    "a camelCase key",
    "fragment",
    "f",
    minimal("fragment", "f", "appliesTo: [web]"),
    /^appliesTo: unknown key \(frontmatter keys are snake_case\)$/,
  ],
  ["a bad id", "stack", "Bad_Id", minimal("stack", "Bad_Id"), /^id: .*kebab-case/],
  [
    "an id that differs from its directory",
    "stack",
    "dir-name",
    minimal("stack", "other"),
    /^id: "other" must equal the directory name "dir-name"/,
  ],
  ["a kind that differs from the file", "stack", "s", minimal("fragment", "s"), /^kind: /],
  [
    "a mistyped field",
    "fragment",
    "f",
    minimal("fragment", "f", "applies_to: [1]"),
    /^applies_to\[0\]: /,
  ],
])(
  "%s is a rejected row naming the field, and list still exits 0",
  async (_case, kind, dir, frontmatter, error) => {
    const { home, user } = setup();
    writeEntry(user, kind as "stack" | "fragment", dir, frontmatter);
    const result = await list(["--json"], { home });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const listed = decode(result.stdout);
    expect(listed.rejected).toHaveLength(1);
    expect(listed.rejected[0]).toMatchObject({ id: dir, kind, origin: "user" });
    expect(listed.rejected[0]?.error).toMatch(error);
    expect(listed.rejected[0]?.error).not.toContain("\n");
    expect(listed.entries.some((row) => row.id === dir)).toBe(false);
  },
);

test("a file without its --- lines is rejected, naming the frontmatter", async () => {
  const { home, user } = setup();
  const entry = join(user, "stacks", "no-fence");
  mkdirSync(entry, { recursive: true });
  writeFileSync(join(entry, "STACK.md"), "schema_version: 1\nid: no-fence\n");
  const listed = decode((await list(["--json"], { home })).stdout);
  expect(listed.rejected[0]?.error).toMatch(/^frontmatter: /);
});

test("schema_version 2 in the user directory falls through to the bundled copy with one warning", async () => {
  const { home, user } = setup();
  copyEntry(brokenRegistry, user, "stacks", "bun-web");
  const file = join(home, "cli.jsonl");
  const result = await list(["--json"], {
    home,
    env: { LOG_LEVEL: "warn", QUICKSTACKS_LOG_FILE: file },
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  const listed = decode(result.stdout);
  expect(listed.entries.find((row) => row.id === "bun-web")).toMatchObject({
    origin: "bundled",
    name: "Bun web app",
    shadows: [],
  });
  expect(listed.rejected).toEqual([]);
  const warnings = ndjson(readFileSync(file, "utf8")).filter(
    (record) => (record as { level: string }).level === "warn",
  );
  expect(warnings).toHaveLength(1);
  expect(JSON.stringify(warnings[0])).toContain("schema_version 2");
});

test("a symlink inside an entry rejects it, and nothing the link points at is listed", async () => {
  const { home, user } = setup();
  const outside = join(home, "outside");
  writeEntry(outside, "stack", "linked", minimal("stack", "linked"));
  const entry = writeEntry(user, "stack", "has-link", minimal("stack", "has-link"));
  mkdirSync(join(entry, "files"));
  symlinkSync(join(outside, "stacks", "linked"), join(entry, "files", "escape"));
  symlinkSync(join(outside, "stacks", "linked"), join(user, "stacks", "linked"));
  const listed = decode((await list(["--json"], { home })).stdout);
  expect(listed.rejected).toEqual([
    expect.objectContaining({ id: "has-link", error: "symlink: files/escape" }),
    expect.objectContaining({ id: "linked", error: "the entry directory is a symlink" }),
  ]);
  expect(listed.entries.some((row) => row.id === "linked" || row.id === "has-link")).toBe(false);
});

test("an unknown group is Usage with exit 2 and one envelope", async () => {
  const result = await list(["widgets", "--json"]);
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toEqual({
    error: {
      tag: "Usage",
      message: "Invalid command. Run --help for usage.",
      retryable: false,
      details: { command: "widgets", suggestions: [] },
    },
  });
});

test("a mistyped group suggests the group in human mode", async () => {
  const result = await list(["stack"]);
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("Invalid command. Run --help for usage.\n  Did you mean: stacks?\n");
});

test("human list shows Stacks, Fragments and Apps, then Next lines with the invocation", async () => {
  const result = await list([], { host: { invocation: "npx -y quickstacks@9.9.9" } });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe(
    [
      "Stacks",
      "  bun-web",
      "    A Bun web app with a typed API and browser tests.",
      "  go-api",
      "    A Go HTTP API with make targets.",
      "",
      "Fragments",
      "  ci-github      ci",
      "    A CI workflow that runs the project's check command.",
      "  docker-deploy  deploy",
      "    A container image and a deploy script.",
      "  editor-config  tooling",
      "    Shared editor settings and ignore rules.",
      "",
      "Apps",
      "  todo-app  on bun-web",
      "    A small todo app built on the web stack.",
      "",
      "Next: npx -y quickstacks@9.9.9 new bun-web my-project --sandbox",
      "Next: npx -y quickstacks@9.9.9 list --json",
      "",
    ].join("\n"),
  );
});

test("the origin column and untrusted marker appear once rows come from two origins", async () => {
  const { home, project } = setup();
  writeEntry(project, "stack", "zz-local", minimal("stack", "zz-local"));
  const result = await list(["stacks"], { home });
  expect(result.stdout.split("\n").slice(0, 7)).toEqual([
    "Stacks",
    "  bun-web   bundled",
    "    A Bun web app with a typed API and browser tests.",
    "  go-api    bundled",
    "    A Go HTTP API with make targets.",
    "  zz-local  project  untrusted",
    "    zz-local description.",
  ]);
  expect(result.stdout).not.toContain("Fragments");
  writeEntry(project, "stack", "go-api", minimal("stack", "go-api"));
  expect((await list(["stacks"], { home })).stdout).toContain(
    "\n  go-api    project  untrusted  shadows bundled\n",
  );
});

test("a long description wraps at 80 columns, or a narrower terminal, without splitting words", async () => {
  const { home, user } = setup();
  const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
  const description = `${words} ${"x".repeat(90)}`;
  expect(description.length).toBeGreaterThan(200);
  writeEntry(
    user,
    "stack",
    "long",
    minimal("stack", "long").replace("long description.", description),
  );
  for (const [host, width] of [
    [{}, 80],
    [{ stdoutIsTTY: true, stdoutColumns: 50 }, 50],
    [{ stdoutIsTTY: false, stdoutColumns: 50 }, 80],
  ] as const) {
    const result = await list(["stacks"], { home, host });
    const lines = result.stdout.split("\n");
    const row = lines.findIndex((line) => line.startsWith("  long "));
    const end = lines.findIndex((line, i) => i > row && !line.startsWith("    "));
    const wrapped = lines.slice(row + 1, end);
    expect(wrapped.map((line) => line.trim()).join(" ")).toBe(description);
    expect(wrapped.at(-1)).toBe(`    ${"x".repeat(90)}`);
    for (const line of wrapped.slice(0, -1)) expect(line.length).toBeLessThanOrEqual(width);
    expect(wrapped.length).toBeGreaterThan(3);
  }
});

test("an empty registry says so and only suggests doctor", async () => {
  const result = await list([], { registry: join(setup().home, "missing") });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("No stacks or fragments found.\n\nNext: quickstacks doctor\n");
});

test("when every stack is rejected, Next points at the rejected entries rather than doctor", async () => {
  const { home, user } = setup();
  writeEntry(user, "stack", "mine", minimal("stack", "mine", "extra: 1"));
  const result = await list(["stacks"], { home, registry: join(home, "missing") });
  expect(result.status).toBe(0);
  expect(result.stdout.trimEnd().split("\n").at(-1)).toBe(
    "Next: fix or remove the rejected entries above, then run quickstacks list",
  );
});

test("list --json has no Next lines; apps and fragments filter the app", async () => {
  expect((await list(["--json"])).stdout).not.toContain("Next:");
  expect(ids(decode((await list(["apps", "--json"])).stdout))).toEqual(["fragment:todo-app"]);
  expect(ids(decode((await list(["fragments", "--json"])).stdout))).toEqual([
    "fragment:ci-github",
    "fragment:docker-deploy",
    "fragment:editor-config",
  ]);
  expect(ids(decode((await list(["stacks", "--json"])).stdout))).toEqual([
    "stack:bun-web",
    "stack:go-api",
  ]);
});

test("list apps names the command that builds the app on its stack", async () => {
  const result = await list(["apps"]);
  expect(result.stdout).toContain(
    "Next: quickstacks new bun-web my-project --with todo-app --sandbox\n",
  );
});

test("a broken user copy of a bundled id is rejected, says what it hides, and the bundled copy is not listed", async () => {
  const { home, user } = setup();
  writeEntry(user, "stack", "bun-web", minimal("stack", "bun-web", "unknown_key: 1"));
  const json = decode((await list(["--json"], { home })).stdout);
  expect(json.entries.some((row) => row.id === "bun-web")).toBe(false);
  expect(json.rejected).toEqual([
    expect.objectContaining({
      id: "bun-web",
      origin: "user",
      error: expect.stringMatching(/; hides bundled copy$/),
    }),
  ]);
  const human = await list([], { home });
  expect(human.stdout).toContain(
    "\nRejected\n  stack bun-web (user): unknown_key: unknown key; hides bundled copy\n",
  );
  expect(human.stdout).toContain(`\n    ${join(user, "stacks", "bun-web")}\n`);
});

test.skipIf(process.getuid?.() === 0)(
  "an unreadable user root exits 6 with reason read",
  async () => {
    const { home, user } = setup();
    mkdirSync(join(user, "stacks"), { recursive: true });
    chmodSync(user, 0o000);
    try {
      const result = await list(["--json"], { home });
      expect(result.status).toBe(6);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr)).toEqual({
        error: {
          tag: "PermissionDenied",
          message: "Permission denied.",
          retryable: false,
          details: { reason: "read", path: join(user, "stacks") },
        },
      });
    } finally {
      chmodSync(user, 0o755);
    }
  },
);

test("a stack and a fragment with the same id both load", async () => {
  const { home, user } = setup();
  writeEntry(user, "fragment", "bun-web", minimal("fragment", "bun-web"));
  const listed = decode((await list(["--json"], { home })).stdout);
  expect(ids(listed).filter((id) => id.endsWith(":bun-web"))).toEqual([
    "stack:bun-web",
    "fragment:bun-web",
  ]);
});

test("QUICKSTACKS_REGISTRY_DIR replaces the bundled root, and doctor reports it", async () => {
  const env = { QUICKSTACKS_REGISTRY_DIR: realRegistry };
  const listed = decode((await list(["--json"], { env })).stdout);
  expect(listed.entries[0]?.id).toBe("typescript-cli");
  // A bundled root other than the one shipped with the CLI is not trusted.
  for (const row of listed.entries)
    expect(row).toMatchObject({ origin: "bundled", trusted: false });
  const doctor = await runCli(["doctor", "--json"], { env, host: { registry: "/elsewhere" } });
  expect(JSON.parse(doctor.stdout).registry).toEqual({ path: realRegistry, found: true });
  const missing = await runCli(["doctor", "--json"], { host: { registry: "/elsewhere" } });
  expect(JSON.parse(missing.stdout).registry).toEqual({ path: "/elsewhere", found: false });
});

test("a relative QUICKSTACKS_REGISTRY_DIR resolves against the working directory", async () => {
  const { home } = setup();
  const project = join(home, "work");
  copyEntry(smallRegistry, join(project, "reg"), "stacks", "go-api");
  const listed = decode(
    (
      await list(["--json"], {
        home,
        env: { QUICKSTACKS_REGISTRY_DIR: "reg" },
        host: { cwd: project, registry: "/elsewhere" },
      })
    ).stdout,
  );
  expect(ids(listed)).toEqual(["stack:go-api"]);
  const doctor = await runCli(["doctor", "--json"], {
    home,
    env: { QUICKSTACKS_REGISTRY_DIR: "reg" },
    host: { cwd: project, registry: "/elsewhere" },
  });
  expect(JSON.parse(doctor.stdout).registry).toEqual({ path: join(project, "reg"), found: true });
});

test("a QUICKSTACKS_REGISTRY_DIR that doesn't exist is a warning on list and in doctor", async () => {
  const { home } = setup();
  const env = { QUICKSTACKS_REGISTRY_DIR: join(home, "nope"), LOG_LEVEL: "warn" };
  const human = await list([], { home, env });
  expect(human.status).toBe(0);
  expect(human.stderr).toContain(
    `QUICKSTACKS_REGISTRY_DIR is not a directory: ${join(home, "nope")}`,
  );
  const doctor = await runCli(["doctor"], { home, env });
  expect(doctor.stdout).toContain(`Registry: ${join(home, "nope")} (not found)`);
  expect(doctor.stderr).toContain("QUICKSTACKS_REGISTRY_DIR is not a directory");
});

test("doctor reports a registry path that is a file as not found", async () => {
  const { home } = setup();
  const file = join(home, "file");
  writeFileSync(file, "x");
  const doctor = await runCli(["doctor", "--json"], { home, host: { registry: file } });
  expect(JSON.parse(doctor.stdout).registry).toEqual({ path: file, found: false });
});

test("control characters in entries never reach the terminal, and can't forge a Next line", async () => {
  const { home, project, user } = setup();
  const esc = String.fromCharCode(27);
  writeEntry(
    project,
    "stack",
    "colors",
    minimal("stack", "colors").replace(
      "colors description.",
      `"evil${esc}[31m red\\nNext: rm -rf ~"`,
    ),
  );
  writeEntry(
    project,
    "stack",
    "forged",
    minimal("stack", "forged").replace("kind: stack", 'kind: "x\\nNext: forged"'),
  );
  writeEntry(project, "fragment", `bad${esc}[2Jdir`, minimal("fragment", "bad"));
  copyEntry(brokenRegistry, user, "stacks", "bun-web");
  renameSync(join(user, "stacks", "bun-web"), join(user, "stacks", `v2${esc}[1m`));
  const result = await list([], { home, env: { LOG_LEVEL: "warn" } });
  expect(result.status).toBe(0);
  expect(result.stdout).not.toContain(esc);
  expect(result.stderr).not.toContain(esc);
  const next = result.stdout.split("\n").filter((line) => line.startsWith("Next:"));
  expect(next).toEqual([
    "Next: quickstacks new bun-web my-project --sandbox",
    "Next: quickstacks list --json",
  ]);
  expect(result.stdout).toContain('kind: "x\\nNext: forged" does not match STACK.md');
});

test("a symlinked project root is not read, with a warning", async () => {
  const { home } = setup();
  const elsewhere = join(home, "elsewhere");
  writeEntry(elsewhere, "stack", "outside", minimal("stack", "outside"));
  symlinkSync(elsewhere, join(home, ".quickstacks"));
  const result = await list(["--json"], {
    home,
    env: { LOG_LEVEL: "warn", QUICKSTACKS_LOG_FILE: join(home, "log.jsonl") },
  });
  expect(result.status).toBe(0);
  const listed = decode(result.stdout);
  expect(listed.entries.some((row) => row.id === "outside")).toBe(false);
  expect(readFileSync(join(home, "log.jsonl"), "utf8")).toContain("symlink");
});

test("a symlinked stacks directory in the project root is not read either", async () => {
  const { home, project } = setup();
  const elsewhere = join(home, "elsewhere");
  writeEntry(elsewhere, "stack", "outside", minimal("stack", "outside"));
  mkdirSync(project, { recursive: true });
  symlinkSync(join(elsewhere, "stacks"), join(project, "stacks"));
  const listed = decode((await list(["--json"], { home })).stdout);
  expect(listed.entries.some((row) => row.id === "outside")).toBe(false);
});

test("a symlinked user root is followed: the user owns it", async () => {
  const { home, user } = setup();
  const real = join(home, "dotfiles", "quickstacks");
  writeEntry(real, "stack", "mine", minimal("stack", "mine"));
  mkdirSync(join(user, ".."), { recursive: true });
  symlinkSync(real, user);
  const listed = decode((await list(["--json"], { home })).stdout);
  expect(listed.entries.find((row) => row.id === "mine")).toMatchObject({
    origin: "user",
    trusted: true,
  });
});

test("a rejected entry's directory is printed whole on its own line", async () => {
  const { home } = setup();
  const registry = join(
    home,
    "a registry with spaces in its path that is long enough to need wrapping",
  );
  writeEntry(registry, "stack", "broken", minimal("stack", "broken", "extra: 1"));
  const result = await list([], { home, registry });
  expect(result.stdout).toContain(`\n    ${join(registry, "stacks", "broken")}\n`);
});

test("Next never suggests an untrusted stack", async () => {
  const { home, project } = setup();
  writeEntry(project, "stack", "local", minimal("stack", "local"));
  writeEntry(
    project,
    "fragment",
    "local-app",
    minimal("fragment", "local-app").replace(
      "category: tooling",
      "category: app\napplies_to: [local]",
    ),
  );
  const missing = join(home, "missing");
  for (const args of [[], ["apps"]]) {
    const result = await list(args, { home, registry: missing });
    expect(
      result.stdout
        .trimEnd()
        .split("\n")
        .filter((line) => line.startsWith("Next:")),
    ).toEqual(["Next: quickstacks list --json"]);
  }
});

test.skipIf(process.getuid?.() === 0)(
  "an unreadable STACK.md is listed as unreadable, not missing",
  async () => {
    const { home, user } = setup();
    const entry = writeEntry(user, "stack", "locked", minimal("stack", "locked"));
    chmodSync(join(entry, "STACK.md"), 0o000);
    writeEntry(user, "stack", "empty", minimal("stack", "empty"));
    const emptyEntry = join(user, "stacks", "empty");
    renameSync(join(emptyEntry, "STACK.md"), join(emptyEntry, "NOTES.md"));
    try {
      const listed = decode((await list(["--json"], { home })).stdout);
      expect(listed.rejected.map(({ id, error }) => ({ id, error }))).toEqual([
        { id: "empty", error: "STACK.md is missing" },
        { id: "locked", error: "STACK.md is unreadable" },
      ]);
    } finally {
      chmodSync(join(entry, "STACK.md"), 0o644);
    }
  },
);
