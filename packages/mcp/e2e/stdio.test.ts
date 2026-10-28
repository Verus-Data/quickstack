import { resolve } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Stream } from "effect";
import { McpClient, McpProtocol } from "effect/ai";
import { ChildProcess } from "effect/process";
import {
  ChildProcessSpawner,
  makeHandle,
  make as makeSpawner,
} from "effect/process/ChildProcessSpawner";
import { describe, expect, it } from "vitest";

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

describe("stdio handshake", () => {
  it("lists tools, calls them, reads resources, and connects on both protocol revisions", async () => {
    const program = Effect.gen(function* () {
      const client = yield* McpClient.McpClient;

      const tools = yield* client.listTools();
      const toolNames = tools.map((t) => t.name).sort();

      expect(toolNames).toEqual(["quickstacks_list", "quickstacks_new", "quickstacks_verify"]);

      const listTool = findTool(tools, "quickstacks_list");
      const listResult = yield* client.callTool({ tool: listTool });
      expect(listResult.isError).toBeFalsy();
      const listText = (listResult.content[0] as { text: string }).text;
      const listParsed = JSON.parse(listText);
      expect(Array.isArray(listParsed.entries)).toBe(true);
      expect(listParsed.entries.length).toBeGreaterThanOrEqual(9);
      for (const entry of listParsed.entries) {
        expect(typeof entry.id).toBe("string");
        expect(typeof entry.kind).toBe("string");
      }

      const newTool = findTool(tools, "quickstacks_new");
      const newResult = yield* client.callTool({
        tool: newTool,
        arguments: { stack: "bogus-stack" },
      });
      expect(newResult.isError).toBe(true);
      const newText = (newResult.content[0] as { text: string }).text;
      expect(newText).toContain("NotFound");

      const resources = yield* client.listResources();
      const uris = resources.map((r) => r.uri);
      expect(uris).toContain("quickstacks://guide");
      const skillUris = uris.filter((u) => u.startsWith("skill://"));
      expect(skillUris.length).toBeGreaterThanOrEqual(2);

      const guideResult = yield* client.readResource({ uri: "quickstacks://guide" });
      expect(guideResult.contents).toHaveLength(1);
      const guideContent = guideResult.contents[0] as { text: string };
      expect(guideContent.text).toContain("verify");
    }).pipe(Effect.scoped, Effect.provide(makeClientLayer(McpProtocol.v2025_11_25)));

    await Effect.runPromise(program).catch((error) => {
      printStderr();
      throw error;
    });
  });

  it("connects on the newer protocol revision (2026-07-28)", async () => {
    const program = Effect.gen(function* () {
      const client = yield* McpClient.McpClient;
      const tools = yield* client.listTools();
      expect(tools).toHaveLength(3);
      expect(client.protocolVersion).toBe("2026-07-28");
    }).pipe(Effect.scoped, Effect.provide(makeClientLayer(McpProtocol.v2026_07_28)));

    await Effect.runPromise(program).catch((error) => {
      printStderr();
      throw error;
    });
  });
});
