import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { expect, test, vi } from "vitest";
import { DoctorReport } from "../src/schemas/doctor";
import { tempDir } from "./helpers/cli";

test.each([
  { silent: true, outside: false },
  { silent: false, outside: false },
  { silent: true, outside: true },
  { silent: false, outside: true },
])(
  "root dev echoes only its own script (silent=$silent, outside=$outside)",
  ({ silent, outside }) => {
    const dir = tempDir();
    try {
      const root = realpathSync(join(import.meta.dirname, "../../.."));
      const cwd = outside ? realpathSync(dir.path) : root;
      const result = spawnSync(
        "bun",
        [
          "run",
          ...(silent ? ["--silent"] : []),
          ...(outside ? ["--cwd", root] : []),
          "dev",
          "doctor",
          "--json",
        ],
        {
          cwd,
          encoding: "utf8",
          env: {
            PATH: process.env.PATH,
            HOME: dir.path,
            INIT_CWD: cwd,
            LOG_LEVEL: "none",
            STACKS_LOG_FILE: join(dir.path, "cli.jsonl"),
            STACKS_DATA_DIR: join(dir.path, "data"),
            STACKS_STATE_DIR: join(dir.path, "state"),
          },
        },
      );
      expect(result.status).toBe(0);
      const report = Schema.decodeUnknownSync(DoctorReport)(JSON.parse(result.stdout));
      expect(report.paths.cwd).toBe(cwd);
      if (silent) expect(result.stderr).toBe("");
      else {
        expect(result.stderr.trim().split("\n")).toHaveLength(1);
        expect(result.stderr).toMatch(/^\$ INIT_CWD=/);
        expect(result.stderr).not.toContain("$ bun scripts/dev.ts");
      }
    } finally {
      dir.cleanup();
    }
  },
);

test("dev wrapper forwards a directly delivered termination signal to its child", async () => {
  const dir = tempDir();
  mkdirSync(join(dir.path, "scripts"));
  mkdirSync(join(dir.path, "src"));
  copyFileSync(join(import.meta.dirname, "../scripts/dev.ts"), join(dir.path, "scripts/dev.ts"));
  writeFileSync(
    join(dir.path, "src/bin.ts"),
    `import { writeFileSync } from "node:fs"; writeFileSync("ready",String(process.pid)); process.on("SIGTERM",()=>{writeFileSync("terminated","yes");process.exit(143);});setInterval(()=>{},1000);`,
  );
  const child = spawn("bun", ["scripts/dev.ts"], {
    cwd: dir.path,
    detached: true,
    stdio: "ignore",
    env: { PATH: process.env.PATH, HOME: dir.path },
  });
  const closed = new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  try {
    await vi.waitFor(() => expect(existsSync(join(dir.path, "ready"))).toBe(true));
    child.kill("SIGTERM");
    await closed;
    await vi.waitFor(() => expect(existsSync(join(dir.path, "terminated"))).toBe(true), {
      timeout: 1000,
    });
    expect(readFileSync(join(dir.path, "terminated"), "utf8")).toBe("yes");
  } finally {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        expect((error as NodeJS.ErrnoException).code).toBe("ESRCH");
      }
    }
    dir.cleanup();
  }
}, 10000);

test("dev wrapper resolves a relative STACKS_REGISTRY_DIR against the caller's directory", async () => {
  const dir = tempDir();
  try {
    mkdirSync(join(dir.path, "scripts"));
    mkdirSync(join(dir.path, "src"));
    copyFileSync(join(import.meta.dirname, "../scripts/dev.ts"), join(dir.path, "scripts/dev.ts"));
    writeFileSync(
      join(dir.path, "src/bin.ts"),
      // HOME, not the cwd: the CLI runs in the caller's directory.
      `import { writeFileSync } from "node:fs"; writeFileSync(process.env.HOME + "/registry", process.env.STACKS_REGISTRY_DIR ?? "unset");`,
    );
    const caller = join(dir.path, "caller");
    mkdirSync(caller);
    for (const [value, expected] of [
      ["reg", join(caller, "reg")],
      ["/abs/reg", "/abs/reg"],
    ] as const) {
      const child = spawn("bun", ["scripts/dev.ts"], {
        cwd: dir.path,
        stdio: "ignore",
        // The root `bun run dev` script passes the directory it ran from as INIT_CWD.
        env: {
          PATH: process.env.PATH,
          HOME: dir.path,
          INIT_CWD: caller,
          STACKS_REGISTRY_DIR: value,
        },
      });
      const status = await new Promise<number | null>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });
      expect(status).toBe(0);
      expect(readFileSync(join(dir.path, "registry"), "utf8")).toBe(expected);
    }
  } finally {
    dir.cleanup();
  }
}, 10000);

