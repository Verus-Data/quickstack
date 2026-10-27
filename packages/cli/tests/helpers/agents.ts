import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** What a fake agent recorded about the run that started it. */
export type AgentRun = {
  argv: string[];
  cwd: string;
  /** Its own process group, and its parent's (the CLI's), from `ps`. */
  pgid: string;
  parentPgid: string;
  env: Record<string, string>;
};

/**
 * Writes an executable `name` into `dir` (a directory the test puts on PATH): a small Node
 * script that records its argv, cwd, process groups and environment to `<dir>/<name>.run.json`.
 * `behavior` picks what it does next: exit with `code`, wait for SIGTERM (writing
 * `<name>.ready`, then `<name>.SIGTERM` and exiting 143), or kill itself with SIGTERM.
 * The shebang names this Node by absolute path, so the script runs whatever PATH the test sets.
 */
export function fakeAgent(
  dir: string,
  name: string,
  behavior: { exit: number } | "wait-for-sigterm" | "die-by-sigterm" = { exit: 0 },
): { bin: string; ran: () => boolean; run: () => AgentRun } {
  mkdirSync(dir, { recursive: true });
  const bin = join(dir, name);
  const out = join(dir, `${name}.run.json`);
  const next =
    behavior === "wait-for-sigterm"
      ? `fs.writeFileSync(${JSON.stringify(`${bin}.ready`)}, "yes");
process.on("SIGTERM", () => { fs.writeFileSync(${JSON.stringify(`${bin}.SIGTERM`)}, "yes"); process.exit(143); });
setInterval(() => {}, 1000);`
      : behavior === "die-by-sigterm"
        ? `process.kill(process.pid, "SIGTERM");`
        : `process.exit(${behavior.exit});`;
  writeFileSync(
    bin,
    `#!${process.execPath}
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const pgid = (pid) => execFileSync("/bin/ps", ["-o", "pgid=", "-p", String(pid)]).toString().trim();
fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  pgid: pgid(process.pid),
  parentPgid: pgid(process.ppid),
  env: process.env,
}));
${next}
`,
  );
  chmodSync(bin, 0o755);
  return {
    bin,
    ran: () => existsSync(out),
    run: () => JSON.parse(readFileSync(out, "utf8")) as AgentRun,
  };
}
