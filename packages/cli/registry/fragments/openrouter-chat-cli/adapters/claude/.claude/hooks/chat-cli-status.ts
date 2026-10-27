import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDir, projectRoot, readPayload } from "./_lib";

readPayload();
const lines: string[] = [];
const say = (line: string) => lines.push(line);
// OpenTUI loads a native library from an optional package per platform. bun skips optional
// packages it can't install, so a missing one shows up only when the TUI starts.
function openTuiNative(): void {
  if (!existsSync("node_modules/@opentui/core/package.json")) return;
  const base = `@opentui/core-${process.platform}-${process.arch}`;
  const candidates = process.platform === "linux" ? [base, `${base}-musl`] : [base];
  if (candidates.some((name) => isDir(join("node_modules", name)))) return;
  say(
    `node_modules/${base} is missing, so OpenTUI can't load its native library: the TUI, doctor --tui, and bun run test:tui fail on this machine. Run \`bun install\` (it installs the optional package for this platform); everything else works without it.`,
  );
}

// The stub OpenRouter and releases servers started by `bun run stub` from this checkout
// (logs/stub.pid holds "<pid> ..."; the process's command names scripts/stub-server.ts, so a stale
// pid reused by something else is ignored).
function stub(): void {
  if (!existsSync("logs/stub.pid")) return;
  const [pid] = readFileSync("logs/stub.pid", "utf8").trim().split(/\s+/);
  if (!pid || !/^[0-9]+$/.test(pid)) return;
  const ps = spawnSync("ps", ["-o", "command=", "-p", pid], { encoding: "utf8" });
  if (!ps.stdout?.includes("scripts/stub-server.ts")) return;
  say(
    `The application stub servers are running (pid ${pid}); \`bun run stub\` prints the env that points the CLI at them. \`bun run stub:stop\` stops them; leave them running if the user started them.`,
  );
}

try {
  process.chdir(projectRoot());
} catch {
  process.exit(0);
}
openTuiNative();
stub();
if (lines.length) process.stdout.write(`${lines.join("\n")}\n`);
