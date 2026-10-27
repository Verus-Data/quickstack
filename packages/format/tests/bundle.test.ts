import { createHash } from "node:crypto";
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { expect, test } from "vitest";
import { BundlePath, bundleDigest, canonicalBundle, EntryBundle } from "../src/index";

const bundle = (files: unknown) =>
  Schema.decodeUnknownSync(EntryBundle)({ id: "demo", kind: "stack", files });
const textFile = (path: string, content: string) => ({
  path,
  executable: false,
  encoding: "utf8",
  content,
});
const text = (value: EntryBundle) => new TextDecoder().decode(canonicalBundle(value));
const decoded = (value: EntryBundle) =>
  Schema.decodeUnknownSync(EntryBundle)(JSON.parse(text(value)));
const digest = (value: EntryBundle) => Effect.runPromise(bundleDigest(value));

test("canonical bytes have fixed key order, no whitespace and a golden digest [4.0a#3]", async () => {
  const value = Schema.decodeUnknownSync(EntryBundle)({
    files: [
      { content: "AP+A", encoding: "base64", executable: false, path: "files/icon.bin" },
      { content: "hello\r\n", encoding: "utf8", executable: false, path: "STACK.md" },
    ],
    kind: "stack",
    id: "demo",
  });
  const canonical = canonicalBundle(value);
  expect(canonical).toBeInstanceOf(Uint8Array);
  const parsed: unknown = JSON.parse(text(value));
  if (!Schema.is(EntryBundle)(parsed)) throw new Error("Canonical bytes did not contain a bundle");
  expect(Object.keys(parsed)).toEqual(["id", "kind", "files"]);
  expect(parsed.files.map((file) => Object.keys(file))).toEqual([
    ["path", "executable", "encoding", "content"],
    ["path", "executable", "encoding", "content"],
  ]);
  expect(parsed.files.map((file) => file.path)).toEqual(["STACK.md", "files/icon.bin"]);
  expect(text(value)).toBe(JSON.stringify(parsed));
  expect(canonicalBundle(bundle([...value.files].reverse()))).toEqual(canonical);
  const reordered: EntryBundle = {
    files: value.files.map((file) => ({
      content: file.content,
      encoding: file.encoding,
      executable: file.executable,
      path: file.path,
    })),
    kind: value.kind,
    id: value.id,
  };
  expect(canonicalBundle(reordered)).toEqual(canonical);
  const actual = await digest(value);
  expect(actual).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(actual).toBe(`sha256:${createHash("sha256").update(canonical).digest("hex")}`);
  expect(actual).toBe("sha256:233f316e9380754bd8c625e0a9359b348116285fa397fc075f0af34be2cf7dec");
});

test("stack and fragment identities survive canonicalization and affect digests [4.0a#3]", async () => {
  const stack = bundle([textFile("files/shared.txt", "same bytes")]);
  const fragment = Schema.decodeUnknownSync(EntryBundle)({ ...stack, kind: "fragment" });
  const other = Schema.decodeUnknownSync(EntryBundle)({ ...fragment, id: "other-demo" });
  expect(decoded(stack)).toMatchObject({ id: "demo", kind: "stack" });
  expect(decoded(fragment)).toMatchObject({ id: "demo", kind: "fragment" });
  expect(decoded(other)).toMatchObject({ id: "other-demo", kind: "fragment" });
  expect(new Set(await Promise.all([stack, fragment, other].map(digest))).size).toBe(3);
  expect(() => Schema.decodeUnknownSync(EntryBundle)({ ...fragment, kind: "app" })).toThrow();
});

test("CRLF, LF and a missing trailing newline remain different raw bytes [4.0a#3]", async () => {
  const variants = ["one\r\ntwo\r\n", "one\ntwo\n", "one\ntwo"];
  const values = variants.map((content) => bundle([textFile("STACK.md", content)]));
  expect(values.map((value) => decoded(value).files[0]?.content)).toEqual(variants);
  expect(new Set(await Promise.all(values.map(digest))).size).toBe(3);
});

test("binary file content round trips through base64 [4.0a#3]", () => {
  const bytes = Uint8Array.from([0, 255, 128, 13, 10, 0]);
  const value = bundle([
    {
      path: "files/icon.bin",
      executable: false,
      encoding: "base64",
      content: Buffer.from(bytes).toString("base64"),
    },
  ]);
  const file = decoded(value).files[0];
  expect(file?.encoding).toBe("base64");
  expect(Buffer.from(file?.content ?? "", "base64")).toEqual(Buffer.from(bytes));
});

