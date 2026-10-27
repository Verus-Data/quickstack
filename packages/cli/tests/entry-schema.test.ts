import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { expect, test } from "vitest";
import { parse, stringify } from "yaml";
import { decodeEntry, splitFrontmatter } from "../src/core/registry/entry";
import {
  AgentId,
  DetectedAgent,
  FragmentMeta,
  StackMeta,
  VerifyStep,
  withStepDefaults,
} from "../src/schemas";

// biome-ignore lint/suspicious/noTemplateCurlyInString: a verify-env placeholder, expanded by 1.3a
const probe = "http://localhost:${PORT_WEB}/";
const decodeStep = (step: unknown) =>
  Schema.decodeUnknownSync(VerifyStep, { onExcessProperty: "error" })(step);
const decodeFragment = (meta: unknown) =>
  Schema.decodeUnknownSync(FragmentMeta, { onExcessProperty: "error" })(meta);
const fragment = {
  schema_version: 1,
  id: "f",
  kind: "fragment",
  name: "F",
  description: "A fragment.",
  category: "tooling",
};

test.each([
  ["a serve step without expect", { name: "web", run: "bun run dev", phase: "serve" }, /expect/],
  ["a step without run", { name: "lint" }, /run/],
  ["a step tagged app", { name: "t", run: "x", tags: ["prod", "app"] }, /reserved/],
  [
    "within without a unit",
    { name: "w", run: "x", phase: "serve", expect: { http: "http://localhost/", within: "90" } },
    /within/,
  ],
  ["a timeout in hours", { name: "t", run: "x", timeout: "1h" }, /timeout/],
  ["the dropped key check", { name: "c", run: "x", check: { filled: "README.md" } }, /check/],
  ["the dropped key probe", { name: "p", run: "x", probe: "http://localhost/" }, /probe/],
  ["a step name that isn't kebab-case", { name: "Lint Step", run: "x" }, /name/],
  ["an empty run", { name: "lint", run: "" }, /run/],
  ["a blank run", { name: "lint", run: "  \t" }, /run/],
])("%s fails to decode [1.0#9]", (_case, step, message) => {
  expect(() => decodeStep(step)).toThrow(message);
});

test.each([
  ["an empty name", { name: "" }, /name/],
  ["a blank description", { description: "   " }, /description/],
  ["an empty id", { id: "" }, /id/],
])("a fragment with %s fails to decode", (_case, change, message) => {
  expect(() => decodeFragment({ ...fragment, ...change })).toThrow(message);
});

test("an unknown YAML tag is a decode problem, and nothing is printed", async () => {
  const writes: unknown[] = [];
  const original = process.stderr.write;
  const warn = console.warn;
  const emitWarning = process.emitWarning;
  process.stderr.write = ((chunk: unknown) => {
    writes.push(chunk);
    return true;
  }) as typeof process.stderr.write;
  console.warn = (...args: unknown[]) => writes.push(args);
  // Where the YAML library sends its own warnings, which Node prints to stderr.
  process.emitWarning = ((warning: unknown) => writes.push(warning)) as typeof process.emitWarning;
  try {
    const decoded = await Effect.runPromise(
      decodeEntry("stack", "---\nschema_version: 1\nid: !custom s\n---\n"),
    );
    expect(decoded).toEqual({
      _tag: "Invalid",
      error: expect.stringMatching(
        /^frontmatter: not valid YAML \(Unresolved tag: !custom[^\n]*\)$/,
      ),
    });
  } finally {
    process.stderr.write = original;
    console.warn = warn;
    process.emitWarning = emitWarning;
  }
  expect(writes).toEqual([]);
});

test("an app fragment with an empty applies_to fails to decode, naming applies_to [1.0#9]", () => {
  expect(() => decodeFragment({ ...fragment, category: "app" })).toThrow(/applies_to/);
  expect(() => decodeFragment({ ...fragment, category: "app", applies_to: [] })).toThrow(
    /applies_to/,
  );
  expect(decodeFragment({ ...fragment, category: "app", applies_to: ["web"] }).appliesTo).toEqual([
    "web",
  ]);
});

