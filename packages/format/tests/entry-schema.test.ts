import { Schema } from "effect";
import { expect, test } from "vitest";
import {
  AgentId,
  DetectedAgent,
  FragmentMeta,
  StackMeta,
  VerifyStep,
  withStepDefaults,
} from "../src/index";

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
])("%s fails to decode [1.0#9] [4.0a#1]", (_case, step, message) => {
  expect(() => decodeStep(step)).toThrow(message);
});

test.each([
  ["an empty name", { name: "" }, /name/],
  ["a blank description", { description: "   " }, /description/],
  ["an empty id", { id: "" }, /id/],
])("a fragment with %s fails to decode [4.0a#1]", (_case, change, message) => {
  expect(() => decodeFragment({ ...fragment, ...change })).toThrow(message);
});

test("an app fragment with an empty applies_to fails to decode, naming applies_to [1.0#9] [4.0a#1]", () => {
  expect(() => decodeFragment({ ...fragment, category: "app" })).toThrow(/applies_to/);
  expect(() => decodeFragment({ ...fragment, category: "app", applies_to: [] })).toThrow(
    /applies_to/,
  );
  expect(decodeFragment({ ...fragment, category: "app", applies_to: ["web"] }).appliesTo).toEqual([
    "web",
  ]);
});

test("steps decode with expect, ms durations, long timeouts, and without layer or timeout [1.0#10] [4.0a#1]", () => {
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

test("snake_case keys decode to camelCase fields, and defaults fill the rest [1.0#10] [4.0a#1]", () => {
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

test("withStepDefaults fills phase, tags, timeout and an expect's within [1.0#10] [4.0a#1]", () => {
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

test("AgentId and DetectedAgent are the contract's sets [4.0a#1]", () => {
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