test("dev wrapper keeps data and state under .dev unless the caller set its own", async () => {
  const dir = tempDir();
  try {
    mkdirSync(join(dir.path, "scripts"));
    mkdirSync(join(dir.path, "src"));
    copyFileSync(join(import.meta.dirname, "../scripts/dev.ts"), join(dir.path, "scripts/dev.ts"));
    writeFileSync(
      join(dir.path, "src/bin.ts"),
      `import { writeFileSync } from "node:fs"; writeFileSync(process.env.HOME + "/dirs", JSON.stringify({ data: process.env.STACKS_DATA_DIR, state: process.env.STACKS_STATE_DIR }));`,
    );
    const run = async (extra: Record<string, string>) => {
      const child = spawn("bun", ["scripts/dev.ts"], {
        cwd: dir.path,
        stdio: "ignore",
        env: { PATH: process.env.PATH, HOME: dir.path, ...extra },
      });
      const status = await new Promise<number | null>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });
      expect(status).toBe(0);
      return JSON.parse(readFileSync(join(dir.path, "dirs"), "utf8")) as unknown;
    };
    expect(await run({})).toEqual({
      data: join(realpathSync(dir.path), ".dev", "data"),
      state: join(realpathSync(dir.path), ".dev", "state"),
    });
    expect(await run({ STACKS_DATA_DIR: "/d", STACKS_STATE_DIR: "/s" })).toEqual({
      data: "/d",
      state: "/s",
    });
  } finally {
    dir.cleanup();
  }
}, 10000);

test("bun run dev from a subdirectory of the repository runs the CLI in that subdirectory", async () => {
  const dir = tempDir();
  try {
    // The repository's real root and package `dev` scripts, around a fake CLI that records its cwd.
    const scripts = (path: string) =>
      (JSON.parse(readFileSync(path, "utf8")) as { scripts: { dev: string } }).scripts.dev;
    const cli = join(dir.path, "packages", "cli");
    mkdirSync(join(cli, "scripts"), { recursive: true });
    mkdirSync(join(cli, "src"));
    const here = import.meta.dirname;
    writeFileSync(
      join(dir.path, "package.json"),
      JSON.stringify({ scripts: { dev: scripts(join(here, "../../../package.json")) } }),
    );
    writeFileSync(
      join(cli, "package.json"),
      JSON.stringify({ scripts: { dev: scripts(join(here, "../package.json")) } }),
    );
    copyFileSync(join(here, "../scripts/dev.ts"), join(cli, "scripts/dev.ts"));
    writeFileSync(
      join(cli, "src/bin.ts"),
      `import { writeFileSync } from "node:fs"; writeFileSync(process.env.HOME + "/seen", process.cwd());`,
    );
    const caller = join(dir.path, "work", "here");
    mkdirSync(caller, { recursive: true });
    const env: Record<string, string | undefined> = { PATH: process.env.PATH, HOME: dir.path };
    const child = spawn("bun", ["run", "dev"], { cwd: caller, stdio: "ignore", env });
    const status = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    expect(status).toBe(0);
    expect(readFileSync(join(dir.path, "seen"), "utf8")).toBe(realpathSync(caller));
  } finally {
    dir.cleanup();
  }
}, 10000);

test("dev wrapper runs the CLI in the caller's directory without loading its .env or bunfig.toml", async () => {
  const dir = tempDir();
  try {
    mkdirSync(join(dir.path, "scripts"));
    mkdirSync(join(dir.path, "src"));
    copyFileSync(join(import.meta.dirname, "../scripts/dev.ts"), join(dir.path, "scripts/dev.ts"));
    writeFileSync(
      join(dir.path, "src/bin.ts"),
      `import { writeFileSync } from "node:fs"; writeFileSync(process.env.HOME + "/seen", JSON.stringify({ cwd: process.cwd(), hostile: process.env.HOSTILE ?? null }));`,
    );
    // A caller's directory a cloned repository controls: a .env and a bunfig.toml preload.
    const caller = join(dir.path, "caller");
    mkdirSync(caller);
    writeFileSync(join(caller, ".env"), "HOSTILE=loaded\n");
    writeFileSync(join(caller, "bunfig.toml"), 'preload = ["./poison.ts"]\n');
    writeFileSync(
      join(caller, "poison.ts"),
      `require("node:fs").writeFileSync(${JSON.stringify(join(dir.path, "preloaded"))}, "yes");`,
    );
    const child = spawn("bun", ["scripts/dev.ts"], {
      cwd: dir.path,
      stdio: "ignore",
      // The root `bun run dev` script passes the directory it ran from as INIT_CWD.
      env: { PATH: process.env.PATH, HOME: dir.path, INIT_CWD: caller },
    });
    const status = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    expect(status).toBe(0);
    expect(JSON.parse(readFileSync(join(dir.path, "seen"), "utf8"))).toEqual({
      cwd: realpathSync(caller),
      hostile: null,
    });
    expect(existsSync(join(dir.path, "preloaded"))).toBe(false);
  } finally {
    dir.cleanup();
  }
}, 10000);
