import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { fakeAgent } from "./helpers/agents";
import { scriptedTerminal } from "./helpers/cli";
import {
  PICKER_PROMPT,
  type PickerWorkspace,
  pickerCli,
  pickerManifest,
  pickerNew,
  pickerWorkspace,
} from "./helpers/picker";

const workspaces: PickerWorkspace[] = [];
afterEach(() => {
  for (const w of workspaces.splice(0)) w.cleanup();
});
function workspace() {
  const w = pickerWorkspace();
  workspaces.push(w);
  mkdirSync(join(w.home, "Applications/Codex.app"), { recursive: true });
  return w;
}

test.each([false, true])(
  "the macOS Codex app opens the project URL, explicit launch: %s [4.4c#7]",
  async (explicit) => {
    const w = workspace();
    const open = fakeAgent(w.bin, "open");
    const terminal = scriptedTerminal();
    const project = join(w.home, "app 'é & #?");
    const run = await pickerCli(
      w,
      ["new", "picker-stack", project, "--sandbox", ...(explicit ? ["--launch", "codex-app"] : [])],
      {
        terminal,
        host: { platform: "darwin" },
        env: { USER_APP_SETTING: "kept" },
      },
    );
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("Opening the Codex app on");
    expect(terminal.reads).toBe(0);
    expect(terminal.displayed).toEqual([]);
    const recorded = open.run();
    expect(recorded.argv).toHaveLength(1);
    const url = new URL(recorded.argv[0] ?? "");
    expect(url.protocol).toBe("codex:");
    expect(url.hostname).toBe("new");
    expect([...url.searchParams.keys()].sort()).toEqual(["path", "prompt"]);
    expect(url.searchParams.get("path")).toBe(project);
    expect(url.searchParams.get("prompt")).toBe(PICKER_PROMPT);
    expect(recorded.cwd).toBe(project);
    expect(recorded.env).toMatchObject({ HOME: w.home, PATH: w.bin, USER_APP_SETTING: "kept" });
    expect(pickerManifest(project).handoff).toMatchObject({ kind: "launch", agent: "codex" });
  },
);

test("all six harnesses appear in launch order, with the app last and mapped to codex [4.4c#7] [4.4c#4]", async () => {
  const w = workspace();
  const installed = ["claude", "codex", "opencode", "cursor-agent", "copilot"].map((name) =>
    fakeAgent(w.bin, name),
  );
  const open = fakeAgent(w.bin, "open");
  const terminal = scriptedTerminal(["6"]);
  const run = await pickerNew(w, [], { terminal, host: { platform: "darwin" } });
  expect(run.status).toBe(0);
  expect(run.stderr).toBe("");
  expect(run.stdout).toContain("Opening the Codex app on");
  const menu = terminal.displayed.join("");
  expect(
    menu
      .split(/\r?\n/)
      .filter((line) => /^\s*\d+\)/.test(line))
      .map((line) => line.trim()),
  ).toEqual([
    "1) Claude Code",
    "2) Codex CLI",
    "3) OpenCode",
    "4) Cursor CLI",
    "5) Copilot CLI",
    "6) Codex app",
  ]);
  expect(menu).toContain("Hand the project to [1-6, Enter for 1]:");
  expect(terminal.reads).toBe(1);
  expect(open.ran()).toBe(true);
  expect(installed.every((agent) => !agent.ran())).toBe(true);
  expect(pickerManifest(w.project).handoff).toMatchObject({ kind: "launch", agent: "codex" });
});

test("the app is unavailable without open even on macOS with a bundle [4.4c#7]", async () => {
  const w = workspace();
  const terminal = scriptedTerminal();
  const run = await pickerNew(w, ["--launch", "codex-app"], {
    terminal,
    host: { platform: "darwin" },
  });
  expect(run.status).toBe(0);
  expect(run.stderr).toBe("");
  expect(run.stdout).toContain("The Codex app isn't installed (macOS only).");
  expect(run.stdout).toContain(PICKER_PROMPT);
  expect(terminal.reads).toBe(0);
  expect(pickerManifest(w.project).handoff?.kind).toBe("print");
});

// A system installation is also a valid detection path; don't alter the machine's /Applications.
test.skipIf(existsSync("/Applications/Codex.app"))(
  "open alone does not count as an installed Codex app [4.4c#7]",
  async () => {
    const w = workspace();
    rmSync(join(w.home, "Applications/Codex.app"), { recursive: true });
    const open = fakeAgent(w.bin, "open");
    const terminal = scriptedTerminal();
    const run = await pickerNew(w, ["--launch", "codex-app"], {
      terminal,
      host: { platform: "darwin" },
    });
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("The Codex app isn't installed (macOS only).");
    expect(run.stdout).toContain(PICKER_PROMPT);
    expect(terminal.reads).toBe(0);
    expect(open.ran()).toBe(false);
    expect(pickerManifest(w.project).handoff?.kind).toBe("print");
  },
);

test.each([false, true])(
  "off macOS a bundle and open never enable the app, explicit: %s [4.4c#7]",
  async (explicit) => {
    const w = workspace();
    const open = fakeAgent(w.bin, "open");
    const terminal = scriptedTerminal();
    const run = await pickerNew(w, explicit ? ["--launch", "codex-app"] : [], { terminal });
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain(PICKER_PROMPT);
    if (explicit) expect(run.stdout).toContain("The Codex app isn't installed (macOS only).");
    expect(run.stdout).not.toContain("Opening the Codex app");
    expect(run.stdout).not.toContain("For example: cd app && open");
    expect(terminal.reads).toBe(0);
    expect(open.ran()).toBe(false);
    expect(pickerManifest(w.project).handoff?.kind).toBe("print");
  },
);

test.each(["exit", "disappeared"])(
  "app opener failure (%s) prints a usable prompt and keeps the project [4.4c#7] [4.4c#14]",
  async (failure) => {
    const w = workspace();
    const open = fakeAgent(w.bin, "open", { exit: 9 });
    const terminal = scriptedTerminal();
    let removed = false;
    const run = await pickerNew(w, ["--launch", "codex-app"], {
      terminal,
      host: { platform: "darwin" },
      stdout: async (text) => {
        if (failure === "disappeared" && !removed && text.includes("Opening the Codex app")) {
          unlinkSync(open.bin);
          removed = true;
        }
      },
    });
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("");
    expect(run.stdout).toContain("Opening the Codex app on");
    expect(run.stdout).toContain(PICKER_PROMPT);
    expect(open.ran()).toBe(failure === "exit");
    if (failure === "disappeared") expect(removed).toBe(true);
    expect(terminal.reads).toBe(0);
    const manifest = pickerManifest(w.project);
    expect(manifest.handoff).toEqual({ kind: "print", at: manifest.createdAt });
    expect(readFileSync(join(w.project, "README.md"), "utf8")).toBe("# Picker project\n");
  },
);
