import { expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Manifest } from "@steamfield/stacks-format";
import { Schema } from "effect";

import { binary, scratchPath } from "./package";

test("inside an agent session, the binary prints the next step and records it in the manifest [1.4#14]", async () => {
  const home = mkdtempSync(join(tmpdir(), "cli-binary-handoff-"));
  try {
    // The fixture stack as the user's own entries, which are trusted, so the handoff isn't STOP.
    const user = join(home, "config", "stacks");
    mkdirSync(user, { recursive: true });
    cpSync(join(import.meta.dir, "../tests/fixtures/registry-new/stacks"), join(user, "stacks"), {
      recursive: true,
    });
    cpSync(
      join(import.meta.dir, "../tests/fixtures/registry-new/fragments"),
      join(user, "fragments"),
      { recursive: true },
    );
    const child = Bun.spawn([binary, "new", "fixture-stack", "app", "--sandbox"], {
      cwd: home,
      env: {
        HOME: home,
        XDG_CONFIG_HOME: join(home, "config"),
        XDG_STATE_HOME: join(home, "state"),
        // An empty registry root, so only the user's entries are found.
        STACKS_REGISTRY_DIR: join(home, "empty"),
        LOG_LEVEL: "none",
        NO_COLOR: "1",
        PATH: scratchPath,
        CLAUDECODE: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(stdout.trimEnd().split("\n").at(-1)).toStartWith(
      "NEXT STEP FOR THE AGENT: read .stacks/BRIEF.md now and carry it out",
    );
    const manifest = Schema.decodeUnknownSync(Manifest)(
      JSON.parse(readFileSync(join(home, "app", ".stacks/manifest.json"), "utf8")),
      { onExcessProperty: "error" },
    );
    expect(manifest.handoff).toMatchObject({ kind: "inside-agent", agent: "claude" });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
