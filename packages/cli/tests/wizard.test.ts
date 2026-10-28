import { expect, test } from "vitest";
import { hasStackArg, type StackInfo, shouldShowStacks, stackLines } from "../src/core/wizard";

const stacks: ReadonlyArray<StackInfo> = [
  { id: "typescript-mcp", name: "TypeScript MCP server with Effect" },
  { id: "typescript-cli", name: "TypeScript CLI with Effect" },
  { id: "react-router", name: "React Router SPA" },
  { id: "go-cli", name: "Go CLI" },
  { id: "astro-blog", name: "Astro Blog" },
  { id: "cloudflare-react-router", name: "Cloudflare React Router" },
  { id: "mobile-expo", name: "Mobile Expo" },
  { id: "python-react", name: "Python React" },
  { id: "tauri-react", name: "Tauri React" },
];

test("stackLines produces one line per stack, id first, no stack dropped", () => {
  const lines = stackLines(stacks);
  expect(lines).toHaveLength(stacks.length);
  const sorted = [...stacks].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const [i, line] of lines.entries()) {
    const stack = sorted[i];
    if (stack) expect(line.startsWith(stack.id)).toBe(true);
  }
  // Every stack id appears.
  for (const s of stacks) expect(lines.some((l) => l.startsWith(s.id))).toBe(true);
});

test("stackLines sorts by id", () => {
  const shuffled = [...stacks].reverse();
  const lines = stackLines(shuffled);
  const ids = lines.map((l) => l.split("  ")[0]);
  expect([...ids].sort()).toEqual(ids);
});

test("stackLines is empty for no stacks", () => {
  expect(stackLines([])).toEqual([]);
});

test("stackLines puts the display name after the id", () => {
  const lines = stackLines([{ id: "foo", name: "Foo Bar" }]);
  expect(lines[0]).toBe("foo  Foo Bar");
});

test("stackLines pads ids to a common width", () => {
  const lines = stackLines([
    { id: "a", name: "A" },
    { id: "long-id", name: "Long" },
  ]);
  expect(lines[0]).toBe("a        A");
  expect(lines[1]).toBe("long-id  Long");
});

test("stackLines escapes control characters in the name", () => {
  const lines = stackLines([{ id: "foo", name: "\u001b[31mRed\u001b[0m" }]);
  expect(lines[0]).toBe("foo  \\u001b[31mRed\\u001b[0m");
});

// --- shouldShowStacks predicate ---

const tty = [true, false] as const;

test("new --wizard: show regardless of tty", () => {
  for (const t of tty) expect(shouldShowStacks(["new", "--wizard"], t)).toBe(true);
});

test("new --wizard --json: never show", () => {
  for (const t of tty) expect(shouldShowStacks(["new", "--wizard", "--json"], t)).toBe(false);
});

test("new --wizard typescript-mcp: never show (stack already given)", () => {
  for (const t of tty)
    expect(shouldShowStacks(["new", "--wizard", "typescript-mcp"], t)).toBe(false);
});

test("list --wizard: never show (not new)", () => {
  for (const t of tty) expect(shouldShowStacks(["list", "--wizard"], t)).toBe(false);
});

test("verify --wizard: never show (not new)", () => {
  for (const t of tty) expect(shouldShowStacks(["verify", "--wizard"], t)).toBe(false);
});

test("plain new: show only on a tty", () => {
  expect(shouldShowStacks(["new"], true)).toBe(true);
  expect(shouldShowStacks(["new"], false)).toBe(false);
});

test("new with a stack: never show", () => {
  expect(shouldShowStacks(["new", "typescript-mcp"], true)).toBe(false);
  expect(shouldShowStacks(["new", "typescript-mcp"], false)).toBe(false);
});

test("--json new with no stack: never show", () => {
  expect(shouldShowStacks(["--json", "new"], true)).toBe(false);
});

test("--wizard before new: show", () => {
  expect(shouldShowStacks(["--wizard", "new"], true)).toBe(true);
  expect(shouldShowStacks(["--wizard", "new"], false)).toBe(true);
});

test("new --sandbox (no stack, no wizard): show only on a tty", () => {
  expect(shouldShowStacks(["new", "--sandbox"], true)).toBe(true);
  expect(shouldShowStacks(["new", "--sandbox"], false)).toBe(false);
});

test("new --with foo --wizard (no positional stack): show", () => {
  expect(shouldShowStacks(["new", "--with", "foo", "--wizard"], true)).toBe(true);
});

test("new --with=foo --wizard (inline value, no positional): show", () => {
  expect(shouldShowStacks(["new", "--with=foo", "--wizard"], true)).toBe(true);
});

test("new -- typescript-mcp (stack after --): never show", () => {
  expect(shouldShowStacks(["new", "--", "typescript-mcp"], true)).toBe(false);
});

// --- hasStackArg ---

test("hasStackArg: false for new with no positional", () => {
  expect(hasStackArg(["new"])).toBe(false);
  expect(hasStackArg(["new", "--wizard"])).toBe(false);
  expect(hasStackArg(["new", "--sandbox"])).toBe(false);
});

test("hasStackArg: true when a bare value follows new", () => {
  expect(hasStackArg(["new", "typescript-mcp"])).toBe(true);
  expect(hasStackArg(["new", "--wizard", "typescript-mcp"])).toBe(true);
});

test("hasStackArg: false when the value belongs to a value-flag", () => {
  expect(hasStackArg(["new", "--with", "foo", "--wizard"])).toBe(false);
  expect(hasStackArg(["new", "--with=foo", "--wizard"])).toBe(false);
});

test("hasStackArg: true when a positional appears after --", () => {
  expect(hasStackArg(["new", "--", "typescript-mcp"])).toBe(true);
});

test("hasStackArg: false when new is absent", () => {
  expect(hasStackArg(["list", "--wizard"])).toBe(false);
  expect(hasStackArg(["verify", "foo"])).toBe(false);
});