it.prop(
  "random file sets decode and canonicalize stably in either order [4.0a#3]",
  [Schema.Array(Schema.Struct({ bytes: Schema.Uint8Array, executable: Schema.Boolean }))],
  ([files]) => {
    const value = bundle(
      files.map((file, index) => ({
        path: `files/file-${index}`,
        executable: file.executable,
        encoding: "base64",
        content: Buffer.from(file.bytes).toString("base64"),
      })),
    );
    const canonical = canonicalBundle(value);
    // Compare hashes: a failed generated binary case should not print a huge buffer diff.
    const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    expect(hash(canonicalBundle(decoded(value)))).toBe(hash(canonical));
    expect(hash(canonicalBundle(bundle([...value.files].reverse())))).toBe(hash(canonical));
    expect(decoded(value).files.map((file) => file.path)).toEqual(
      value.files.map((file) => file.path).sort(),
    );
    for (const [index, file] of decoded(value).files.entries()) {
      const original = files[Number(file.path.slice("files/file-".length))];
      if (original === undefined) throw new Error(`Unexpected canonical file at ${index}`);
      expect(Buffer.from(file.content, file.encoding)).toEqual(Buffer.from(original.bytes));
      expect(file.executable).toBe(original.executable);
    }
    expect(decoded(value).files).toHaveLength(files.length);
  },
  { arbitrary: { seed: "4.0a", runs: 50, size: 20 } },
);

test.each(["../x", "/x", "a/../../x", "a\\b", "", "..", "a/..", "a/../x"])(
  "unsafe bundle path %j is rejected directly and inside a bundle [4.0a#4]",
  (path) => {
    expect(() => Schema.decodeUnknownSync(BundlePath)(path)).toThrow();
    expect(() => bundle([textFile(path, "x")])).toThrow();
  },
);

test("a literal dotfile path stays literal [4.0a#6]", () => {
  const value = bundle([textFile("files/.gitignore", "node_modules/\n")]);
  expect(decoded(value).files).toEqual(value.files);
  expect(decoded(value).files[0]?.path).toBe("files/.gitignore");
});

test("only the executable bit changes canonical bytes and digest [4.0a#7]", async () => {
  const file = textFile("files/check.sh", "#!/bin/sh\nexit 0\n");
  const plain = bundle([file]);
  const executable = bundle([{ ...file, executable: true }]);
  expect(decoded(executable).files[0]?.executable).toBe(true);
  expect(text(executable)).not.toBe(text(plain));
  expect(await digest(executable)).not.toBe(await digest(plain));
});

test("an empty file is present as empty UTF-8 and differs from no file [4.0a#8]", async () => {
  const file = textFile("files/.keep", "");
  const value = bundle([file]);
  expect(decoded(value).files).toEqual([file]);
  expect(await digest(value)).not.toBe(await digest(bundle([])));
});

test("non-ASCII paths use UTF-8 byte order rather than UTF-16 or locale order [4.0a#9]", () => {
  const paths = ["files/\u{10000}", "files/\uE000", "files/é", "files/z"];
  expect(
    decoded(bundle(paths.map((path) => textFile(path, path)))).files.map((file) => file.path),
  ).toEqual(["files/z", "files/é", "files/\uE000", "files/\u{10000}"]);
});

test("invalid UTF-8 stays base64 while exact UTF-8 bytes use utf8 [4.0a#10]", async () => {
  // Truncated, overlong and invalid-continuation sequences must not become replacement characters.
  for (const bytes of [[0xc3], [0xc0, 0xaf], [0xe2, 0x28, 0xa1]]) {
    const content = Buffer.from(bytes).toString("base64");
    const file = decoded(
      bundle([{ path: "files/raw", executable: false, encoding: "base64", content }]),
    ).files[0];
    expect(file?.encoding).toBe("base64");
    expect(file?.content).toBe(content);
  }
  const content = "héllo\r\n\uFEFF\u0000";
  const utf8 = bundle([textFile("files/text", content)]);
  const base64 = bundle([
    {
      path: "files/text",
      executable: false,
      encoding: "base64",
      content: Buffer.from(content).toString("base64"),
    },
  ]);
  expect(decoded(base64).files).toEqual(utf8.files);
  expect(await digest(base64)).toBe(await digest(utf8));
});

test.each(["\u0000x", "files/a\u0000b", "files/x\u0000"])(
  "NUL in path %j is rejected at the schema boundary [4.0a#11]",
  (path) => {
    expect(() => Schema.decodeUnknownSync(BundlePath)(path)).toThrow();
    expect(() => bundle([textFile(path, "")])).toThrow();
  },
);

test("spaces and leading dashes in relative paths stay unchanged [4.0a#12]", () => {
  const files = [textFile("-notes.md", "notes"), textFile("files/my config.json", "{}")];
  expect(decoded(bundle(files)).files).toEqual(files);
});
