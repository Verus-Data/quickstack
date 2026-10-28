import { NodeRuntime, NodeStdio } from "@effect/platform-node";
import { Effect, Layer, Logger, References } from "effect";
import { McpProtocol, McpServer } from "effect/ai";
import { logLevel } from "./config";
import { handlerLayer } from "./handlers";
import {
  README_RESOURCE_BODY,
  README_RESOURCE_DESCRIPTION,
  README_RESOURCE_MIME_TYPE,
  README_RESOURCE_NAME,
  README_RESOURCE_URI,
} from "./resource";
import { toolkit } from "./toolkit";

const serverLayer = McpServer.layerStdio({
  name: "quickstacks-mcp",
  version: "0.0.0",
  protocols: [McpProtocol.v2026_07_28, McpProtocol.v2025_11_25],
});

const resourceLayer = McpServer.resource({
  uri: README_RESOURCE_URI,
  name: README_RESOURCE_NAME,
  description: README_RESOURCE_DESCRIPTION,
  mimeType: README_RESOURCE_MIME_TYPE,
  content: Effect.succeed(README_RESOURCE_BODY),
});

const registrationLayer = Layer.mergeAll(McpServer.toolkit(toolkit), resourceLayer);

const appLayer = registrationLayer.pipe(
  Layer.provide(handlerLayer),
  Layer.provide(serverLayer),
  Layer.provide(NodeStdio.layer),
);

const main = Layer.launch(appLayer).pipe(
  Effect.provideService(Logger.LogToStderr, true),
  Effect.provideService(References.MinimumLogLevel, logLevel),
);

NodeRuntime.runMain(main);
