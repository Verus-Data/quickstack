import { afterEach, expect, test } from "vitest";
import { findingsAre, fragment, rotWorkspace, ship, stack, validateRot } from "./helpers/rot";

const space = rotWorkspace();
afterEach(() => space.cleanup());
const validate = (root: string) => validateRot(root, { home: space.temp() });
const codex = (event: string, command: string) => ({
  hooks: { [event]: [{ hooks: [{ type: "command", command }] }] },
});
const cursor = (event: string, command: string) => ({
  version: 1,
  hooks: { [event]: [{ command }] },
});

test.each([
  {
    path: "opencode.json",
    config: { formatter: { check: { Command: ["bun", "run", "missing"] } } },
  },
  { path: "opencode.json", config: { permission: { Bash: { "bun run missing": "allow" } } } },
  { path: ".codex/hooks.json", config: codex("PretoolUse", "bun run missing") },
  { path: ".cursor/hooks.json", config: cursor("pretoolUse", "bun run missing") },
])(
  "malformed nested keys and event names yield one format finding: $config",
  async ({ path, config }) => {
    const root = space.temp();
    const entry = stack(root);
    ship(entry, `files/${path}`, JSON.stringify(config));
    findingsAre((await validate(root)).report.findings, [
      ["ref-config", "error", { entry: "sample", file: `stacks/sample/files/${path}` }],
    ]);
  },
);

test("partial merged Cursor contributors retain the missing script's owner and line", async () => {
  const root = space.temp();
  const entry = stack(
    root,
    "sample",
    "merge: [.cursor/hooks.json]\nfragments:\n  required: [hooks]",
  );
  const owner = fragment(root, "hooks", "merge: [.cursor/hooks.json]");
  ship(entry, "files/.cursor/hooks.json", JSON.stringify({ version: 1, hooks: {} }));
  ship(
    owner,
    "files/.cursor/hooks.json",
    JSON.stringify(
      {
        hooks: { preToolUse: [{ command: "bash hooks/missing.sh" }] },
      },
      null,
      2,
    ),
  );
  for (const target of [root, owner]) {
    const { report } = await validate(target);
    findingsAre(report.findings, [
      [
        "ref-hook",
        "error",
        {
          entry: "hooks",
          file: "fragments/hooks/files/.cursor/hooks.json",
          text: ["hooks/missing.sh"],
        },
      ],
    ]);
    expect(report.findings[0]?.line).toBe(5);
  }
});

test.each([
  "bash .cursor/hooks/check.sh > logs/hook.log",
  "bash .cursor/hooks/check.sh input/data.json",
])(
  "hook data operands and redirection destinations are not shipped scripts: %s",
  async (command) => {
    const root = space.temp();
    const entry = stack(root);
    ship(entry, "files/.cursor/hooks.json", JSON.stringify(cursor("preToolUse", command)));
    ship(entry, "files/.cursor/hooks/check.sh", "#!/bin/sh\nexit 0\n");
    findingsAre((await validate(root)).report.findings, []);
  },
);

test.each([
  { path: ".codex/hooks.json", config: codex("PreFutureEvent", "bun run lint") },
  { path: ".cursor/hooks.json", config: cursor("beforeFutureEvent", "bun run lint") },
])("a hook event the CLI doesn't know yet is not a finding: $path", async ({ path, config }) => {
  const root = space.temp();
  const entry = stack(root, "sample", 'commands: { lint: "Lint" }');
  ship(entry, `files/${path}`, JSON.stringify(config));
  findingsAre((await validate(root)).report.findings, []);
});

test.each(["hook", "formatter"])(
  "%s checks an explicit project-root script path",
  async (format) => {
    const root = space.temp();
    const entry = stack(root);
    const path = format === "hook" ? ".cursor/hooks.json" : "opencode.json";
    const config =
      format === "hook"
        ? cursor("preToolUse", "bash ./missing.sh")
        : { formatter: { check: { command: ["bash", "./missing.sh"] } } };
    ship(entry, `files/${path}`, JSON.stringify(config));
    findingsAre((await validate(root)).report.findings, [
      ["ref-hook", "error", { entry: "sample", text: ["missing.sh"] }],
    ]);
    ship(entry, "files/missing.sh", "#!/bin/sh\nexit 0\n");
    findingsAre((await validate(root)).report.findings, []);
  },
);
