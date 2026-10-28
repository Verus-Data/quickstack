import { NodeRuntime, NodeServices, NodeStdio } from "@effect/platform-node";
import { Effect, Layer, Logger, References } from "effect";
import { McpProtocol, McpServer } from "effect/ai";
import { logLevel } from "./config";
import { handlerLayer } from "./handlers";
import { buildResourceLayers } from "./resource";
import { CliRunner } from "./run";
import { toolkit } from "./toolkit";

const serverLayer = McpServer.layerStdio({
  name: "stacks-mcp",
  version: "0.0.0",
  protocols: [McpProtocol.v2026_07_28, McpProtocol.v2025_11_25],
});

const resourceLayers = buildResourceLayers();

const registrationLayer = Layer.mergeAll(McpServer.toolkit(toolkit), ...resourceLayers);

const appLayer = registrationLayer.pipe(
  Layer.provide(handlerLayer),
  Layer.provide(serverLayer),
  Layer.provide(NodeStdio.layer),
  Layer.provide(CliRunner.Live),
  Layer.provide(NodeServices.layer),
);

const main = Layer.launch(appLayer).pipe(
  Effect.provideService(Logger.LogToStderr, true),
  Effect.provideService(References.MinimumLogLevel, logLevel),
);

NodeRuntime.runMain(main);
