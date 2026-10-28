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
import { README_RESOURCE_BODY, README_RESOURCE_URI } from "../src/resource";
import { ECHO_TOO_LONG_MESSAGE, MAX_ECHO_LENGTH } from "../src/toolkit";

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
  it("lists tools, calls them, reads the resource, and connects on both protocol revisions", async () => {
    const program = Effect.gen(function* () {
      const client = yield* McpClient.McpClient;

      const tools = yield* client.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(tools).toHaveLength(2);
      expect(toolNames).toContain("ping");
      expect(toolNames).toContain("echo");

      const pingTool = findTool(tools, "ping");
      const pingResult = yield* client.callTool({ tool: pingTool });
      expect(pingResult.isError).toBeFalsy();
      expect(pingResult.content).toHaveLength(1);
      expect(pingResult.content[0]?.type).toBe("text");

      const echoTool = findTool(tools, "echo");
      const echoResult = yield* client.callTool({
        tool: echoTool,
        arguments: { text: "hello" },
      });
      expect(echoResult.isError).toBeFalsy();
      const echoText = (echoResult.content[0] as { text: string }).text;
      const echoParsed = JSON.parse(echoText);
      expect(echoParsed).toEqual({ text: "hello", length: 5 });

      const longText = "a".repeat(MAX_ECHO_LENGTH + 1);
      const failResult = yield* client.callTool({
        tool: echoTool,
        arguments: { text: longText },
      });
      expect(failResult.isError).toBe(true);
      const failText = (failResult.content[0] as { text: string }).text;
      const failParsed = JSON.parse(failText);
      expect(failParsed).toEqual({
        _tag: "EchoTooLong",
        message: ECHO_TOO_LONG_MESSAGE,
      });

      const resources = yield* client.listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0]?.uri).toBe(README_RESOURCE_URI);

      const readResult = yield* client.readResource({ uri: README_RESOURCE_URI });
      expect(readResult.contents).toHaveLength(1);
      const content = readResult.contents[0] as { text: string };
      expect(content.text).toBe(README_RESOURCE_BODY);
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
      expect(tools).toHaveLength(2);
      expect(client.protocolVersion).toBe("2026-07-28");
    }).pipe(Effect.scoped, Effect.provide(makeClientLayer(McpProtocol.v2026_07_28)));

    await Effect.runPromise(program).catch((error) => {
      printStderr();
      throw error;
    });
  });
});
