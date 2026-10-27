import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect, Exit } from "effect";
import { afterEach, expect, test } from "vitest";
import { isRejected } from "../src/core/registry/entry";
import { Registry, type RegistryRoots, trustOf } from "../src/core/registry/registry";
import { EntryInvalid, NotFound } from "../src/errors";
import { tempDir } from "./helpers/cli";
import {
  brokenRegistry,
  minimal,
  realRegistry,
  smallRegistry,
  writeEntry,
} from "./helpers/registry";

const dirs: ReturnType<typeof tempDir>[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) dir.cleanup();
});
function temp() {
  const dir = tempDir();
  dirs.push(dir);
  return dir.path;
}
function run<A, E>(roots: RegistryRoots, program: Effect.Effect<A, E, Registry>) {
  return Effect.runPromiseExit(
    program.pipe(Effect.provide(Registry.layer(roots)), Effect.provide(NodeServices.layer)),
  );
}
const bundled = [{ origin: "bundled", path: smallRegistry }] as const;

test("files lists literal dotfiles and strips the files/ and adapters/<agent>/ prefixes", async () => {
  const exit = await run(
    bundled,
    Effect.gen(function* () {
      const registry = yield* Registry;
      return yield* registry.files(yield* registry.get("fragment", "editor-config"));
    }),
  );
  expect(Exit.isSuccess(exit) && exit.value.map(({ source, path }) => ({ source, path }))).toEqual([
    { source: "adapters/claude/.claude/settings.json", path: ".claude/settings.json" },
    { source: "files/.editorconfig", path: ".editorconfig" },
    { source: "files/.gitignore", path: ".gitignore" },
  ]);
  expect(Exit.isSuccess(exit) && exit.value.every((file) => file.mode > 0)).toBe(true);
});

test("an entry without files/ or adapters/ ships no files", async () => {
  const exit = await run(
    bundled,
    Effect.gen(function* () {
      const registry = yield* Registry;
      return yield* registry.files(yield* registry.get("stack", "go-api"));
    }),
  );
  expect(exit).toEqual(Exit.succeed([]));
});

test("get returns the winning entry with its marks and body", async () => {
  const user = temp();
  writeEntry(user, "stack", "bun-web", minimal("stack", "bun-web"), "Body text.\n");
  const exit = await run(
    [
      { origin: "user", path: user },
      { origin: "bundled", path: smallRegistry },
    ],
    Effect.flatMap(Registry, (registry) => registry.get("stack", "bun-web")),
  );
  expect(Exit.isSuccess(exit) && exit.value).toMatchObject({
    id: "bun-web",
    kind: "stack",
    origin: "user",
    dir: join(user, "stacks", "bun-web"),
    trusted: true,
    shadows: ["bundled"],
    body: "Body text.\n",
  });
});

test.each([
  ["decode", minimal("stack", "broken", "unknown_key: 1"), "broken", "STACK.md"],
  ["id_mismatch", minimal("stack", "other"), "broken", "STACK.md"],
] as const)(
  "get on an entry that is rejected for %s fails EntryInvalid",
  async (reason, frontmatter, id, path) => {
    const user = temp();
    writeEntry(user, "stack", id, frontmatter);
    const exit = await run(
      [{ origin: "user", path: user }],
      Effect.flatMap(Registry, (registry) => registry.get("stack", id)),
    );
    expect(exit).toEqual(
      Exit.fail(new EntryInvalid({ details: { id, origin: "user", reason, path } })),
    );
  },
);

test("get on an entry holding a symlink fails EntryInvalid with the link's path", async () => {
  const project = temp();
  const entry = writeEntry(project, "fragment", "linky", minimal("fragment", "linky"));
  mkdirSync(join(entry, "files"));
  symlinkSync("/etc/hosts", join(entry, "files", "hosts"));
  const exit = await run(
    [{ origin: "project", path: project }],
    Effect.flatMap(Registry, (registry) => registry.get("fragment", "linky")),
  );
  expect(exit).toEqual(
    Exit.fail(
      new EntryInvalid({
        details: { id: "linky", origin: "project", reason: "symlink", path: "files/hosts" },
      }),
    ),
  );
});

