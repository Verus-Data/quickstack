import { describe, expect, it } from "vitest";
import { denyReason, edit, REPO, runHook, write } from "../helpers/hooks";

const REASON = "is client-side code and imports server-only code";
const SERVER_IMPORT = 'import { loadConfig } from "~/.server/config";\n';

describe.concurrent("guard-server-imports denies", () => {
  it.each([
    ["app/components/chat/composer.tsx", SERVER_IMPORT],
    ["app/components/page-header.tsx", 'import { x } from "../.server/runtime";'],
    ["app/hooks/use-thing.ts", "export { y } from '../.server/models';"],
    ["app/lib/chat.ts", 'import { z } from "./export.server";'],
    ["app/schemas/chat.ts", 'const m = await import("../.server/errors");'],
  ])("%s importing server code", async (relPath, content) => {
    const result = await runHook(
      "PreToolUse",
      "guard-server-imports",
      write(`${REPO}/${relPath}`, content),
    );
    expect(denyReason(result)).toContain(REASON);
  });

  it("checks an Edit's new_string", async () => {
    const payload = edit(`${REPO}/app/components/chat/chat.tsx`, SERVER_IMPORT);
    expect(denyReason(await runHook("PreToolUse", "guard-server-imports", payload))).toContain(
      REASON,
    );
  });

  it("checks every edit in a MultiEdit", async () => {
    const payload = {
      tool_name: "Edit",
      tool_input: {
        file_path: `${REPO}/app/components/chat/chat.tsx`,
        edits: [{ new_string: "const a = 1;" }, { new_string: SERVER_IMPORT }],
      },
    };
    expect(denyReason(await runHook("PreToolUse", "guard-server-imports", payload))).toContain(
      REASON,
    );
  });
});

describe.concurrent("guard-server-imports allows", () => {
  it.each([
    ["a route module", "app/routes/chat.tsx", SERVER_IMPORT],
    ["root.tsx", "app/root.tsx", SERVER_IMPORT],
    ["a *.server module under components", "app/components/data.server.ts", SERVER_IMPORT],
    ["a file under .server/", "app/lib/.server/thing.ts", SERVER_IMPORT],
    [
      "a component with ordinary imports",
      "app/components/chat/chat.tsx",
      'import { cn } from "~/lib/utils";',
    ],
    [
      "a schema that only mentions .server in a string",
      "app/schemas/chat.ts",
      'const note = "see .server";',
    ],
  ])("%s", async (_, relPath, content) => {
    const result = await runHook(
      "PreToolUse",
      "guard-server-imports",
      write(`${REPO}/${relPath}`, content),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