test("steps decode with expect, ms durations, long timeouts, and without layer or timeout [1.0#10]", () => {
  expect(
    decodeStep({
      name: "web",
      run: "bun run dev",
      phase: "serve",
      expect: { http: probe, within: "500ms" },
      timeout: "15m",
    }),
  ).toEqual({
    name: "web",
    run: "bun run dev",
    phase: "serve",
    expect: { http: probe, within: "500ms" },
    timeout: "15m",
  });
  expect(decodeStep({ name: "lint", run: "bun run lint" })).toEqual({
    name: "lint",
    run: "bun run lint",
  });
  // expect on a step that isn't serve decodes; 1.5 warns about it.
  expect(decodeStep({ name: "t", run: "x", expect: { http: "http://x/" } }).expect).toBeDefined();
});

test("snake_case keys decode to camelCase fields, and defaults fill the rest [1.0#10]", () => {
  const meta = decodeFragment({
    ...fragment,
    applies_to: ["web"],
    needs_own_repo: true,
    requires_tools: ["docker"],
  });
  expect(meta).toEqual({
    schemaVersion: 1,
    id: "f",
    kind: "fragment",
    name: "F",
    description: "A fragment.",
    category: "tooling",
    tags: [],
    deps: {},
    commands: {},
    tools: [],
    decisions: [],
    env: {},
    verify: [],
    merge: [],
    appliesTo: ["web"],
    needsOwnRepo: true,
    requires: [],
    conflicts: [],
    requiresTools: ["docker"],
  });
  const stack = Schema.decodeUnknownSync(StackMeta, { onExcessProperty: "error" })({
    schema_version: 1,
    id: "s",
    kind: "stack",
    name: "S",
    description: "A stack.",
    fragments: { required: ["a"] },
  });
  expect(stack.fragments).toEqual({ required: ["a"], default: [], optional: [] });
});

test("withStepDefaults fills phase, tags, timeout and an expect's within [1.0#10]", () => {
  expect(withStepDefaults({ name: "lint", run: "x" })).toEqual({
    name: "lint",
    run: "x",
    phase: "check",
    tags: [],
    timeout: "10m",
  });
  expect(
    withStepDefaults({ name: "web", run: "x", phase: "serve", expect: { http: "http://x/" } }),
  ).toEqual({
    name: "web",
    run: "x",
    phase: "serve",
    tags: [],
    timeout: "10m",
    expect: { http: "http://x/", within: "60s" },
  });
});

test("AgentId and DetectedAgent are the contract's sets", () => {
  expect(AgentId.literals).toEqual(["claude", "codex", "opencode", "cursor"]);
  expect(DetectedAgent.literals).toEqual([
    "claude",
    "codex",
    "opencode",
    "cursor",
    "other",
    "none",
  ]);
});

test("splitFrontmatter needs a first line of exactly --- and a closing ---", () => {
  expect(splitFrontmatter("---\na: 1\n---\n\n# Body\n")).toEqual({
    frontmatter: "a: 1",
    body: "# Body\n",
  });
  expect(splitFrontmatter("a: 1\n---\n")).toBeUndefined();
  expect(splitFrontmatter(" ---\na: 1\n---\n")).toBeUndefined();
  expect(splitFrontmatter("---\na: 1\n")).toBeUndefined();
});

test("invalid YAML is a decode problem, not a crash", async () => {
  const decoded = await Effect.runPromise(decodeEntry("stack", "---\na: [1\n---\n"));
  expect(decoded._tag).toBe("Invalid");
  expect(decoded._tag === "Invalid" && decoded.error).toMatch(/^frontmatter: not valid YAML/);
});

/** stringify, split, parse, decode and encode: a frontmatter object comes back unchanged. */
const roundTrip = <S extends typeof StackMeta | typeof FragmentMeta>(
  schema: S,
  value: S["Type"],
) => {
  const encoded = Schema.encodeSync(schema)(value as never);
  const text = `---\n${stringify(encoded)}---\nBody\n`;
  const parts = splitFrontmatter(text);
  const decoded = Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(
    parse(parts?.frontmatter ?? ""),
  );
  expect(parts?.body).toBe("Body\n");
  expect(Schema.encodeSync(schema)(decoded as never)).toEqual(encoded);
  expect(Object.keys(encoded as object)).toContain("schema_version");
};
it.prop("stack frontmatter round trips through YAML [1.0#14]", [StackMeta], ([meta]) =>
  roundTrip(StackMeta, meta),
);
it.prop("fragment frontmatter round trips through YAML [1.0#14]", [FragmentMeta], ([meta]) =>
  roundTrip(FragmentMeta, meta),
);
