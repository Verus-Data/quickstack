import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, PlatformError, Terminal } from "effect";
import { Command } from "effect/cli";
import { expect, test } from "vitest";
import { cli } from "../src/cli";
import { VERSION } from "../src/version";
import { fakeAgent } from "./helpers/agents";
import { scriptedTerminal, writeError } from "./helpers/cli";
import { pickerNew, pickerWorkspace } from "./helpers/picker";

test("EOF leaves the fallback next step on its own line after the picker", async () => {
  const workspace = pickerWorkspace();
  try {
    fakeAgent(workspace.bin, "claude");
    fakeAgent(workspace.bin, "codex");
    const terminal = scriptedTerminal();
    const run = await pickerNew(workspace, [], { terminal });
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("Hand the project to [1-2, Enter for 1]: \nNext:");
    expect(terminal.reads).toBe(1);
  } finally {
    workspace.cleanup();
  }
});

test("a failed picker manifest replacement keeps the completed manifest and refuses to launch", async () => {
  const workspace = pickerWorkspace();
  const metadata = join(workspace.project, ".quickstack");
  const manifest = join(metadata, "manifest.json");
  let original: string | undefined;
  try {
    const claude = fakeAgent(workspace.bin, "claude");
    const codex = fakeAgent(workspace.bin, "codex");
    const run = await pickerNew(workspace, [], {
      terminal: scriptedTerminal(["2"]),
      stdout: async (text) => {
        if (text.includes("Agents found:")) {
          original = readFileSync(manifest, "utf8");
          chmodSync(metadata, 0o555);
        }
      },
    });
    expect(run.status).toBe(6);
    expect(run.stdout).toContain("Created app");
    expect(run.stderr).toContain("Permission denied.");
    expect(original).toBeDefined();
    expect(readFileSync(manifest, "utf8")).toBe(original);
    expect(claude.ran()).toBe(false);
    expect(codex.ran()).toBe(false);
  } finally {
    chmodSync(metadata, 0o755);
    workspace.cleanup();
  }
});

test.each(["EPIPE", "EACCES"] as const)(
  "a picker display %s follows the output failure contract",
  async (code) => {
    const workspace = pickerWorkspace();
    try {
      const claude = fakeAgent(workspace.bin, "claude");
      const codex = fakeAgent(workspace.bin, "codex");
      const args = ["new", "picker-stack", "app", "--sandbox"];
      const program = Effect.gen(function* () {
        const terminal = yield* Terminal.Terminal;
        yield* Command.runWith(cli, { version: VERSION, renderErrors: false })(args).pipe(
          Effect.provideService(
            Terminal.Terminal,
            Terminal.make({
              ...terminal,
              display: () =>
                Effect.fail(
                  PlatformError.badArgument({
                    module: "Terminal",
                    method: "display",
                    cause: writeError(code),
                  }),
                ),
            }),
          ),
        );
      });
      const run = await pickerNew(workspace, [], { program });
      expect(run.status).toBe(code === "EPIPE" ? 0 : 6);
      expect(run.stdout).toContain("Created app");
      expect(run.stderr).toBe(code === "EPIPE" ? "" : "Permission denied.\n");
      expect(claude.ran()).toBe(false);
      expect(codex.ran()).toBe(false);
    } finally {
      workspace.cleanup();
    }
  },
);
