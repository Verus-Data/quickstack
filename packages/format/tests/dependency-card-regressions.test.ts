import { Schema } from "effect";
import { expect, test } from "vitest";
import { DependencyCard } from "../src/index.js";

const source = { by: "author", reviewedAt: "2026-10-29" };

test("dependency card rejects an impossible review date [4.5f#10]", () => {
  expect(() =>
    Schema.decodeUnknownSync(DependencyCard)({
      whatItIs: "A small web framework.",
      source: { ...source, reviewedAt: "2026-99-99" },
    }),
  ).toThrow();
});

test("dependency card rejects an HTTPS URL without a host [4.5f#6]", () => {
  expect(() =>
    Schema.decodeUnknownSync(DependencyCard)({
      whatItIs: "A small web framework.",
      homepage: "https://",
      source,
    }),
  ).toThrow();
});
