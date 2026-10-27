import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const binary = join(import.meta.dir, "../dist/quickstacks");

function sample(args: readonly string[]) {
  const home = mkdtempSync(join(tmpdir(), "cli-binary-budget-"));
  try {
    const result = Bun.spawnSync([binary, ...args], {
      cwd: home,
      env: {
        HOME: home,
        XDG_CONFIG_HOME: join(home, "config"),
        XDG_STATE_HOME: join(home, "state"),
        LOG_LEVEL: "none",
        NO_COLOR: "1",
        PATH: "/usr/bin:/bin",
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const { user, system } = result.resourceUsage.cpuTime;
    return {
      status: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      cpuSeconds: (Number(user) + Number(system)) / 1_000_000,
    };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test.each([
  {
    args: ["validate", "--brief", "typescript-cli"],
    output: "# Build",
    // Validating the whole registry for one preview cost 1.5 s; today's preview is 0.1-0.5 s,
    // depending on load.
    budget: 1.0,
  },
  {
    args: ["validate"],
    output: "(bundled registry)",
    // Guard against registry validation CPU regressions; today's CPU cost is ~1.2 s.
    budget: 3.5,
  },
])(
  "$args stays within its CPU budget",
  ({ args, output, budget }) => {
    const samples: number[] = [];
    for (let run = 0; run < 3; run++) {
      const result = sample(args);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(output);
      expect(result.stderr).toBe("");
      expect(result.cpuSeconds).toBeGreaterThan(0);
      samples.push(result.cpuSeconds);
    }
    const cpuSeconds = Math.min(...samples);
    expect(
      cpuSeconds,
      `${args.join(" ")}: lowest CPU time ${cpuSeconds.toFixed(3)} s exceeds budget ${budget} s`,
    ).toBeLessThanOrEqual(budget);
  },
  60_000,
);
