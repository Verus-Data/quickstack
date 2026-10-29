// SessionStart: when this checkout's dev servers are running (scripts/dev.ts writes logs/dev.pid),
// say on which ports, whether each answers, where the logs are and how many warn/error records
// this run has, so the agent reuses them instead of starting more. Also says when a killed
// session left servers running. Silent when nothing runs. The report is the same one
// `bun run dev:status` prints (scripts/dev-status.ts).
//
// Plain-text stdout from a SessionStart hook is added to the agent's context. Separate from the
// agent-ops session-start hook, which stays stack-neutral.
import { devStatus } from "../../scripts/dev-status";
import { projectRoot, readPayload } from "./_lib";

readPayload(); // Unused, but read so the writer never blocks on a full pipe.

try {
  process.chdir(projectRoot());
} catch {
  process.exit(0);
}
// Short probes: the hook has 10 s in all, and a server that takes longer is reported as such.
// Advisory: a failure to build the report (an unreadable log, no `ps`) says nothing rather than
// putting a stack trace in every session; `bun run dev:status` shows the error.
try {
  const status = await devStatus(1500);
  if (status.state !== "stopped") process.stdout.write(`${status.lines.join("\n")}\n`);
} catch {
  process.exit(0);
}
