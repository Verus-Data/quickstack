import { expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";
import { Manifest } from "../src/schemas/manifest";
import { minimal, writeEntry } from "../tests/helpers/registry";
import { binary, node } from "./package";

test("the built package gives the second agent stdin after the picker releases it [4.4c#9]", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "stacks-picker-pty-")));
  let transcript = "";
  let chose = false;
  let typed = false;
  const terminal = new Bun.Terminal({
    data: (pty, data) => {
      transcript += new TextDecoder().decode(data);
      if (!chose && transcript.includes("Hand the project to [1-2, Enter for 1]:")) {
        chose = true;
        pty.write("2\n");
      }
      // The agent has attached its line reader before announcing readiness.
      if (!typed && transcript.includes("SECOND_AGENT_READY")) {
        typed = true;
        pty.write("a line typed after choosing\n");
      }
    },
  });
  try {
    const user = join(home, "config/quickstack");
    const bin = join(home, "bin");
    mkdirSync(bin);
    symlinkSync(node, join(bin, "node"));
    symlinkSync("/usr/bin/git", join(bin, "git"));
    writeEntry({
      root: user,
      kind: "stack",
      dir: "picker-stack",
      frontmatter: minimal("stack", "picker-stack"),
    });
    const first = join(home, "first-ran");
    writeFileSync(
      join(bin, "claude"),
      `#!${node}
require("node:fs").writeFileSync(${JSON.stringify(first)}, "wrong agent");
`,
    );
    const recorded = join(home, "second.json");
    writeFileSync(
      join(bin, "codex"),
      `#!${node}
const fs = require("node:fs");
const reader = require("node:readline").createInterface({ input: process.stdin });
reader.once("line", (line) => {
  fs.writeFileSync(${JSON.stringify(recorded)}, JSON.stringify({
    line, argv: process.argv.slice(2), cwd: process.cwd(),
    stdinIsTTY: process.stdin.isTTY, stdoutIsTTY: process.stdout.isTTY,
  }));
  reader.close();
  process.exit(0);
});
process.stdout.write("SECOND_AGENT_READY\\n");
`,
    );
    chmodSync(join(bin, "claude"), 0o755);
    chmodSync(join(bin, "codex"), 0o755);
    const child = Bun.spawn([binary, "new", "picker-stack", "app", "--sandbox"], {
      cwd: home,
      env: {
        HOME: home,
        XDG_CONFIG_HOME: join(home, "config"),
        XDG_STATE_HOME: join(home, "state"),
        XDG_DATA_HOME: join(home, "data"),
        QUICKSTACK_REGISTRY_DIR: join(home, "empty"),
        PATH: bin,
        GIT_CONFIG_NOSYSTEM: "1",
        LOG_LEVEL: "none",
        NO_COLOR: "1",
        TERM: "dumb",
      },
      terminal,
      // Watchdog only: input is synchronized by the question and the agent's readiness marker.
      timeout: 5000,
    });
    try {
      const status = await child.exited;
      expect(status).toBe(0);
      // PTYs merge stdout and stderr; a successful handoff has no error envelope or message.
      expect(transcript).not.toContain('"error":');
      expect(transcript).not.toContain("An unexpected error occurred.");
      expect(chose).toBe(true);
      expect(typed).toBe(true);
      expect(existsSync(first)).toBe(false);
      expect(
        Schema.decodeUnknownSync(
          Schema.Struct({
            line: Schema.String,
            argv: Schema.Array(Schema.String),
            cwd: Schema.String,
            stdinIsTTY: Schema.Boolean,
            stdoutIsTTY: Schema.Boolean,
          }),
        )(JSON.parse(readFileSync(recorded, "utf8"))),
      ).toEqual({
        line: "a line typed after choosing",
        argv: [
          "Read .quickstack/BRIEF.md and carry it out. It's your full task for this project; you're done when stacks verify passes.",
        ],
        cwd: join(home, "app"),
        stdinIsTTY: true,
        stdoutIsTTY: true,
      });
      const manifest = Schema.decodeUnknownSync(Manifest)(
        JSON.parse(readFileSync(join(home, "app/.quickstack/manifest.json"), "utf8")),
      );
      expect(manifest.handoff).toMatchObject({ kind: "launch", agent: "codex" });
    } finally {
      terminal.close();
      if (child.exitCode === null) child.kill("SIGKILL");
      await child.exited;
    }
  } finally {
    terminal.close();
    rmSync(home, { recursive: true, force: true });
  }
}, 10000); // Covers installed Node startup, real git init and one interactive agent, not a build.
