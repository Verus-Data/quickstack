import { it } from "@effect/vitest";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { deepMerge } from "../src/core/compose/merge";

test("objects keep disjoint keys and recursively merge overlapping keys", () => {
  expect(
    deepMerge(
      { earlier: true, settings: { keep: 1, nested: { old: true, mode: "old" } } },
      { later: true, settings: { add: 2, nested: { new: true, mode: "new" } } },
    ),
  ).toEqual({
    earlier: true,
    later: true,
    settings: { keep: 1, add: 2, nested: { old: true, new: true, mode: "new" } },
  });
});

// One row per boundary of "both objects" and "both arrays": arrays and null are typeof "object".
test.each([
  ["a number replaces a number", 1, 2],
  ["false replaces true", true, false],
  ["an array replaces an object", { keep: true }, [1]],
  ["an object replaces an array", [1], { keep: true }],
  ["a scalar replaces an array", [1], "later"],
  ["null replaces an object", { keep: true }, null],
  ["an object replaces null", null, { keep: true }],
])("the later value wins when %s", (_rule, earlier, later) => {
  expect(deepMerge(earlier, later)).toEqual(later);
});

test("arrays remove duplicates within and across inputs in first-seen order", () => {
  expect(deepMerge([3, 1, 3, "1", null], [1, 2, null, false, 2])).toEqual([
    3,
    1,
    "1",
    null,
    2,
    false,
  ]);
});

test("array objects deduplicate by value regardless of key order at any depth", () => {
  const first = { name: "guard", options: { allow: true, paths: ["src", "tests"] } };
  const reordered = { options: { paths: ["src", "tests"], allow: true }, name: "guard" };
  const different = { name: "guard", options: { allow: false, paths: ["src", "tests"] } };
  expect(deepMerge([first, reordered], [reordered, different, first])).toEqual([first, different]);
});

test("nested arrays deduplicate by value while different element orders stay distinct", () => {
  expect(
    deepMerge(
      [
        [1, 2],
        [1, 2],
      ],
      [
        [2, 1],
        [1, 2],
      ],
    ),
  ).toEqual([
    [1, 2],
    [2, 1],
  ]);
});

test("arrays under overlapping object keys concatenate and deduplicate recursively", () => {
  expect(
    deepMerge(
      { settings: { allow: ["read", "write"] } },
      { settings: { allow: ["write", "run"] } },
    ),
  ).toEqual({ settings: { allow: ["read", "write", "run"] } });
});

test("merged objects have no prototype, including recursively merged objects", () => {
  const merged = deepMerge({ nested: { earlier: true } }, { nested: { later: true } });
  expect(Object.getPrototypeOf(merged)).toBeNull();
  expect(
    Object.getPrototypeOf(Object.getOwnPropertyDescriptor(merged, "nested")?.value),
  ).toBeNull();
});

test("__proto__ stays an own data key and merges without polluting Object.prototype", () => {
  const before = Object.getOwnPropertyDescriptors(Object.prototype);
  const merged = deepMerge(
    { ["__proto__"]: { earlier: true } },
    { ["__proto__"]: { polluted: true } },
  );
  expect(Object.getOwnPropertyDescriptor(merged, "__proto__")).toEqual({
    value: { earlier: true, polluted: true },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  expect(Object.getPrototypeOf(merged)).toBeNull();
  expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(before);
});

test("merging nested objects and arrays leaves both inputs unchanged", () => {
  const earlier = { settings: { mode: "old", allow: [{ run: "lint" }, { run: "lint" }] } };
  const later = { settings: { mode: "new", allow: [{ run: "lint" }, { run: "test" }] } };
  const earlierBefore = structuredClone(earlier);
  const laterBefore = structuredClone(later);
  expect(deepMerge(earlier, later)).toEqual({
    settings: { mode: "new", allow: [{ run: "lint" }, { run: "test" }] },
  });
  expect(earlier).toEqual(earlierBefore);
  expect(later).toEqual(laterBefore);
});

const scalars = Schema.Array(
  Schema.Union([Schema.String, Schema.Int, Schema.Boolean, Schema.Null]),
);
it.prop(
  "merging scalar arrays keeps every distinct value once in first-seen order",
  [scalars, scalars],
  ([earlier, later]) => {
    // Not a Set: it stores -0 as +0, and the merge keeps the value it saw first.
    const all = [...earlier, ...later];
    expect(deepMerge(earlier, later)).toEqual(all.filter((item, at) => all.indexOf(item) === at));
  },
);
