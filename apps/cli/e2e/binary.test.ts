import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { version } from "../package.json";

const binary = resolve("dist/quickstacks");
async function invoke(args: readonly string[], prepare?: (dir: string) => void) {
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
