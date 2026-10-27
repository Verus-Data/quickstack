import { expect, test } from "vitest";
import { commands } from "../../.claude/hooks/_shell";

test.each([
  ["plain", "plain", false, false],
  ["$TARGET", "$TARGET", false, true],
  [`\${TARGET}`, `\${TARGET}`, false, true],
  ["*", "*", false, true],
  ["file?", "file?", false, true],
  ["[ab]", "[ab]", false, true],
  ["{a,b}", "{a,b}", false, true],
  ["~/build", "~/build", false, true],
  [`'\${TARGET}*?{a,b}[ab]~'`, `\${TARGET}*?{a,b}[ab]~`, true, false],
  ['"*?{a,b}[ab]~"', "*?{a,b}[ab]~", true, false],
  ['"$TARGET"', "$TARGET", true, true],
  [`"\${TARGET}"`, `\${TARGET}`, true, true],
  ['"prefix"*', "prefix*", true, true],
  ['"prefix"/{a,b}', "prefix/{a,b}", true, true],
  ["\\*\\?\\[\\{\\$\\~", "*?[{$~", true, false],
  ['"\\$TARGET"', "$TARGET", true, false],
  ['"\\`literal\\`"', "`literal`", true, false],
  ["$(printf path)", "$(printf path)", false, true],
  ['"$(printf path)"', "$(printf path)", true, true],
  ["`printf path`", "`printf path`", false, true],
  ['"`printf path`"', "`printf path`", true, true],
  ["<(printf path)", "<(printf path)", false, true],
  [">(cat)", ">(cat)", false, true],
  ["$((1<<2))", "$((1<<2))", false, true],
  ['"$((1<<2))"', "$((1<<2))", true, true],
  ['""', "", true, false],
  ["$'push'", "push", true, false],
  [String.raw`$'\x72\155'`, "rm", true, false],
  [String.raw`pre$'\u0066\U00000069'x`, "prefix", true, false],
  [String.raw`$'\a\b\e\E\f\n\r\t\v\\\'\"\?'`, "\x07\b\x1b\x1b\f\n\r\t\v\\'\"?", true, false],
  ["$'$TARGET*'", "$TARGET*", true, false],
  [String.raw`$'\q'`, String.raw`\q`, true, false],
  [String.raw`$'\x'`, String.raw`\x`, true, true],
  [String.raw`$'\U00110000'`, String.raw`\U00110000`, true, true],
])("tracks expansion and quoting for %s", (source, word, quoted, expands) => {
  const command = commands(`echo ${source} tail`).find((cmd) => cmd.argv[0] === "echo");
  expect(command).toMatchObject({
    argv: ["echo", word, "tail"],
    quoted: [false, quoted, false],
    expands: [false, expands, false],
  });
});

test("an undecodable ANSI-C command word is opaque", () => {
  expect(commands(String.raw`$'\x' argument`)).toContainEqual(
    expect.objectContaining({ opaque: true }),
  );
});

test("expansion metadata resets between words, redirects and commands", () => {
  expect(
    commands("echo $TARGET > $OUTPUT literal; echo next").map(({ argv, expands, redirects }) => ({
      argv,
      expands,
      redirects,
    })),
  ).toEqual([
    { argv: ["echo", "$TARGET", "literal"], expands: [false, true, false], redirects: ["$OUTPUT"] },
    { argv: ["echo", "next"], expands: [false, false], redirects: [] },
  ]);
});

test.each([
  "TARGET=value sudo -u root echo $TARGET",
  "xargs echo $TARGET",
  "docker exec container echo $TARGET",
  "podman run image echo $TARGET",
  "docker-compose run service echo $TARGET",
  "kubectl exec pod -- echo $TARGET",
  "find . -exec sh -c 'echo $TARGET' \\;",
  "sh -c 'echo $TARGET'",
  "eval 'echo $TARGET'",
  "su -c 'echo $TARGET' user",
  "ssh host 'echo $TARGET'",
])("preserves expansion metadata when following %s", (source) => {
  const echoed = commands(source).filter((cmd) => cmd.argv[0] === "echo");
  expect(echoed.length).toBeGreaterThan(0);
  for (const cmd of echoed) {
    expect(cmd.argv).toEqual(["echo", "$TARGET"]);
    expect(cmd.expands).toEqual([false, true]);
  }
});

test("find -exec preserves literal expansion characters when re-lexing its arguments", () => {
  expect(
    commands("find . -exec echo '$TARGET' \\;").find((cmd) => cmd.argv[0] === "echo"),
  ).toMatchObject({ argv: ["echo", "$TARGET"], expands: [false, false] });
});

test.each(["EOF", "'EOF'", '"EOF"', "\\EOF", 'E"OF"', "$'EOF'", '$"EOF"'])(
  "only unquoted heredoc delimiters run substitutions: %s",
  (delimiter) => {
    const body = "$(echo $TARGET) `echo $OTHER` $((1<<2)) \\$(ignored)";
    const parsed = commands(`cat <<${delimiter}\n${body}\nEOF`);
    expect(parsed.find((cmd) => cmd.argv[0] === "cat")).toMatchObject({
      argv: ["cat"],
      expands: [false],
      stdin: [body],
    });
    expect(
      parsed.filter((cmd) => cmd.argv[0] !== "cat").map(({ argv, expands }) => ({ argv, expands })),
    ).toEqual(
      delimiter === "EOF"
        ? [
            { argv: ["echo", "$TARGET"], expands: [false, true] },
            { argv: ["echo", "$OTHER"], expands: [false, true] },
          ]
        : [],
    );
  },
);

test("a tab-stripped heredoc follows expansions but a quoted shell heredoc is re-lexed as code", () => {
  for (const source of [
    "cat <<-EOF\n\t$(echo $TARGET)\n\tEOF",
    "sh <<'EOF'\necho $TARGET\nEOF",
    "cat <<'EOF' | sh\necho $TARGET\nEOF",
  ]) {
    expect(
      commands(source).find((cmd) => cmd.argv[0] === "echo"),
      source,
    ).toMatchObject({
      argv: ["echo", "$TARGET"],
      expands: [false, true],
    });
  }
});

test.each([
  { source: "echo '$TARGET", argv: ["echo", "'$TARGET"], expands: [false, true] },
  { source: "echo $(( $TARGET", argv: ["echo", "$((", "$TARGET"], expands: [false, true, true] },
])(
  "unbalanced input retains conservative expansion metadata: $source",
  ({ source, argv, expands }) => {
    expect(commands(source)).toMatchObject([{ argv, expands }]);
  },
);

test("commands past the expansion budget have empty aligned metadata and are opaque", () => {
  const parsed = commands("echo x;".repeat(2001));
  expect(parsed).toHaveLength(2001);
  expect(parsed.at(-1)).toMatchObject({ argv: [], quoted: [], expands: [], opaque: true });
});
