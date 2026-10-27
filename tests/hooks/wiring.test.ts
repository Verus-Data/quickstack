import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hookCommand, REPO, wiredCommands } from "../helpers/hooks";

describe("hook wiring", () => {
  it("wires each script exactly once and points to existing files", () => {
    const commands = wiredCommands();
    expect(new Set(commands).size).toBe(commands.length);
    for (const command of commands) {
      const path = /"\$\{CLAUDE_PROJECT_DIR\}(\/[^"]+)"/.exec(command)?.[1];
      expect(path, command).toBeDefined();
      expect(existsSync(`${REPO}${path}`), command).toBe(true);
    }
  });
  it.each([
    ["PreToolUse", "guard-commands", "Bash"],
    ["PreToolUse", "guard-generated", "Write"],
    ["PreToolUse", "guard-generated", "Edit"],
    ["PreToolUse", "guard-repo-content", "Write"],
    ["PreToolUse", "guard-repo-content", "Edit"],
    ["PostToolUse", "typecheck-on-write", "Write"],
    ["PostToolUse", "typecheck-on-write", "Edit"],
  ])("wires %s %s for %s", (event, name, tool) => {
    expect(() => hookCommand(event, name, tool)).not.toThrow();
  });
});
