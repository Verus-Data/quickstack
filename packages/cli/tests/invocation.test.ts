import { expect, test } from "vitest";
import { invocationFor } from "../src/invocation";
import { VERSION } from "../src/version";

test.each([
  "/home/user/.npm/_npx/abc/node_modules/@quickstack/cli/dist/quickstack.mjs",
  "/tmp/cache/_npx/abc/node_modules/.bin/quickstack",
])("npx commands remain runnable outside the cache: %s", (script) => {
  expect(invocationFor(script)).toBe(`npx -y @quickstack/cli@${VERSION}`);
});

test.each([
  "/usr/local/lib/node_modules/@quickstack/cli/dist/quickstack.mjs",
  "/project/node_modules/@quickstack/cli/dist/quickstack.mjs",
  "/tmp/not_npx/quickstack.mjs",
  "/tmp/_npx-suffix/quickstack.mjs",
  "",
])("ordinary installs use the command name: %s", (script) => {
  expect(invocationFor(script)).toBe("quickstack");
});
