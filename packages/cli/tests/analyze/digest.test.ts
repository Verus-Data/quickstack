import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Exit } from "effect";
import { describe, expect, test } from "vitest";
import { computeDigest } from "../../src/core/analyze/inventory";
import { runFs } from "./helpers";

const TREE = join(import.meta.dirname, "..", "fixtures", "analyze", "tree");

function copyTree(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else {
      copyFileSync(from, to);
    }
  }
}

async function digest(
  target: string,
  options?: { excludeGlobs?: readonly string[]; outputFile?: string },
) {
  const exit = await runFs(
    computeDigest(target, {
      excludeGlobs: options?.excludeGlobs ?? [],
      outputFile: options?.outputFile,
    }),
  );
  if (Exit.isFailure(exit)) throw new Error(`digest failed: ${String(exit.cause)}`);
  return exit.value;
}

describe("digest determinism", () => {
  test("the same tree twice produces the same digest", async () => {
    const a = await digest(TREE);
    const b = await digest(TREE);
    expect(a.digest).toBe(b.digest);
    expect(a.files).toBe(b.files);
    expect(a.bytes).toBe(b.bytes);
  });

  test("excludes node_modules, dist, .git from the count", async () => {
    const result = await digest(TREE);
    expect(result.files).toBe(6);
    expect(result.excluded).toContain("node_modules");
  });

  test("changing a file byte changes the digest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digest-change-"));
    try {
      copyTree(TREE, dir);
      const before = await digest(dir);
      const file = join(dir, "src", "add.ts");
      const content = readFileSync(file, "utf8");
      writeFileSync(file, `${content}\n// extra\n`, "utf8");
      const after = await digest(dir);
      expect(after.digest).not.toBe(before.digest);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("adding a file changes the digest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digest-add-"));
    try {
      copyTree(TREE, dir);
      const before = await digest(dir);
      writeFileSync(join(dir, "src", "new.ts"), "export const x = 1;\n", "utf8");
      const after = await digest(dir);
      expect(after.digest).not.toBe(before.digest);
      expect(after.files).toBe(before.files + 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("renaming a file changes the digest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digest-rename-"));
    try {
      copyTree(TREE, dir);
      const before = await digest(dir);
      renameSync(join(dir, "src", "add.ts"), join(dir, "src", "renamed.ts"));
      const after = await digest(dir);
      expect(after.digest).not.toBe(before.digest);
      expect(after.files).toBe(before.files);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("touching mtime does not change the digest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digest-mtime-"));
    try {
      copyTree(TREE, dir);
      const before = await digest(dir);
      const now = Date.now() / 1000;
      utimesSync(join(dir, "src", "add.ts"), now, now);
      const after = await digest(dir);
      expect(after.digest).toBe(before.digest);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an ignored root does not change the digest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digest-ignore-"));
    try {
      copyTree(TREE, dir);
      const before = await digest(dir);
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(join(dir, "dist", "out.js"), "built();\n", "utf8");
      const after = await digest(dir);
      expect(after.digest).toBe(before.digest);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("never reads the output file when it sits inside the target", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digest-out-"));
    try {
      copyTree(TREE, dir);
      const out = join(dir, "record.sarif");
      writeFileSync(out, '{"version":"2.1.0","runs":[]}', "utf8");
      const before = await digest(dir, { outputFile: out });
      writeFileSync(out, '{"version":"2.1.0","runs":[1,2,3]}', "utf8");
      const after = await digest(dir, { outputFile: out });
      expect(after.digest).toBe(before.digest);
      expect(after.files).toBe(6);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--exclude globs remove matching paths", async () => {
    const result = await digest(TREE, { excludeGlobs: ["src/calc/**"] });
    expect(result.files).toBe(5);
  });

  test("a symlink pointing outside the tree is skipped, counted, and does not change the digest", async () => {
    const outside = mkdtempSync(join(tmpdir(), "digest-outside-"));
    const dir = mkdtempSync(join(tmpdir(), "digest-symlink-"));
    try {
      writeFileSync(join(outside, "secret.txt"), "outside-the-tree\n", "utf8");
      copyTree(TREE, dir);
      const before = await digest(dir);
      symlinkSync(join(outside, "secret.txt"), join(dir, "leak.link"));
      const after = await digest(dir);
      expect(after.digest).toBe(before.digest);
      expect(after.files).toBe(before.files);
      expect(after.skippedSymlinks).toBe(1);
      expect(before.skippedSymlinks).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("generated directories (.ruff_cache, __pycache__) do not change the digest or counts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "digest-gen-"));
    try {
      copyTree(TREE, dir);
      const before = await digest(dir);
      mkdirSync(join(dir, ".ruff_cache"), { recursive: true });
      mkdirSync(join(dir, ".ruff_cache", "0.15.10"), { recursive: true });
      writeFileSync(join(dir, ".ruff_cache", "CACHEDIR.TAG"), "tag\n", "utf8");
      writeFileSync(join(dir, ".ruff_cache", "0.15.10", "7097003662734728837"), "cache\n", "utf8");
      mkdirSync(join(dir, "__pycache__"), { recursive: true });
      writeFileSync(join(dir, "__pycache__", "calc.cpython.pyc"), "pyc\n", "utf8");
      const after = await digest(dir);
      expect(after.digest).toBe(before.digest);
      expect(after.files).toBe(before.files);
      expect(after.bytes).toBe(before.bytes);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
