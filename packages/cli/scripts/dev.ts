#!/usr/bin/env bun
// `bun run dev -- <args>`: quickstacks from source, the way a person or agent runs it while working
// here. Adds what the installed binary doesn't do:
//   - LOG_LEVEL defaults to info (the binary's default is warn), so each run logs its
//     command records.
//   - JSON log lines go to logs/cli.jsonl (QUICKSTACKS_LOG_FILE), appended across runs.
//   - stderr is copied to logs/cli.log. Both files move to *.prev.* past 5 MB.
//   - Development data is saved in .dev/data (QUICKSTACKS_DATA_DIR), not your real ~/.local/share/quickstacks.
// Everything else (stdin, stdout, the exit code, Ctrl+C) passes straight through.
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = join(import.meta.dirname, "..");
// The directory `bun run dev` was run from: Bun runs this from packages/cli and sets PWD to it,
// so the root script passes its own directory as INIT_CWD (npm sets INIT_CWD itself).
const caller = process.env.INIT_CWD || process.env.PWD || process.cwd();
const registry = process.env.QUICKSTACKS_REGISTRY_DIR;
const logs = join(root, "logs");
mkdirSync(logs, { recursive: true });

const rotate = (file: string, prev: string) => {
  if (existsSync(file) && statSync(file).size > 5 * 1024 * 1024) renameSync(file, prev);
};
rotate(join(logs, "cli.jsonl"), join(logs, "cli.prev.jsonl"));
rotate(join(logs, "cli.log"), join(logs, "cli.prev.log"));

const args = process.argv.slice(2);
// Preserve terminal capabilities for interactive invocations; structured logs remain on disk.
const interactive = process.stdin.isTTY && process.stdout.isTTY;

const child = Bun.spawn([process.execPath, join(root, "src/bin.ts"), ...args], {
  env: {
    ...process.env,
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
    QUICKSTACKS_LOG_FILE: process.env.QUICKSTACKS_LOG_FILE ?? join(logs, "cli.jsonl"),
    QUICKSTACKS_DATA_DIR: process.env.QUICKSTACKS_DATA_DIR || join(root, ".dev", "data"),
    ...(registry ? { QUICKSTACKS_REGISTRY_DIR: resolve(caller, registry) } : {}),
    // Colors survive the pipe when the real stderr is a terminal.
    ...(process.stderr.isTTY && !process.env.NO_COLOR ? { FORCE_COLOR: "1" } : {}),
  },
  stdin: "inherit",
  stdout: "inherit",
  stderr: interactive ? "inherit" : "pipe",
});

// Forward direct wrapper signals as well as terminal-delivered signals.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    if (child.exitCode === null) child.kill(signal);
  });
}

if (child.stderr) {
  const logFile = join(logs, "cli.log");
  const decoder = new TextDecoder();
  const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  for await (const chunk of child.stderr) {
    process.stderr.write(chunk);
    // Plain text in the file, like logs/cli.jsonl's fields.
    appendFileSync(logFile, decoder.decode(chunk, { stream: true }).replace(ansi, ""));
  }
}
process.exit(await child.exited);
