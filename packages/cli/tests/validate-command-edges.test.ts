import { afterEach, test } from "vitest";
import { findingsAre, fragment, rotWorkspace, ship, stack, validateRot } from "./helpers/rot";
import { missingSearchNotes } from "./helpers/search-fixture";

const space = rotWorkspace();
afterEach(() => space.cleanup());
const validate = (root: string) => validateRot(root, { home: space.temp() });

test.each(["bun run \\\n  missing", "bun r\\\nun miss\\\ning", 'bun run "miss\\\ning"'])(
  "continued permission commands check the actual target: %j",
  async (command) => {
    const root = space.temp();
    const entry = stack(root);
    ship(
      entry,
      "files/.claude/settings.json",
      JSON.stringify({ permissions: { allow: [`Bash(${command})`] } }),
    );
    findingsAre((await validate(root)).report.findings, [
      ...missingSearchNotes({ stacks: ["sample"] }),
      ["ref-command", "error", { entry: "sample", text: ["runs missing,"] }],
    ]);
  },
);

test.each([";", "&&", "||", "|", "' ';' '", "' > '"])(
  "a quoted %s example does not satisfy a fragment's verify coverage",
  async (separator) => {
    const root = space.temp();
    stack(root, "sample", "fragments:\n  required: [audit]");
    fragment(
      root,
      "audit",
      `commands: { audit: "Audit the project" }\nverify:\n  - name: example\n    layer: check\n    run: ${JSON.stringify(`printf '%s' 'example ${separator} bun run audit'`)}`,
    );
    findingsAre((await validate(root)).report.findings, [
      ...missingSearchNotes({ stacks: ["sample"], fragments: ["audit"] }),
      ["ref-command-coverage", "warning", { entry: "audit", text: ["command audit"] }],
    ]);
  },
);

test("comments mentioning a command do not satisfy verify coverage", async () => {
  const root = space.temp();
  stack(root, "sample", "fragments:\n  required: [audit]");
  fragment(
    root,
    "audit",
    `commands: { audit: "Audit the project" }\nverify:\n  - name: example\n    layer: check\n    run: ${JSON.stringify("true # example; bun run audit")}`,
  );
  findingsAre((await validate(root)).report.findings, [
    ...missingSearchNotes({ stacks: ["sample"], fragments: ["audit"] }),
    ["ref-command-coverage", "warning", { entry: "audit", text: ["command audit"] }],
  ]);
});

test.each(["&&", ";", "\n", "# comment\n"])(
  "real %j chains satisfy coverage",
  async (separator) => {
    const root = space.temp();
    stack(root, "sample", "fragments:\n  required: [audit]");
    fragment(
      root,
      "audit",
      `commands: { audit: "Audit the project" }\nverify:\n  - name: audit\n    layer: check\n    run: ${JSON.stringify(`printf '%s' 'example; ignored' ${separator} bun run audit`)}`,
    );
    findingsAre((await validate(root)).report.findings, [
      ...missingSearchNotes({ stacks: ["sample"], fragments: ["audit"] }),
    ]);
  },
);

test("single quotes preserve a literal backslash and newline in a permission operand", async () => {
  const root = space.temp();
  const target = "miss\\\ning";
  const entry = stack(root, "sample", `commands: { ${JSON.stringify(target)}: "Literal name" }`);
  ship(
    entry,
    "files/.claude/settings.json",
    JSON.stringify({ permissions: { allow: [`Bash(bun run '${target}')`] } }),
  );
  findingsAre((await validate(root)).report.findings, [
    ...missingSearchNotes({ stacks: ["sample"] }),
  ]);
});

test.each(
  [
    "cat <<EOF\nbun run audit\nEOF",
    "cat <<'EOF'\nbun run audit\nEOF",
    'cat <<"EOF"\nbun run audit\nEOF',
    "cat <<-EOF\n\tbun run audit\n\tEOF",
    "cat <<FIRST <<'SECOND'\nbun run audit\nFIRST\nbun run audit\nSECOND",
  ].flatMap((heredoc) => [
    { heredoc, after: false },
    { heredoc, after: true },
  ]),
)(
  "heredoc data does not cover audit; a real command after it does (after=$after): $heredoc",
  async ({ heredoc, after }) => {
    const root = space.temp();
    stack(root, "sample", "fragments:\n  required: [audit]");
    fragment(
      root,
      "audit",
      `commands: { audit: "Audit the project" }\nverify:\n  - name: example\n    layer: check\n    run: ${JSON.stringify(`${heredoc}\n${after ? "bun run audit" : "true"}`)}`,
    );
    const expected: Parameters<typeof findingsAre>[1] = after
      ? []
      : [["ref-command-coverage", "warning", { entry: "audit", text: ["command audit"] }]];
    findingsAre((await validate(root)).report.findings, [
      ...missingSearchNotes({ stacks: ["sample"], fragments: ["audit"] }),
      ...expected,
    ]);
  },
);

test.each(["printf '%s' '<<EOF'", "cat <<< 'example'"])(
  "literal redirect text and here strings do not hide later commands: %s",
  async (prefix) => {
    const root = space.temp();
    stack(root, "sample", "fragments:\n  required: [audit]");
    fragment(
      root,
      "audit",
      `commands: { audit: "Audit the project" }\nverify:\n  - name: audit\n    layer: check\n    run: ${JSON.stringify(`${prefix}\nbun run audit`)}`,
    );
    findingsAre((await validate(root)).report.findings, [
      ...missingSearchNotes({ stacks: ["sample"], fragments: ["audit"] }),
    ]);
  },
);

test.each([
  { command: "cat <<EOF\nEO\\\nF\nbun run audit", covered: true },
  { command: "cat <<EOF\nexample\\\nEOF\nbun run audit\nEOF", covered: false },
  { command: "cat <<'EOF'\nEO\\\nF\nbun run audit\nEOF", covered: false },
  { command: 'cat <<"EOF"\nEO\\\nF\nbun run audit\nEOF', covered: false },
  { command: "cat <<\\EOF\nEO\\\nF\nbun run audit\nEOF", covered: false },
  { command: 'cat <<E"OF"\nEO\\\nF\nbun run audit\nEOF', covered: false },
  { command: "cat <<EOF\nexample\\\\\nEOF\nbun run audit", covered: true },
  { command: "cat <<EOF\nexample\\\\\\\nEOF\nbun run audit\nEOF", covered: false },
  { command: "cat <<-EOF\n\tEO\\\nF\nbun run audit", covered: true },
  { command: "cat <<-EOF\n\tEO\\\n\tF\nbun run audit\nEOF", covered: false },
])(
  "heredoc continuation folding follows delimiter quoting (covered=$covered): $command",
  async ({ command, covered }) => {
    const root = space.temp();
    stack(root, "sample", "fragments:\n  required: [audit]");
    fragment(
      root,
      "audit",
      `commands: { audit: "Audit the project" }\nverify:\n  - name: example\n    layer: check\n    run: ${JSON.stringify(command)}`,
    );
    const expected: Parameters<typeof findingsAre>[1] = covered
      ? []
      : [["ref-command-coverage", "warning", { entry: "audit", text: ["command audit"] }]];
    findingsAre((await validate(root)).report.findings, [
      ...missingSearchNotes({ stacks: ["sample"], fragments: ["audit"] }),
      ...expected,
    ]);
  },
);
