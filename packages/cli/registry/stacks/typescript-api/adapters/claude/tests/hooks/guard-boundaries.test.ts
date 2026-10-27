import { describe, expect, it } from "vitest";
import { denyReason, edit, REPO, runHook, write } from "../helpers/hooks";

const check = (path: string, content: string) =>
  runHook("PreToolUse", "guard-boundaries", write(`${REPO}/${path}`, content));
const checkEdit = (path: string, content: string) =>
  runHook("PreToolUse", "guard-boundaries", edit(`${REPO}/${path}`, content));

describe("API platform boundaries", () => {
  it.each([
    ["src/handlers/orders.ts", 'import { readFile } from "node:fs/promises";'],
    ["src/app.ts", 'import { NodeHttpServer } from "@effect/platform-node";'],
    ["src/services/Store.ts", 'import { Database } from "bun:sqlite";'],
    ["src/services/Store.ts", "const p = Bun.file('x');"],
    ["src/app.ts", "process.exit(1);"],
    ["src/app.ts", "process.exitCode = 1;"],
    ["src/app.ts", "const { argv } = process;"],
    ["src/app.ts", "const p = globalThis.process.argv;"],
    ["src/services/Orders.ts", "process.env.SECRET;"],
    ["src/config.ts", "const e = process.env;"],
    ["src/services/Shell.ts", 'import { $ } from "bun";'],
    ["src/handlers/orders.ts", "console.log('x');"],
    ["src/schemas/order.ts", 'import { z } from "zod";'],
    ["src/schemas/order.ts", 'import { Schema } from "@effect/schema";'],
  ])("denies %s: %s", async (path, content) =>
    expect(denyReason(await check(path, content))).toBeDefined(),
  );
  it.each([
    ["src/platform/node.ts", 'import { NodeHttpServer } from "@effect/platform-node";'],
    ["src/platform/node.ts", 'import { createServer } from "node:http";'],
    ["src/platform/node.ts", "process.on('SIGTERM', () => {});"],
    ["src/platform/node.ts", "const provider = ConfigProvider.fromEnv({ env: process.env });"],
    ["src/config.ts", 'const port = Config.port("PORT_API");'],
    ["src/services/Orders.ts", 'const step = "process the order";'],
    ["src/handlers/orders.ts", "// console.log('example')"],
    ["src/handlers/orders.ts", '// import { readFile } from "node:fs";'],
    ["src/handlers/orders.ts", 'const hint = "use node:fs";'],
    ["src/schemas/order.ts", 'import { Schema } from "effect";'],
    ["tests/helpers/server.ts", 'import { createServer } from "node:http";'],
  ])("allows %s: %s", async (path, content) =>
    expect(denyReason(await check(path, content))).toBeUndefined(),
  );
  it("checks an Edit's new text too", async () => {
    expect(
      denyReason(await checkEdit("src/handlers/orders.ts", 'import { readFile } from "node:fs";')),
    ).toBeDefined();
    expect(
      denyReason(await checkEdit("src/handlers/orders.ts", 'import { Schema } from "effect";')),
    ).toBeUndefined();
  });
});
