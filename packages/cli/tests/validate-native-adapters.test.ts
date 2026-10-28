import { afterEach, expect, test } from "vitest";
import { findingsAre, fragment, rotWorkspace, ship, stack, validateRot } from "./helpers/rot";
import { missingSearchNotes } from "./helpers/search-fixture";

const space = rotWorkspace();
afterEach(() => space.cleanup());
const validate = (root: string) => validateRot(root, { home: space.temp() });

const formats = [
  {
    agent: "codex",
    path: ".codex/hooks.json",
    script: ".codex/hooks/check.sh",
    config: (command: string) => ({
      hooks: { PreToolUse: [{ matcher: "^Bash$", hooks: [{ type: "command", command }] }] },
    }),
  },
  {
    agent: "cursor",
    path: ".cursor/hooks.json",
    script: ".cursor/hooks/check.sh",
    config: (command: string) => ({
      version: 1,
      hooks: { preToolUse: [{ matcher: "Shell", command }] },
    }),
  },
  {
    agent: "opencode",
    path: "opencode.json",
    script: ".opencode/hooks/check.sh",
    config: (command: string) => ({
      formatter: { check: { command: ["sh", "-c", command], extensions: [".ts"] } },
    }),
  },
] as const;

test.each(
  formats.flatMap((format) =>
    ["missing-file", "missing-command", "valid-file", "valid-command"].map((state) => ({
      ...format,
      state,
    })),
  ),
)("$agent checks $state references exactly [3.4b#2]", async (format) => {
  const root = space.temp();
  const entry = stack(root, "sample", 'commands: { lint: "Lint" }');
  const source = `adapters/${format.agent}/${format.path}`;
  const fileRef = format.state.endsWith("file");
  const command = fileRef
    ? `bash "${format.script}"`
    : `bun run ${format.state === "valid-command" ? "lint" : "missing"}`;
  ship(entry, source, JSON.stringify(format.config(command)));
  if (format.state === "valid-file") ship(entry, `files/${format.script}`, "#!/bin/sh\nexit 0\n");
  const { report } = await validate(root);
  if (format.state.startsWith("valid"))
    findingsAre(report.findings, [...missingSearchNotes({ stacks: ["sample"] })]);
  else
    findingsAre(report.findings, [
      ...missingSearchNotes({ stacks: ["sample"] }),
      [
        fileRef ? "ref-hook" : "ref-command",
        "error",
        {
          entry: "sample",
          file: `stacks/sample/${source}`,
          text: [fileRef ? format.script : "missing"],
        },
      ],
    ]);
});

test.each(formats)(
  "$agent malformed JSON yields one ref-json and no cascading references [3.4b#2]",
  async (format) => {
    const root = space.temp();
    const entry = stack(root);
    const source = `adapters/${format.agent}/${format.path}`;
    ship(entry, source, `${JSON.stringify(format.config("bun run missing")).slice(0, -1)},`);
    findingsAre((await validate(root)).report.findings, [
      ...missingSearchNotes({ stacks: ["sample"] }),
      [
        "ref-json",
        "error",
        {
          entry: "sample",
          file: `stacks/sample/${source}`,
        },
      ],
    ]);
  },
);

test.each(["malformed", "missing-file", "missing-command", "valid-file", "valid-command"])(
  "Codex TOML checks %s without JSON assumptions [3.4b#2]",
  async (state) => {
    const root = space.temp();
    const entry = stack(root, "sample", 'commands: { lint: "Lint" }');
    const source = "adapters/codex/.codex/config.toml";
    const fileRef = state.endsWith("file");
    const command = fileRef
      ? 'bash ".codex/hooks/check.sh"'
      : `bun run ${state === "valid-command" ? "lint" : "missing"}`;
    const config = [
      'sandbox_mode = "workspace-write"',
      'approval_policy = "on-request"',
      "[[hooks.PreToolUse]]",
      'matcher = "^Bash$"',
      "[[hooks.PreToolUse.hooks]]",
      'type = "command"',
      `command = '${command}'`,
    ].join("\n");
    ship(entry, source, state === "malformed" ? 'sandbox_mode = "workspace-write\n' : config);
    if (state === "valid-file") ship(entry, "files/.codex/hooks/check.sh", "#!/bin/sh\nexit 0\n");
    const { report } = await validate(root);
    const referenceCheck = fileRef ? "ref-hook" : "ref-command";
    if (state.startsWith("valid"))
      findingsAre(report.findings, [...missingSearchNotes({ stacks: ["sample"] })]);
    else
      findingsAre(report.findings, [
        ...missingSearchNotes({ stacks: ["sample"] }),
        [
          state === "malformed" ? "ref-toml" : referenceCheck,
          "error",
          {
            file: `stacks/sample/${source}`,
          },
        ],
      ]);
  },
);

