import { it } from "@effect/vitest";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { countWords } from "../src/core/brief/words";

test("empty text and whitespace-only text have no words", () => {
  expect(countWords("")).toBe(0);
  expect(countWords(" \t\r\n\n\v\f\u00a0\u2003 ")).toBe(0);
});

test("punctuation and non-ASCII text stay in their non-whitespace runs", () => {
  expect(countWords("hello,world path/to/file foo-bar 日本語 café 🙂")).toBe(6);
});

test.each([
  ["<!-- quickstack:when stack=go-cli preset=default -->", "<!-- quickstack:end -->"],
  ["  \t<!-- quickstack:when stack=go-cli --> \t", "\t <!-- quickstack:end -->  "],
])("conditional marker lines %j and %j are excluded while their body counts", (start, end) => {
  expect(countWords(`${start}\r\ninside words\r\n${end}`)).toBe(2);
  expect(countWords(`${start}\n${end}`)).toBe(0);
});

test.each([
  ["before <!-- quickstack:when stack=go-cli -->", 5],
  ["<!-- quickstack:when stack=go-cli --> after", 5],
  ["before <!-- quickstack:end --> after", 5],
])("marker-looking text within a line still counts: %j", (text, expected) => {
  expect(countWords(text)).toBe(expected);
});

test("fill markers and other comments count as ordinary text", () => {
  expect(countWords("<!-- quickstack:fill: project name -->\n<!-- ordinary comment -->")).toBe(9);
});

test.each(["```", "~~~"])("%s fences and their code content count", (fence) => {
  expect(countWords(`${fence}ts\nconst answer = 42;\n${fence}`)).toBe(6);
});

test("conditional marker lines are excluded even inside a code fence", () => {
  expect(
    countWords(
      "```\n<!-- quickstack:when stack=go-cli -->\ncode here\n<!-- quickstack:end -->\n```",
    ),
  ).toBe(4);
});

it.prop(
  "joining words with non-empty whitespace runs and padding preserves their count",
  [
    Schema.Array(Schema.Int),
    Schema.NonEmptyArray(Schema.Literals([" ", "\t", "\r", "\n", "\v", "\f", "\u00a0", "\u2003"])),
  ],
  ([words, whitespace]) => {
    const separator = whitespace.join("");
    expect(countWords(`${separator}${words.join(separator)}${separator}`)).toBe(words.length);
  },
);