test("get on an unknown id, or the right id under the other kind, fails NotFound", async () => {
  for (const [kind, id] of [
    ["stack", "nope"],
    ["fragment", "bun-web"],
  ] as const) {
    const exit = await run(
      bundled,
      Effect.flatMap(Registry, (registry) => registry.get(kind, id)),
    );
    expect(exit).toEqual(Exit.fail(new NotFound()));
  }
});

test("roots that don't exist are empty, not errors", async () => {
  const exit = await run(
    [
      { origin: "project", path: join(temp(), "missing") },
      { origin: "bundled", path: smallRegistry },
    ],
    Effect.flatMap(Registry, (registry) => registry.all),
  );
  expect(Exit.isSuccess(exit) && exit.value.filter((item) => !isRejected(item))).toHaveLength(6);
});

test("trust is by origin and root in 1.0: project entries and an overridden bundled root are untrusted", () => {
  const entry = (origin: "project" | "user" | "bundled") => ({
    id: "s",
    kind: "stack" as const,
    origin,
    dir: "/x",
    shadows: [],
    meta: {} as never,
    body: "",
  });
  expect(trustOf(entry("project"), { origin: "project", path: "/p" })).toBe(false);
  expect(trustOf(entry("user"), { origin: "user", path: "/u" })).toBe(true);
  expect(trustOf(entry("bundled"), { origin: "bundled", path: "/b" })).toBe(true);
  expect(trustOf(entry("bundled"), { origin: "bundled", path: "/b", overridden: true })).toBe(
    false,
  );
});

test.each([
  ["the filesystem root", (): string => "/"],
  ["its own parent, a loop", (): string => ".."],
  [
    "a tree with an unreadable directory",
    (): string => {
      const outside = temp();
      mkdirSync(join(outside, "deep", "locked"), { recursive: true });
      chmodSync(join(outside, "deep", "locked"), 0o000);
      return outside;
    },
  ],
] as const)(
  "a symlinked directory to %s is rejected as a symlink without being walked",
  async (_case, target) => {
    const root = temp();
    const entry = writeEntry(root, "fragment", "escape", minimal("fragment", "escape"));
    mkdirSync(join(entry, "files"));
    const to = target();
    symlinkSync(to, join(entry, "files", "escape"));
    const started = performance.now();
    try {
      const exit = await run(
        [{ origin: "user", path: root }],
        Effect.flatMap(Registry, (registry) => registry.get("fragment", "escape")),
      );
      expect(exit).toEqual(
        Exit.fail(
          new EntryInvalid({
            details: { id: "escape", origin: "user", reason: "symlink", path: "files/escape" },
          }),
        ),
      );
      expect(performance.now() - started).toBeLessThan(1000);
    } finally {
      if (to.startsWith("/") && to !== "/") chmodSync(join(to, "deep", "locked"), 0o755);
    }
  },
);

test("files stops at a symlink under adapters/ without following it", async () => {
  const root = temp();
  const entry = writeEntry(root, "fragment", "linked", minimal("fragment", "linked"));
  mkdirSync(join(entry, "adapters", "claude"), { recursive: true });
  symlinkSync("/", join(entry, "adapters", "claude", "all"));
  const exit = await run(
    [{ origin: "user", path: root }],
    Effect.flatMap(Registry, (registry) => registry.get("fragment", "linked")),
  );
  expect(exit).toEqual(
    Exit.fail(
      new EntryInvalid({
        details: { id: "linked", origin: "user", reason: "symlink", path: "adapters/claude/all" },
      }),
    ),
  );
});

// An entry may ship a literal `files/.gitignore`, and this repo's own git reads it: a pattern in it
// would leave the entry's other fixture files out of every commit without a word.
const vcs = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: import.meta.dirname });
test.skipIf(vcs.status !== 0)("git ignores no file in the fixture or bundled registries", () => {
  const bundled = join(import.meta.dirname, "..", "registry");
  const roots = [
    smallRegistry,
    realRegistry,
    brokenRegistry,
    ...(existsSync(bundled) ? [bundled] : []),
  ];
  const files = roots.flatMap((root) =>
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name)),
  );
  expect(files.length).toBeGreaterThan(20);
  // --no-index: tracked files are checked against the ignore rules too. Exit 1: none ignored.
  const checked = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], {
    cwd: import.meta.dirname,
    input: files.join("\n"),
    encoding: "utf8",
  });
  expect({ status: checked.status, ignored: checked.stdout }).toEqual({ status: 1, ignored: "" });
});
