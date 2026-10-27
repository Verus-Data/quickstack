import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, FileSystem } from "effect";
import { Command } from "effect/cli";
import { afterEach, expect, test, vi } from "vitest";
import { cli } from "../src/cli";
import { VERSION } from "../src/version";
import {
  createCli,
  createFailure,
  createWorkspace,
  entryPath,
  entrySnapshot,
  putCreate,
  releaseCreate,
  userRoot,
} from "./helpers/create";
import { minimal, writeEntry } from "./helpers/registry";

afterEach(releaseCreate);

// A pending filesystem operation can already have written bytes when it is cancelled. Pause
// before I/O or after real output exists, including bulk copies, atomic renames and file handles.
// The injected wait is interruptible even when the caller masks its mutation and bookkeeping.
function blockedCommand(
  args: string[],
  target: string,
  when: "before" | "during",
  files: number,
  marker: string,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const checkpoint = (path: string, stage: "before" | "during") =>
      Effect.gen(function* () {
        if ((path === target || path.startsWith(`${target}/`)) && when === stage) {
          const written =
            stage === "during"
              ? entrySnapshot(target).filter((entry) => entry.type === "file").length
              : 0;
          if (written < files) return;
          yield* Effect.sync(() => writeFileSync(marker, "blocked\n"));
          yield* Effect.interruptible(Effect.never);
        }
      });
    const mutation = <A, E, R>(path: string, operation: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        yield* checkpoint(path, "before");
        const result = yield* operation;
        yield* checkpoint(path, "during");
        return result;
      });
    const gated = FileSystem.make({
      ...fs,
      writeFile: (...params) => mutation(params[0], fs.writeFile(...params)),
      copy: (...params) => mutation(params[1], fs.copy(...params)),
      copyFile: (...params) => mutation(params[1], fs.copyFile(...params)),
      rename: (...params) => mutation(params[1], fs.rename(...params)),
      open: (path, options) =>
        Effect.gen(function* () {
          const writing = /[wa+]/.test(options?.flag ?? "r");
          if (writing) yield* checkpoint(path, "before");
          const file = yield* fs.open(path, options);
          if (!writing) return file;
          return new Proxy(file, {
            get(handle, key, receiver) {
              if (key === "write")
                return (bytes: Uint8Array) => mutation(path, handle.write(bytes));
              if (key === "writeAll")
                return (bytes: Uint8Array) => mutation(path, handle.writeAll(bytes));
              return Reflect.get(handle, key, receiver);
            },
          });
        }),
    });
    yield* Command.runWith(cli, { version: VERSION, renderErrors: false })(args).pipe(
      Effect.provideService(FileSystem.FileSystem, gated),
    );
  });
}

test.each([
  { kind: "stack", from: false, when: "before", files: 0 },
  { kind: "stack", from: false, when: "during", files: 1 },
  { kind: "stack", from: false, when: "during", files: 2 },
  { kind: "stack", from: false, when: "during", files: 3 },
  { kind: "fragment", from: true, when: "before", files: 0 },
  { kind: "fragment", from: true, when: "during", files: 1 },
  { kind: "fragment", from: true, when: "during", files: 2 },
  { kind: "fragment", from: true, when: "during", files: 3 },
] as const)(
  "interruption $when filesystem I/O with at least $files output files rolls back create ($kind, copy=$from) and keeps siblings [3.1b#18]",
  async ({ kind, from, when, files }) => {
    const home = createWorkspace();
    const registry = createWorkspace();
    const entry = writeEntry(registry, "fragment", "x", minimal("fragment", "x"));
    putCreate(entry, "files/a.txt", "first\n");
    putCreate(entry, "adapters/claude/b.txt", "second\n");
    const original = entrySnapshot(registry);
    // This was already present and belongs to the author, not the interrupted command.
    mkdirSync(userRoot(home), { recursive: true });
    putCreate(userRoot(home), "keep.txt", "personal file\n");
    mkdirSync(join(userRoot(home), "empty-before"));
    const before = entrySnapshot(userRoot(home));
    const args = ["create", kind, "x", ...(from ? ["--from", "bundled"] : []), "--json"];
    const target = entryPath(home, kind, "x");
    const marker = join(home, "write-blocked");
    const controller = new AbortController();
    let settled = false;
    const pending = createCli(home, args, {
      host: { registry },
      signal: controller.signal,
      program: blockedCommand(args, target, when, files, marker),
    }).finally(() => {
      settled = true;
    });
    let run: Awaited<typeof pending>;
    try {
      await vi.waitFor(() => expect(settled || existsSync(marker)).toBe(true), { timeout: 5000 });
      expect(existsSync(marker), "create must reach the blocked write before interruption").toBe(
        true,
      );
      if (when === "during")
        expect(
          entrySnapshot(target).filter((entry) => entry.type === "file").length,
        ).toBeGreaterThanOrEqual(files);
    } finally {
      controller.abort();
      run = await pending;
    }
    createFailure(run, 130, "Interrupted");
    expect(existsSync(target)).toBe(false);
    expect(entrySnapshot(userRoot(home))).toEqual(before);
    expect(entrySnapshot(registry)).toEqual(original);
  },
);
