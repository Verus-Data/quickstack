import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { entrySnapshot } from "./helpers/create";
import { pickerCli, pickerManifest, pickerNew, pickerWorkspace } from "./helpers/picker";
import { choose, numberedRows, terminalScript } from "./helpers/scripted-terminal";

const workspaces: ReturnType<typeof pickerWorkspace>[] = [];
afterEach(() => {
  for (const workspace of workspaces.splice(0)) workspace.cleanup();
});
function workspace() {
  const w = pickerWorkspace();
  workspaces.push(w);
  return w;
}

test("add retries an empty selection instead of calling it an invalid command", async () => {
  const w = workspace();
  const initial = await pickerNew(w, ["--no-launch"]);
  expect(initial.status, initial.stderr).toBe(0);
  const terminal = terminalScript(["", "1"]);
  const run = await pickerCli(w, ["add", "--dir", w.project, "--no-launch"], { terminal });
  expect(run.status, run.stderr).toBe(0);
  expect(run.stderr).toBe("");
  expect(terminal.reads).toBe(2);
  expect(numberedRows(terminal.screens[0] ?? "")).toHaveLength(1);
  expect(terminal.screens[0]).toContain("picker-extra");
  expect(terminal.screens[0]).not.toContain("Enter for none");
  expect(pickerManifest(w.project).fragments.map((entry) => entry.id)).toEqual(["picker-extra"]);
});

test("add explains an empty addable set without prompting or changing the project", async () => {
  const w = workspace();
  const initial = await pickerNew(w, ["--with", "picker-extra", "--no-launch"]);
  expect(initial.status, initial.stderr).toBe(0);
  const before = snapshot(w.project);
  const terminal = terminalScript();
  const run = await pickerCli(w, ["add", "--dir", w.project, "--no-launch"], { terminal });
  expect(run.status, run.stderr).toBe(0);
  expect(run.stderr).toBe("");
  expect(run.stdout).toContain("No fragments are available to add.");
  expect(run.stdout).not.toContain("Running:");
  expect(terminal.reads).toBe(0);
  expect(snapshot(w.project)).toEqual(before);
});

test("new rejects invalid template values before printing a replay command", async () => {
  const w = workspace();
  const terminal = terminalScript([choose("picker-stack"), "", "", w.project]);
  const run = await pickerCli(
    w,
    ["new", "--no-launch", "--dry-run", "--name", "bad\u001b[2Jname"],
    { terminal },
  );
  expect(run.status).toBe(2);
  expect(run.stderr).toContain("Invalid input.");
  expect(run.stdout).not.toContain("Running:");
  expect(run.stdout + run.stderr).not.toContain("\u001b");
  expect(existsSync(w.project)).toBe(false);
});

test("a rejected picked directory cannot inject terminal controls through Running", async () => {
  const w = workspace();
  const target = join(w.home, "bad\u001b[2Jdir");
  const terminal = terminalScript([choose("picker-stack"), "", target]);
  const run = await pickerCli(w, ["new", "--no-launch", "--dry-run", "--preset", "default"], {
    terminal,
  });
  expect(run.status).toBe(2);
  expect(run.stdout).toContain("Running:");
  expect(run.stdout).toContain("\\u001b[2Jdir");
  expect(run.stdout + run.stderr).not.toContain("\u001b");
  expect(existsSync(target)).toBe(false);
});

function snapshot(project: string) {
  return entrySnapshot(project).map(({ bytes, ...entry }) => ({
    ...entry,
    digest: bytes && createHash("sha256").update(bytes).digest("hex"),
  }));
}
