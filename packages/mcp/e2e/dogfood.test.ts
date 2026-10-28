import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Stream } from "effect";
import { McpClient, McpProtocol } from "effect/ai";
import { ChildProcess } from "effect/process";
import {
  ChildProcessSpawner,
  makeHandle,
  make as makeSpawner,
} from "effect/process/ChildProcessSpawner";
import { afterAll, describe, expect, it } from "vitest";

const serverPath = resolve(import.meta.dirname, "../dist/server.js");

const serverStderr: Uint8Array[] = [];

function makeClientLayer(protocol: McpProtocol.ProtocolAdapter<McpClient.ProtocolVersion>) {
  const command = ChildProcess.make("node", [serverPath]);
  const clientLayer = McpClient.layerStdio({
    name: "e2e-client",
    version: "0.0.0",
    command,
    protocol,
  });
  const capturingSpawner = Layer.effect(
    ChildProcessSpawner,
    Effect.gen(function* () {
      const inner = yield* ChildProcessSpawner;
      return makeSpawner((cmd: ChildProcess.Command) =>
        inner.spawn(cmd).pipe(
          Effect.map((handle) =>
            makeHandle({
              ...handle,
              stderr: handle.stderr.pipe(
                Stream.tap((chunk) => Effect.sync(() => serverStderr.push(chunk))),
              ),
            }),
          ),
        ),
      );
    }),
  );
  return clientLayer.pipe(Layer.provide(capturingSpawner), Layer.provide(NodeServices.layer));
}

function printStderr() {
  if (serverStderr.length > 0) {
    const text = serverStderr.map((chunk) => new TextDecoder().decode(chunk)).join("");
    console.error(`--- server stderr ---\n${text}--- end server stderr ---`);
  }
}

function findTool<T extends { name: string }>(tools: ReadonlyArray<T>, name: string): T {
  const tool = tools.find((t) => t.name === name);
  if (tool === undefined) throw new Error(`tool "${name}" not found`);
  return tool;
}

const projectRoot = await mkdtemp(join(tmpdir(), "qs-dogfood-"));
const appDir = join(projectRoot, "app");

afterAll(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("dogfood loop", () => {
  it("lists stacks, scaffolds typescript-mcp, and verifies the scaffolded project", async () => {
    const program = Effect.gen(function* () {
      const client = yield* McpClient.McpClient;

      const tools = yield* client.listTools();

      const listTool = findTool(tools, "quickstacks_list");
      const listResult = yield* client.callTool({
        tool: listTool,
        arguments: { kind: "stack" },
      });
      expect(listResult.isError).toBeFalsy();
      const listText = (listResult.content[0] as { text: string }).text;
      const listParsed = JSON.parse(listText);
      expect(Array.isArray(listParsed.entries)).toBe(true);
      expect(listParsed.entries.length).toBeGreaterThan(0);
      for (const entry of listParsed.entries) {
        expect(entry.kind).toBe("stack");
      }

      const newTool = findTool(tools, "quickstacks_new");
      const newResult = yield* client.callTool({
        tool: newTool,
        arguments: { stack: "typescript-mcp", dir: appDir, sandbox: true },
      });
      expect(newResult.isError).toBeFalsy();
      const newText = (newResult.content[0] as { text: string }).text;
      const newParsed = JSON.parse(newText);
      expect(newParsed.project).toBe(appDir);
      expect(newParsed.briefWords).toBeGreaterThan(3000);
      expect(existsSync(join(appDir, ".quickstacks", "BRIEF.md"))).toBe(true);
      expect(existsSync(join(appDir, ".quickstacks", "manifest.json"))).toBe(true);

      const verifyTool = findTool(tools, "quickstacks_verify");
      const verifyResult = yield* client.callTool({
        tool: verifyTool,
        arguments: { dir: appDir },
      });
      expect(verifyResult.isError).toBeFalsy();
      const verifyText = (verifyResult.content[0] as { text: string }).text;
      const verifyParsed = JSON.parse(verifyText);
      expect(["green", "partial", "failed", "changed", "interrupted"]).toContain(
        verifyParsed.outcome,
      );
      expect(Array.isArray(verifyParsed.steps)).toBe(true);
      expect(verifyParsed.steps.length).toBeGreaterThanOrEqual(5);
      for (const step of verifyParsed.steps) {
        expect(typeof step.name).toBe("string");
        expect(step.name.length).toBeGreaterThan(0);
        expect(typeof step.status).toBe("string");
        expect(step.status.length).toBeGreaterThan(0);
      }
    }).pipe(Effect.scoped, Effect.provide(makeClientLayer(McpProtocol.v2026_07_28)));

    await Effect.runPromise(program).catch((error) => {
      printStderr();
      throw error;
    });
  }, 180_000);
});
