// A separate OS process using the same real command tree and NodeServices as runCli.
import { join } from "node:path";
import { runCli } from "../../helpers/cli";

const [home, url] = process.argv.slice(2);
if (!home || !url) throw new Error("Usage: flush-worker.ts HOME URL");
const options = {
  home,
  releaseBuild: true,
  env: {
    HOME: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_STATE_HOME: join(home, "state"),
    STACKS_TELEMETRY_URL: url,
    NO_COLOR: "1",
    LOG_LEVEL: "none",
  },
};
const result = await runCli(["telemetry", "flush", "--json"], options);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.status;
