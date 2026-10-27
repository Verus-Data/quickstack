import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect, Exit, type FileSystem, type Path } from "effect";
import { afterEach, expect, test } from "vitest";
import { compose } from "../src/core/compose/compose";
import { composeFiles, NEUTRAL_VARS } from "../src/core/compose/files";
import type { Entry } from "../src/core/registry/entry";
import { Registry } from "../src/core/registry/registry";
import { snapshotRegistry } from "../src/core/validate/snapshot";
import { EntryInvalid } from "../src/errors";
import { tempDir } from "./helpers/cli";
import { minimal, writeEntry } from "./helpers/registry";

const dirs: ReturnType<typeof tempDir>[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) dir.cleanup();
});

function fixture() {
  const root = tempDir();
  dirs.push(root);
  const dir = writeEntry({
    root: root.path,
    kind: "fragment",
    dir: "sample",
    frontmatter: minimal("fragment", "sample"),
  });
  mkdirSync(join(dir, "files"));
  writeFileSync(join(dir, "files/a.txt"), "original");
  return { root: root.path, dir };
}

function run<A, E>(
  root: string,
  program: Effect.Effect<A, E, Registry | FileSystem.FileSystem | Path.Path>,
) {
  return Effect.runPromise(
    program.pipe(
      Effect.provide(Registry.layer([{ origin: "user", path: root }])),
      Effect.provide(NodeServices.layer),
    ),
  );
}

const resolved = (entry: Entry): Entry => ({ ...entry, body: "Resolved conditional body" });

test("validation renders from shared checked bytes and text while standalone rendering stays fresh", async () => {
  const { root, dir } = fixture();
  writeEntry({ root, kind: "stack", dir: "base", frontmatter: minimal("stack", "base") });
  writeFileSync(join(dir, "files/a.txt"), new Uint8Array([0, 255, 128]));
  writeFileSync(join(dir, "files/name.txt.tmpl"), "{{ project_name }}");
  const render = Effect.gen(function* () {
    const registry = yield* snapshotRegistry;
    const composition = yield* compose({
      stack: "base",
      with: ["sample"],
      without: [],
      preset: "default",
      agents: ["claude"],
      always: [],
      mode: "new",
    });
    const before = yield* composeFiles(composition, NEUTRAL_VARS, registry);
    yield* Effect.sync(() => {
      writeFileSync(join(dir, "files/a.txt"), "changed");
      writeFileSync(join(dir, "files/name.txt.tmpl"), "changed {{ project_name }}");
    });
    expect(yield* composeFiles(composition, NEUTRAL_VARS, registry)).toEqual(before);
    expect(yield* composeFiles(composition, NEUTRAL_VARS)).not.toEqual(before);
    return before;
  });
  const before = await run(root, render);
  expect(before.map((file) => [...file.bytes])).toEqual([
    [0, 255, 128],
    [...new TextEncoder().encode("example")],
  ]);
  expect(
    await run(
      root,
      Effect.gen(function* () {
        const registry = yield* snapshotRegistry;
        return new TextDecoder().decode(
          yield* registry.bytes(yield* registry.get("fragment", "sample"), "files/a.txt"),
        );
      }),
    ),
  ).toBe("changed");
});

test("validation keeps one file snapshot across resolved entries and refreshes on a new instance", async () => {
  const { root, dir } = fixture();
  const read = Effect.gen(function* () {
    const registry = yield* snapshotRegistry;
    const entry = yield* registry.get("fragment", "sample");
    const original = yield* registry.read(entry, "files/a.txt");
    const listed = yield* registry.files(entry);
    yield* Effect.sync(() => {
      writeFileSync(join(dir, "files/a.txt"), "changed");
      writeFileSync(join(dir, "files/b.txt"), "new file");
    });
    expect(yield* registry.read(resolved(entry), "files/a.txt")).toBe(original);
    expect(yield* registry.files(resolved(entry))).toEqual(listed);
    return original;
  });
  expect(await run(root, read)).toBe("original");
  expect(await run(root, read)).toBe("changed");
});

test.each(["symlink", "missing"] as const)(
  "validation caches a checked %s failure across resolved entries without changing its details",
  async (reason) => {
    const { root, dir } = fixture();
    await run(
      root,
      Effect.gen(function* () {
        const registry = yield* snapshotRegistry;
        const entry = yield* registry.get("fragment", "sample");
        yield* Effect.sync(() => {
          rmSync(join(dir, "files/a.txt"));
          if (reason === "symlink") symlinkSync("/etc/hosts", join(dir, "files/a.txt"));
        });
        const expected = Exit.fail(
          new EntryInvalid({
            details: { id: "sample", origin: "user", reason, path: "files/a.txt" },
          }),
        );
        expect(yield* Effect.exit(registry.read(entry, "files/a.txt"))).toEqual(expected);
        expect(yield* Effect.exit(registry.bytes(entry, "files/a.txt"))).toEqual(expected);
        yield* Effect.sync(() => {
          if (reason === "symlink") rmSync(join(dir, "files/a.txt"));
          writeFileSync(join(dir, "files/a.txt"), "repaired");
        });
        expect(yield* Effect.exit(registry.read(resolved(entry), "files/a.txt"))).toEqual(expected);
        expect(yield* Effect.exit(registry.bytes(resolved(entry), "files/a.txt"))).toEqual(
          expected,
        );
      }),
    );
    expect(
      await run(
        root,
        Effect.gen(function* () {
          const registry = yield* snapshotRegistry;
          return yield* registry.read(yield* registry.get("fragment", "sample"), "files/a.txt");
        }),
      ),
    ).toBe("repaired");
  },
);
