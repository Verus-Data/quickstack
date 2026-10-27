import { expect, test } from "vitest";
import { renderAdd } from "../src/core/add/report";
import type { AddResult } from "../src/schemas/add";

const result: Omit<AddResult, "handoff"> = {
  project: "/workspace/app",
  stack: null,
  added: ["ci"],
  alreadyApplied: [],
  written: ["ci.yml"],
  skipped: ["same.txt"],
  mergeNeeded: [{ path: "README.md", incoming: [".quickstacks/incoming/README.md"] }],
  missingRequired: [{ id: "required", command: "quickstacks add required" }],
  commandsKept: [],
  warnings: [{ code: "missing_tool", id: "tool" }],
  missingTools: [],
  name: { value: "app", source: "directory" },
  createdManifest: true,
  tamperCheck: null,
  stateRecord: true,
  digestRecorded: false,
  brief: ".quickstacks/BRIEF.md",
  briefWords: 123,
  untrusted: [{ id: "ci", kind: "fragment", origin: "project", dir: "local/ci" }],
};

test("the add summary keeps the shown path, merge task and actionable confirmation", () => {
  const context: Parameters<typeof renderAdd>[1] = {
    shown: "app",
    audience: "agent",
    invocation: "npx -y quickstacks@0.1.0",
  };
  const text = renderAdd(result, context);
  expect(text).toBe(
    [
      "Added ci to app",
      "Written: ci.yml",
      "Skipped: same.txt",
      "Warning: missing_tool: tool",
      "",
      "Merge needed",
      "  README.md: .quickstacks/incoming/README.md",
      "Missing required: required. Next: quickstacks add required",
      "Untrusted: ci (project): local/ci",
      "Stop: ask the user to review the new steps and run npx -y quickstacks@0.1.0 verify --accept-changes in their terminal.",
      "Brief: .quickstacks/BRIEF.md",
    ].join("\n"),
  );
  expect(renderAdd(result, { ...context, audience: "human" })).toBe(text);
});

test("entry and filesystem values cannot inject control characters into the add summary", () => {
  const text = renderAdd(
    {
      ...result,
      added: ["ci\nspoof"],
      written: ["bad\u001b.txt"],
      untrusted: [
        { ...result.untrusted[0], id: "ci", kind: "fragment", origin: "project", dir: "bad\tpath" },
      ],
    },
    { shown: "app\rpath", audience: "agent", invocation: "quickstacks" },
  );
  expect(text).toContain("Added ci\\u000aspoof to app\\u000dpath");
  expect(text).toContain("Written: bad\\u001b.txt");
  expect(text).toContain("bad\\u0009path");
  expect(text).not.toContain("\u001b");
  expect(text).not.toContain("\t");
});
