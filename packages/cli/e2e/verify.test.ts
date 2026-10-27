import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";
import { digestSteps, encodeManifest, MANIFEST_PATH } from "../src/core/manifest";
import type { Manifest } from "../src/schemas/manifest";
import { VerifyResult } from "../src/schemas/verify";

const binary = join(import.meta.dir, "../dist/quickstack");

const unsigned: Manifest = {
  schemaVersion: 1,
  projectId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  createdAt: "2026-10-26T09:00:00.000Z",
  cli: "0.0.0",
  mode: "new",
  preset: "default",
  agents: ["claude"],
  stack: { id: "fixture-stack", origin: "bundled", trusted: true },
  fragments: [],
  env: {},
  commands: {},
  verify: [
    {
      name: "lint",
      phase: "check",
      run: "echo lint-ok",
      owner: "fixture-stack",
      skipByDefault: false,
    },
    {
      name: "test",
      phase: "check",
      run: "echo test-broke; exit 1",
      owner: "fixture-stack",
      skipByDefault: false,
    },
    {
      name: "clean",
      phase: "teardown",
      run: "touch torn",
      owner: "fixture-stack",
      skipByDefault: false,
    },
  ],
  verifyDigest: "",
  briefWords: 0,
};
/** The fixture with the digest `new` would have recorded for its steps. */
const project: Manifest = { ...unsigned, verifyDigest: digestSteps(unsigned) };

describe("verify from the real binary", () => {
  test("one passing and one failing step exit 5 with the result on stdout [1.3a#21]", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-binary-verify-"));
    try {
      const root = join(dir, "app");
      mkdirSync(join(root, ".quickstack"), { recursive: true });
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, MANIFEST_PATH), encodeManifest(project));
      const child = Bun.spawn([binary, "verify", "--json"], {
        cwd: join(root, "src"),
        env: {
          HOME: dir,
          XDG_CONFIG_HOME: join(dir, "config"),
          LOG_LEVEL: "none",
          NO_COLOR: "1",
          PATH: "/usr/bin:/bin",
          CLAUDECODE: "1",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, status] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(status).toBe(5);
      const result = Schema.decodeUnknownSync(VerifyResult)(JSON.parse(stdout), {
        onExcessProperty: "error",
      });
      expect(result.outcome).toBe("failed");
      expect(result.steps.map((s) => [s.name, s.status])).toEqual([
        ["lint", "passed"],
        ["test", "failed"],
        ["clean", "passed"],
      ]);
      expect(result.steps.find((s) => s.name === "test")?.outputTail).toContain("test-broke");
      expect(existsSync(join(root, "torn"))).toBe(true);
      expect(JSON.parse(stderr.trim().split("\n").at(-1) ?? "")).toEqual({
        error: {
          tag: "VerifyFailed",
          message: "Verify failed.",
          retryable: false,
          next: "fix the code or config these steps exercise, not the steps, then run quickstack verify again.",
          details: { failed: [{ name: "test", failureKind: "step", exitCode: 1 }] },
        },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an edited step fails VerifyChanged with exit 5, running nothing [1.3b#14]", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-binary-verify-"));
    try {
      const root = join(dir, "app");
      mkdirSync(join(root, ".quickstack"), { recursive: true });
      const edited = {
        ...project,
        verify: project.verify.map((step) =>
          step.name === "test" ? { ...step, run: "true" } : step,
        ),
      };
      writeFileSync(join(root, MANIFEST_PATH), encodeManifest(edited));
      const child = Bun.spawn([binary, "verify", "--json"], {
        cwd: root,
        env: {
          HOME: dir,
          XDG_CONFIG_HOME: join(dir, "config"),
          XDG_STATE_HOME: join(dir, "state"),
          LOG_LEVEL: "none",
          NO_COLOR: "1",
          PATH: "/usr/bin:/bin",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, status] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(status).toBe(5);
      const result = Schema.decodeUnknownSync(VerifyResult)(JSON.parse(stdout), {
        onExcessProperty: "error",
      });
      expect(result.outcome).toBe("changed");
      expect(result.tamperCheck).toBe("manifest-only");
      expect(existsSync(join(root, "torn"))).toBe(false);
      expect(JSON.parse(stderr.trim().split("\n").at(-1) ?? "")).toMatchObject({
        error: { tag: "VerifyChanged", details: { against: "manifest", reason: "digest" } },
      });
      expect(existsSync(join(root, ".quickstack", "state", "runs.jsonl"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
