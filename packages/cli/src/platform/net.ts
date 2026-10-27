// The network layers `verify`'s probes use: an HttpClient over the runtime's `fetch` (Bun's in the
// binary, Node's under Vitest) that never follows a redirect, so a local probe can't be sent to
// another host, and TCP sockets over `node:net` (Bun implements it too) for port checks.
import { makeNet } from "@effect/platform-bun/BunSocket";
import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { Tcp } from "../services/net";

export const NetLayer = Layer.mergeAll(
  FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { redirect: "manual" })),
  ),
  Tcp.layer((host, port) => makeNet({ host, port })),
);
