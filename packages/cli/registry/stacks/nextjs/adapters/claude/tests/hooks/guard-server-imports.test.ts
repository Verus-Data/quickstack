import { describe, expect, it } from "vitest";
import { denyReason, edit, REPO, runHook, write } from "../helpers/hooks";

const REASON = "is a client component";
const CLIENT = '"use client";\n';
const SERVER_IMPORT = 'import { listItems } from "@/lib/server/items";\n';

const run = (relPath: string, content: string) =>
  runHook("PreToolUse", "guard-server-imports", write(`${REPO}/${relPath}`, content));

describe.concurrent("guard-server-imports denies", () => {
  it.each([
    ["an alias import", "src/components/item-list.tsx", CLIENT + SERVER_IMPORT],
    [
      "a relative import",
      "src/components/form.tsx",
      `'use client'\nimport { addItem } from "../lib/server/items";\n`,
    ],
    ["the server-only package", "src/components/x.tsx", `${CLIENT}import "server-only";\n`],
    [
      "a re-export",
      "src/app/items/client.tsx",
      `${CLIENT}export { listItems } from "@/lib/server";\n`,
    ],
    [
      "a dynamic import",
      "src/components/lazy.tsx",
      `${CLIENT}const m = await import("@/lib/server/items");\n`,
    ],
    [
      "a directive after a comment",
      "src/components/c.tsx",
      `// The add form.\n${CLIENT}${SERVER_IMPORT}`,
    ],
  ])("%s", async (_, relPath, content) => {
    expect(denyReason(await run(relPath, content))).toContain(REASON);
  });

  it("checks every edit in a MultiEdit", async () => {
    const payload = {
      tool_name: "Edit",
      tool_input: {
        file_path: `${REPO}/src/components/item-list.tsx`,
        edits: [{ new_string: CLIENT }, { new_string: SERVER_IMPORT }],
      },
    };
    expect(denyReason(await runHook("PreToolUse", "guard-server-imports", payload))).toContain(
      REASON,
    );
  });
});

describe.concurrent("guard-server-imports allows", () => {
  it.each([
    ["a server component page", "src/app/page.tsx", SERVER_IMPORT],
    ["a Server Action file", "src/app/actions.ts", `"use server";\n${SERVER_IMPORT}`],
    ["a route handler", "src/app/api/health/route.ts", SERVER_IMPORT],
    ["a server module", "src/lib/server/items.ts", 'import "server-only";\n'],
    [
      "a client component with shared imports",
      "src/components/form.tsx",
      `${CLIENT}import { itemSchema } from "@/lib/item-schema";\n`,
    ],
    [
      "a client component naming the path in a string",
      "src/components/note.tsx",
      `${CLIENT}const note = "see lib/server";\n`,
    ],
  ])("%s", async (_, relPath, content) => {
    const result = await run(relPath, content);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("an Edit to a file not on disk without the directive", async () => {
    const payload = edit(`${REPO}/src/components/missing.tsx`, SERVER_IMPORT);
    const result = await runHook("PreToolUse", "guard-server-imports", payload);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
