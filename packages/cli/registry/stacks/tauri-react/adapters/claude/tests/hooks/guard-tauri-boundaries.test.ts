import { describe, expect, it } from "vitest";
import { denyReason, edit, REPO, runHook, write } from "../helpers/hooks";

const run = (filePath: string, content: string) =>
  runHook("PreToolUse", "guard-tauri-boundaries", write(filePath, content));

const FRAMEWORK = "framework-free";
const ADAPTERS_ONLY = "only src/core/transport/** and src/core/app-transport.ts";
const VIA_TRANSPORT = "@core/transport";
const TYPES_ONLY = "not `commands` or `events`";

describe.concurrent("guard-tauri-boundaries denies", () => {
  it.each([
    ["src/core/live-state.ts", 'import { useState } from "react";', FRAMEWORK],
    ["src/core/format.ts", "import type { JSX } from 'react/jsx-runtime';", FRAMEWORK],
    ["src/core/query-keys.ts", 'import { useQuery } from "@tanstack/react-query";', FRAMEWORK],
    ["src/core/routes.ts", 'import { createMemoryRouter } from "react-router";', FRAMEWORK],
    ["src/core/icons.ts", 'import { Cpu } from "lucide-react";', FRAMEWORK],
    ["src/core/store.ts", 'import { create } from "zustand";', "zustand/vanilla"],
    ["src/core/store.ts", 'import { useShallow } from "zustand/react/shallow";', "zustand/vanilla"],
    ["src/core/store.ts", 'import { createWithEqualityFn } from "zustand/traditional";', "zustand"],
    ["src/core/format.ts", 'import { cn } from "~/lib/utils";', "must not import the app layer"],
    ["src/core/transport/native.ts", 'import { useEffect } from "react";', FRAMEWORK],
    ["src/core/live-state.ts", 'import { invoke } from "@tauri-apps/api/core";', ADAPTERS_ONLY],
    ["src/core/live-state.ts", 'import { commands } from "./generated/bindings";', ADAPTERS_ONLY],
    [
      "src/app/routes/main/route.tsx",
      'import { invoke } from "@tauri-apps/api/core";',
      VIA_TRANSPORT,
    ],
    [
      "src/app/hooks/use-ticks.ts",
      'const { Channel } = await import("@tauri-apps/api/core");',
      VIA_TRANSPORT,
    ],
    ["src/main.tsx", 'import { getCurrentWindow } from "@tauri-apps/api/window";', VIA_TRANSPORT],
    ["tests/test-utils.tsx", 'import { listen } from "@tauri-apps/api/event";', VIA_TRANSPORT],
    [
      "src/app/routes/main/route.tsx",
      'import { commands, type AppInfo } from "@core/generated/bindings";',
      TYPES_ONLY,
    ],
    [
      "src/app/hooks/use-ticks.ts",
      'import {\n  events,\n} from "../../core/generated/bindings";',
      TYPES_ONLY,
    ],
    ["src/app/hooks/use-ticks.ts", 'import * as b from "@core/generated/bindings";', TYPES_ONLY],
    ["src/app/lib/ipc.ts", 'export { commands } from "@core/generated/bindings";', TYPES_ONLY],
    ["src/app/lib/ipc.ts", 'import bindings from "@core/generated/bindings";', TYPES_ONLY],
    [
      "src/app/lib/transport.tsx",
      'import { createTauriTransport } from "@core/transport/native";',
      "native adapter",
    ],
  ])("%s: %s", async (relPath, content, reason) => {
    expect(denyReason(await run(`${REPO}/${relPath}`, content))).toContain(reason);
  });

  it("checks an Edit's new_string", async () => {
    const payload = edit(`${REPO}/src/core/format.ts`, 'import React from "react";');
    expect(denyReason(await runHook("PreToolUse", "guard-tauri-boundaries", payload))).toContain(
      FRAMEWORK,
    );
  });

  it("resolves a relative path against the project", async () => {
    expect(denyReason(await run("./src/core/format.ts", 'import React from "react";'))).toContain(
      FRAMEWORK,
    );
  });

  it("applies inside a worktree", async () => {
    const path = `${REPO}/.claude/worktrees/w/src/core/format.ts`;
    expect(denyReason(await run(path, 'import React from "react";'))).toContain(FRAMEWORK);
  });
});

describe.concurrent("guard-tauri-boundaries allows", () => {
  it.each([
    [
      "core using zustand/vanilla",
      "src/core/store.ts",
      'import { createStore } from "zustand/vanilla";',
    ],
    [
      "core importing generated types",
      "src/core/transport.ts",
      'import type { AppInfo } from "./generated/bindings";',
    ],
    [
      "the native adapter calling Tauri",
      "src/core/transport/native.ts",
      'import { Channel } from "@tauri-apps/api/core";',
    ],
    [
      "the native adapter using commands",
      "src/core/transport/native.ts",
      'import { commands } from "../generated/bindings";',
    ],
    [
      "app-transport detecting Tauri",
      "src/core/app-transport.ts",
      'import { isTauri } from "@tauri-apps/api/core";',
    ],
    [
      "app importing the transport",
      "src/app/hooks/use-ticks.ts",
      'import type { Transport } from "@core/transport";',
    ],
    [
      "app importing generated types",
      "src/app/routes/main/route.tsx",
      'import type { AppInfo } from "@core/generated/bindings";',
    ],
    [
      "app importing type-only names inline",
      "src/app/routes/main/route.tsx",
      'import { type AppInfo } from "@core/generated/bindings";',
    ],
    ["app importing React", "src/app/routes/main/route.tsx", 'import { useState } from "react";'],
    ["core mentioning react in a string", "src/core/format.ts", 'const note = "from react";'],
    [
      "core with a comment naming react",
      "src/core/format.ts",
      '// never import from "react" here\nexport const x = 1;',
    ],
    [
      "core with a block comment naming react",
      "src/core/format.ts",
      '/**\n * import { useState } from "react";\n */\nexport const x = 1;',
    ],
    [
      "the guards' own tests",
      "tests/hooks/guard-tauri-boundaries.test.ts",
      'const s = \'import { invoke } from "@tauri-apps/api/core";\';\nimport { commands } from "@core/generated/bindings";',
    ],
    ["a non-TypeScript file", "src/core/notes.md", 'import { useState } from "react";'],
    ["a Rust file", "src-tauri/src/lib.rs", 'use tauri::Manager; // from "react"'],
    ["a file outside the project", "/elsewhere/src/core/format.ts", 'import React from "react";'],
  ])("%s", async (_, relPath, content) => {
    const result = await run(relPath.startsWith("/") ? relPath : `${REPO}/${relPath}`, content);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});
