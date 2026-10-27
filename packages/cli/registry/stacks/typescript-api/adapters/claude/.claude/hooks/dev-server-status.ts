// SessionStart: when a dev server from this checkout is already running (scripts/dev.ts writes
// "<pid> <port>" to logs/dev.pid), say so, so the agent reuses it instead of starting another, and
// count the warn/error lines already in its log.
//
// Plain-text stdout from a SessionStart hook is added to the agent's context. Separate from the
// agent-ops session-start hook, which stays stack-neutral.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { projectRoot, readPayload } from "./_lib";

readPayload(); // Unused, but read so the writer never blocks on a full pipe.

function devServer(): string | undefined {
  if (!existsSync("logs/dev.pid")) return undefined;
  const [pid, port] = readFileSync("logs/dev.pid", "utf8").trim().split(/\s+/);
  if (!pid || !port) return undefined;
  const ps = spawnSync("ps", ["-o", "command=", "-p", pid], { encoding: "utf8" });
  if (!ps.stdout?.includes("scripts/dev.ts")) return undefined;
  const log = existsSync("logs/server.jsonl") ? readFileSync("logs/server.jsonl", "utf8") : "";
  const problems = log
    .split("\n")
    .filter((line) => /"level":"(warn|error|fatal)"/.test(line)).length;
  let note = `A dev server is running at http://localhost:${port} (pid ${pid}); use it rather than starting another.`;
  if (problems > 0) {
    note += ` logs/server.jsonl has ${problems} warn/error line(s) from this run: jq -c 'select(.level == "warn" or .level == "error" or .level == "fatal")' logs/server.jsonl`;
  }
  return note;
}

try {
  process.chdir(projectRoot());
} catch {
  process.exit(0);
}
const note = devServer();
if (note) process.stdout.write(`${note}\n`);
