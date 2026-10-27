import { it } from "@effect/vitest";
import { FragmentMeta, StackMeta } from "@stacks/format";
import { Effect, Schema } from "effect";
import { expect, test } from "vitest";
import { parse, stringify } from "yaml";
import { decodeEntry, splitFrontmatter } from "../src/core/registry/entry";

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
