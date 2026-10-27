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
  mergeNeeded: [{ path: "README.md", incoming: [".stacks/incoming/README.md"] }],
  missingRequired: [{ id: "required", command: "stacks add required" }],
  commandsKept: [],
  warnings: [
    { code: "missing_tool", id: "tool" },
    { code: "stack_unknown", id: "gone-stack" },
  ],
  missingTools: [
    {
      tool: "tool",
      owners: [{ kind: "fragment", id: "ci" }],
      drop: [{ id: "ci", flag: "with" }],
    },
  ],
  name: { value: "app", source: "directory" },
  createdManifest: true,
  tamperCheck: null,
  stateRecord: true,
  digestRecorded: false,
  brief: ".stacks/BRIEF.md",
  briefWords: 123,
  untrusted: [{ id: "ci", kind: "fragment", origin: "project", dir: "local/ci" }],
};

test("the add summary keeps the shown path, merge task and actionable confirmation", () => {
  const context: Parameters<typeof renderAdd>[1] = {
    shown: "app",
    audience: "agent",
    invocation: "npx -y stacks@0.1.0",
  };
  const text = renderAdd(result, context);
  expect(text).toBe(
    [
      "Added ci to app",
      "Written: ci.yml",
      "Skipped: same.txt",
      "Missing tool: tool not found (needed by ci)",
      "Warning: the manifest's stack gone-stack is in no registry; composed without it",
      "",
      "Merge needed",
      "  README.md: .stacks/incoming/README.md",
      "Missing required: required. Next: stacks add required",
      "Untrusted: ci (project): local/ci",
      "Stop: ask the user to review the new steps and run npx -y stacks@0.1.0 verify --accept-changes in their terminal.",
      "Brief: .stacks/BRIEF.md",
    ].join("\n"),
  );
  expect(renderAdd(result, { ...context, audience: "human" })).toBe(text);
});

test("adding to the current directory doesn't name it as a dot", () => {
  const text = renderAdd(result, { shown: ".", audience: "agent", invocation: "stacks" });
  expect(text.split("\n")[0]).toBe("Added ci");
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
    { shown: "app\rpath", audience: "agent", invocation: "stacks" },
  );
  expect(text).toContain("Added ci\\u000aspoof to app\\u000dpath");
  expect(text).toContain("Written: bad\\u001b.txt");
  expect(text).toContain("bad\\u0009path");
  expect(text).not.toContain("\u001b");
  expect(text).not.toContain("\t");
});
