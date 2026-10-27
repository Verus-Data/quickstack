import { Schema } from "effect";
import { expect, test } from "vitest";
import { canonicalBundle, EntryBundle } from "../src/index";

const decode = (files: unknown) =>
  Schema.decodeUnknownSync(EntryBundle)({ id: "demo", kind: "stack", files });

test("conflicting duplicate paths fail decoding in either order", () => {
  const files = ["first", "second"].map((content) => ({
    path: "files/a",
    executable: false,
    encoding: "utf8",
    content,
  }));
  expect(() => decode(files)).toThrow(/unique/);
  expect(() => decode([...files].reverse())).toThrow(/unique/);
});

test.each(["not base64!", "A", "AAA==="])(
  "malformed base64 %j fails at bundle decoding",
  (content) => {
    expect(() =>
      decode([{ path: "files/a", executable: false, encoding: "base64", content }]),
    ).toThrow(/base64/);
  },
);

test("UTF-8 content is not constrained by base64 validation", () => {
  const files = [{ path: "files/a", executable: false, encoding: "utf8", content: "not base64!" }];
  const bundle = decode(files);
  expect(JSON.parse(new TextDecoder().decode(canonicalBundle(bundle))).files).toEqual(files);
});
