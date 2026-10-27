import { expect, test } from "vitest";
import { invocationFor } from "../src/invocation";
import { VERSION } from "../src/version";

test.each([
  "/home/user/.npm/_npx/abc/node_modules/@steamfield/stacks/dist/stacks",
  "/tmp/cache/_npx/abc/node_modules/.bin/stacks",
])("npx commands remain runnable outside the cache: %s", (script) => {
  expect(invocationFor(script)).toBe(`npx -y @steamfield/stacks@${VERSION}`);
});

test.each([
  "/usr/local/lib/node_modules/@steamfield/stacks/dist/stacks",
  "/project/node_modules/@steamfield/stacks/dist/stacks",
  "/tmp/not_npx/stacks",
  "/tmp/_npx-suffix/stacks",
  "",
])("ordinary installs use the command name: %s", (script) => {
  expect(invocationFor(script)).toBe("stacks");
});
