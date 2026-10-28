import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { humanPlan } from "../scripts/human";
import { writeProject } from "../tests/helpers/verify";
import { binary, node, scratchPath } from "./package";

// package.ts installs the gate's already-packed tarball once. Reuse human's script(1)
// machinery with that installed Node entry rather than its checkout-only dist/stacks path.
test("the installed Node package colors human verify and respects NO_COLOR [4.4a#7]", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "stacks-human-color-")));
  const root = join(home, "project with spaces");
  mkdirSync(root);
  writeProject(root, [{ name: "lint", run: "true" }]);
  const run = async (noColor: string) => {
    const plan = humanPlan({
      command: [node, binary],
      args: ["verify"],
      platform: process.platform,
      env: {
        HOME: home,
        XDG_CONFIG_HOME: join(home, "config"),
        XDG_STATE_HOME: join(home, "state"),
        PATH: scratchPath,
        LOG_LEVEL: "none",
        TERM: "xterm-256color",
        FORCE_COLOR: "1",
        NO_COLOR: noColor,
        CLAUDECODE: "1",
        CODEX_THREAD_ID: "inherited",
      },
    });
    if ("error" in plan) throw new Error(plan.error);
    const child = Bun.spawn(plan.argv, {
      env: plan.env,
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, status };
  };
  try {
    const colored = await run("");
    expect(colored.status).toBe(0);
    expect(colored.stderr).toBe(""); // script(1) merges the CLI's streams into its stdout.
    expect(colored.stdout).toContain("verify:");
    const ESC = "\u001b";
    expect(colored.stdout).toMatch(new RegExp(`${ESC}\\[[\\d;]*mpassed\\s*${ESC}\\[[\\d;]*m`));
    const plain = await run("1");
    expect(plain.status).toBe(0);
    expect(plain.stderr).toBe("");
    expect(plain.stdout).toContain("verify: green");
    expect(plain.stdout).toMatch(/passed\s+check\s+lint/);
    expect(plain.stdout).not.toContain("\u001b");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}, 30_000); // Two Node launches under script(1); packing and installation happen outside this test.
