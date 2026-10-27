// logs/dev.pid holds "<pid> <port>" while scripts/dev.ts runs. Shared by dev.ts and dev-bg.ts;
// paths are relative to the repo root, which both scripts chdir to.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const PID_FILE = "logs/dev.pid";

export type DevServer = { pid: number; port: string };

/** The pid file's fields, or undefined when there's no pid file. */
export function readPidFile(): { pid?: string; port?: string } | undefined {
  try {
    const [pid, port] = readFileSync(PID_FILE, "utf8").trim().split(/\s+/);
    return { pid, port };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** The dev server the pid file names, if it's a live scripts/dev.ts (not a stale pid reused by something else). */
export function runningDevServer(): DevServer | undefined {
  const { pid, port } = readPidFile() ?? {};
  if (!pid || !port) return undefined;
  const ps = spawnSync("ps", ["-o", "command=", "-p", pid], { encoding: "utf8" });
  return ps.stdout.includes("scripts/dev.ts") ? { pid: Number(pid), port } : undefined;
}