test("OpenCode permission rules check project commands but leave executable names and wildcards alone [3.4b#2]", async () => {
  const root = space.temp();
  const entry = stack(root, "sample", 'commands: { lint: "Lint" }');
  ship(
    entry,
    "adapters/opencode/opencode.json",
    JSON.stringify({
      permission: {
        bash: {
          "*": "ask",
          "git status*": "allow",
          "bun run lint": "allow",
          "bun run missing": "deny",
        },
      },
    }),
  );
  findingsAre((await validate(root)).report.findings, [
    ...missingSearchNotes({ stacks: ["sample"] }),
    [
      "ref-command",
      "error",
      {
        file: "stacks/sample/adapters/opencode/opencode.json",
        text: ["missing"],
      },
    ],
  ]);
});

test.each(formats)(
  "$agent resolves merged-owner files and commands and reports a repeated missing ref once [3.4b#6]",
  async (format) => {
    const root = space.temp();
    const meta = `merge: [${format.path}]\nfragments:\n  required: [tools]`;
    const entry = stack(root, "sample", meta);
    const owner = fragment(
      root,
      "tools",
      `merge: [${format.path}]\ncommands: { audit: "Audit" }\nverify:\n  - { name: audit, layer: check, run: "bun run audit" }`,
    );
    ship(owner, `files/${format.script}`, "#!/bin/sh\nexit 0\n");
    ship(
      entry,
      `adapters/${format.agent}/${format.path}`,
      JSON.stringify(format.config(`bash "${format.script}"`)),
    );
    ship(
      owner,
      `adapters/${format.agent}/${format.path}`,
      JSON.stringify(
        format.agent === "opencode"
          ? {
              formatter: {
                audit: { command: ["bun", "run", "audit", "$FILE"], extensions: [".ts"] },
              },
            }
          : format.config("bun run audit"),
      ),
    );
    findingsAre((await validate(root)).report.findings, [
      ...missingSearchNotes({ stacks: ["sample"], fragments: ["tools"] }),
    ]);
    const missing =
      format.agent === "opencode"
        ? { formatter: { audit: { command: ["bash", "hooks/missing.sh"], extensions: [".ts"] } } }
        : format.config('bash "hooks/missing.sh"');
    ship(owner, `adapters/${format.agent}/${format.path}`, JSON.stringify(missing));
    const { report } = await validate(root);
    findingsAre(report.findings, [
      ...missingSearchNotes({ stacks: ["sample"], fragments: ["tools"] }),

      [
        "ref-hook",
        "error",
        {
          entry: "tools",
          file: `fragments/tools/adapters/${format.agent}/${format.path}`,
          text: ["hooks/missing.sh"],
        },
      ],
    ]);
    expect(report.findings[1]?.line).toBeGreaterThan(0);
  },
);

test.each(formats)(
  "$agent config with the wrong hooks/formatter key case is a schema error [3.4b#7]",
  async (format) => {
    const root = space.temp();
    const entry = stack(root);
    const config = format.agent === "opencode" ? { Formatter: {} } : { Hooks: {} };
    ship(entry, `adapters/${format.agent}/${format.path}`, JSON.stringify(config));
    findingsAre((await validate(root)).report.findings, [
      ...missingSearchNotes({ stacks: ["sample"] }),
      [
        "ref-config",
        "error",
        {
          file: `stacks/sample/adapters/${format.agent}/${format.path}`,
        },
      ],
    ]);
  },
);

test("OpenCode JSONC accepts comments and trailing commas while still reporting bad references [3.4b#7]", async () => {
  const root = space.temp();
  const entry = stack(root);
  ship(
    entry,
    "adapters/opencode/opencode.jsonc",
    `{
  // OpenCode explicitly supports this format.
  "permission": { "bash": { "bun run missing": "allow", }, },
}`,
  );
  findingsAre((await validate(root)).report.findings, [
    ...missingSearchNotes({ stacks: ["sample"] }),
    [
      "ref-command",
      "error",
      {
        file: "stacks/sample/adapters/opencode/opencode.jsonc",
        text: ["missing"],
      },
    ],
  ]);
});

test.each(["missing-file", "valid-file", "missing-command", "valid-command"])(
  "OpenCode formatter argv supports %s including a path with spaces [3.4b#2] [3.4b#5]",
  async (state) => {
    const root = space.temp();
    const entry = stack(root, "sample", 'commands: { lint: "Lint" }');
    const fileRef = state.endsWith("file");
    const script = ".opencode/hooks/format file.sh";
    const command = fileRef
      ? ["bash", script, "$FILE"]
      : ["bun", "run", state === "valid-command" ? "lint" : "missing", "$FILE"];
    ship(
      entry,
      "adapters/opencode/opencode.json",
      JSON.stringify({ formatter: { custom: { command, extensions: [".ts"] } } }),
    );
    if (state === "valid-file") ship(entry, `files/${script}`, "#!/bin/sh\nexit 0\n");
    const { report } = await validate(root);
    if (state.startsWith("valid"))
      findingsAre(report.findings, [...missingSearchNotes({ stacks: ["sample"] })]);
    else
      findingsAre(report.findings, [
        ...missingSearchNotes({ stacks: ["sample"] }),
        [
          fileRef ? "ref-hook" : "ref-command",
          "error",
          {
            file: "stacks/sample/adapters/opencode/opencode.json",
            text: [fileRef ? script : "missing"],
          },
        ],
      ]);
  },
);
