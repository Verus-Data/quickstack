import { describe, expect, it } from "vitest";
import { denyReason, edit, REPO, runHook, write } from "../helpers/hooks";

const REASON = "runs in the browser and imports server-only code";
const script = (body: string) => `<script lang="ts">\n${body}</script>\n`;
const SERVER_IMPORT = 'import { listItems } from "$lib/server/items";\n';

const run = (relPath: string, content: string) =>
  runHook("PreToolUse", "guard-server-imports", write(`${REPO}/${relPath}`, content));

describe.concurrent("guard-server-imports denies", () => {
  it.each([
    ["a component importing by alias", "src/lib/components/ItemList.svelte", script(SERVER_IMPORT)],
    [
      "a component importing by the subpath alias",
      "src/lib/components/ItemList.svelte",
      script("import { listItems } from '#lib/server/items';\n"),
    ],
    [
      "a route component importing by relative path",
      "src/routes/+page.svelte",
      script('import { addItem } from "../lib/server/items";\n'),
    ],
    [
      "a *.server module",
      "src/lib/components/Db.svelte",
      script('import { db } from "$lib/db.server";\n'),
    ],
    [
      "private environment variables",
      "src/routes/+layout.svelte",
      script('import { env } from "$env/dynamic/private";\n'),
    ],
    [
      "the newer private environment module",
      "src/routes/+layout.svelte",
      script("import { env } from '$app/env/private';\n"),
    ],
    ["a universal page load", "src/routes/items/+page.ts", SERVER_IMPORT],
    ["a universal layout load", "src/routes/+layout.js", SERVER_IMPORT],
    ["the client hooks file", "src/hooks.client.ts", SERVER_IMPORT],
    [
      "a dynamic import",
      "src/lib/components/Lazy.svelte",
      script('const m = await import("$lib/server/items");\n'),
    ],
    ["a re-export", "src/routes/items/+page.ts", 'export { listItems } from "$lib/server";\n'],
  ])("%s", async (_, relPath, content) => {
    expect(denyReason(await run(relPath, content))).toContain(REASON);
  });

  it("checks every edit in a MultiEdit", async () => {
    const payload = {
      tool_name: "Edit",
      tool_input: {
        file_path: `${REPO}/src/lib/components/ItemList.svelte`,
        edits: [{ new_string: '<script lang="ts">\n' }, { new_string: SERVER_IMPORT }],
      },
    };
    expect(denyReason(await runHook("PreToolUse", "guard-server-imports", payload))).toContain(
      REASON,
    );
  });
});

describe.concurrent("guard-server-imports allows", () => {
  it.each([
    ["a server page load", "src/routes/+page.server.ts", SERVER_IMPORT],
    ["a server layout load", "src/routes/+layout.server.ts", SERVER_IMPORT],
    ["an endpoint", "src/routes/api/health/+server.ts", SERVER_IMPORT],
    ["the server hooks file", "src/hooks.server.ts", SERVER_IMPORT],
    ["a server module", "src/lib/server/items.ts", 'import { env } from "$env/dynamic/private";\n'],
    [
      "a component with shared imports",
      "src/lib/components/AddItemForm.svelte",
      script('import { itemSchema } from "$lib/item-schema";\n'),
    ],
    [
      "a component importing the public environment module",
      "src/routes/+page.svelte",
      script('import { env } from "$env/dynamic/public";\n'),
    ],
    [
      "a component naming the path in a string",
      "src/routes/+page.svelte",
      script('const note = "see lib/server";\n'),
    ],
    ["a shared library module", "src/lib/item-schema.ts", 'import { z } from "zod";\n'],
  ])("%s", async (_, relPath, content) => {
    const result = await run(relPath, content);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("an Edit to a test file that imports a service", async () => {
    const payload = edit(`${REPO}/tests/items.test.ts`, SERVER_IMPORT);
    const result = await runHook("PreToolUse", "guard-server-imports", payload);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
