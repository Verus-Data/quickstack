import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";
import { version } from "../package.json";
import { Manifest } from "../src/schemas/manifest";

const binary = join(import.meta.dir, "../dist/quickstacks");
async function invoke(
  args: readonly string[],
  prepare?: (dir: string) => void,
  extra: Record<string, string> = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "cli-binary-"));
  try {
    prepare?.(dir);
    const child = Bun.spawn([binary, ...args], {
      cwd: dir,
      env: {
        HOME: dir,
        XDG_CONFIG_HOME: join(dir, "config"),
        LOG_LEVEL: "none",
        NO_COLOR: "1",
        PATH: "/usr/bin:/bin",
        ...extra,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, status };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
describe("real standalone binary", () => {
  test("reports bundled version and machine version", async () => {
    expect(await invoke(["--version"])).toEqual({ stdout: `${version}\n`, stderr: "", status: 0 });
    expect(JSON.parse((await invoke(["-v", "--json"])).stdout)).toEqual({ version });
  });
  test("doctor confirms compiled execution with no user configuration", async () => {
    const result = await invoke(["doctor", "--json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ version, compiled: true, configErrors: [] });
    expect(result.stderr).toBe("");
  });
  test("human doctor and help are readable", async () => {
    expect((await invoke(["doctor"])).stdout).toContain("Compiled: true");
    const help = await invoke(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("doctor");
    expect(help.stdout).not.toContain(String.fromCharCode(27));
  });
  test.each([
    { args: ["--unknown", "--json"] },
    { args: ["doctor", "extra", "--json"] },
    { args: ["--log-level", "--json"] },
  ])("usage errors honor streams: %j", async ({ args }) => {
    const result = await invoke(args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { tag: "Usage", retryable: false } });
  });
  test("invalid optional file is reported by doctor without failing", async () => {
    const result = await invoke(["doctor", "--json"], (dir) => {
      const config = join(dir, "config", "quickstacks");
      mkdirSync(config, { recursive: true });
      writeFileSync(join(config, "config.json"), "{invalid");
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).configErrors).toEqual(["Configuration is invalid."]);
  });
  test("list --json reads the registry QUICKSTACKS_REGISTRY_DIR names", async () => {
    const registry = join(import.meta.dir, "../tests/fixtures/registry-real");
    const result = await invoke(["list", "--json"], undefined, {
      QUICKSTACKS_REGISTRY_DIR: registry,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const listed = JSON.parse(result.stdout);
    expect(listed.rejected).toEqual([]);
    expect(listed.entries.map((row: { id: string }) => row.id)).toEqual([
      "typescript-cli",
      "effect",
      "effect-schema",
      "git-hooks",
      "openrouter-chat-cli",
    ]);
  });
  test("list with no registry suggests doctor", async () => {
    const result = await invoke(["list"]);
    expect(result).toEqual({
      stdout: "No stacks or fragments found.\n\nNext: quickstacks doctor\n",
      stderr: "",
      status: 0,
    });
  });
  test("new --sandbox --json writes the project, its brief and an executable hook", async () => {
    const out = mkdtempSync(join(tmpdir(), "cli-binary-new-"));
    try {
      const app = join(out, "app");
      const result = await invoke(["new", "fixture-stack", app, "--sandbox", "--json"], undefined, {
        QUICKSTACKS_REGISTRY_DIR: join(import.meta.dir, "../tests/fixtures/registry-new"),
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const created = JSON.parse(result.stdout);
      expect(created).toMatchObject({ project: app, stack: "fixture-stack", preset: "sandbox" });
      expect(created.written).toContain(".quickstacks/BRIEF.md");
      for (const rel of created.written) expect(existsSync(join(app, rel))).toBe(true);
      expect(readFileSync(join(app, "README.md"), "utf8")).toStartWith("# app\n");
      expect(statSync(join(app, ".githooks/pre-commit")).mode & 0o111).not.toBe(0);
      expect(existsSync(join(app, "ran"))).toBe(false);
      expect(created.stateRecord).toBe(true);
      expect(created.written).toContain(".quickstacks/manifest.json");
      const manifest = Schema.decodeUnknownSync(Manifest)(
        JSON.parse(readFileSync(join(app, ".quickstacks/manifest.json"), "utf8")),
        { onExcessProperty: "error" },
      );
      expect(manifest).toMatchObject({ schemaVersion: 1, mode: "new", preset: "sandbox" });
      expect(manifest.briefWords).toBe(created.briefWords);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
  test("does not autoload dotenv or bunfig from working directory", async () => {
    const result = await invoke(["doctor", "--json"], (dir) => {
      writeFileSync(join(dir, ".env"), "QUICKSTACKS_DATA_DIR=/should-not-load\n");
      writeFileSync(join(dir, "bunfig.toml"), 'preload = ["./poison.ts"]\n');
      writeFileSync(join(dir, "poison.ts"), 'throw new Error("unexpected preload")');
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).paths.data).not.toBe("/should-not-load");
  });
});
