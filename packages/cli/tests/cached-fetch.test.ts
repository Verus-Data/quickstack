import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Clock, Effect, Fiber, FileSystem, Layer, Option, Path, Schema } from "effect";
import { HttpClient } from "effect/http";
import { TestClock } from "effect/testing";
import { afterEach, beforeEach, expect } from "vitest";
import { makeCachedFetch } from "../src/core/cached-fetch";
import { NetLayer } from "../src/platform/net";
import { tempDir } from "./helpers/cli";

const Body = Schema.Struct({ value: Schema.Number });
let directory: ReturnType<typeof tempDir>;
let server: ReturnType<typeof createServer>;
let url: string;
let requests: string[];
let mode: "ok" | "error" | "missing" | "hold" | "hold-second" | "invalid";

beforeEach(async () => {
  directory = tempDir();
  requests = [];
  mode = "ok";
  server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (mode === "hold" || (mode === "hold-second" && request.url?.includes("page=2"))) return;
    if (mode === "error") return void response.writeHead(500).end();
    if (mode === "missing") return void response.writeHead(404).end();
    if (mode === "invalid") return void response.end('{"value":"wrong"}');
    response.end(request.url?.includes("page=2") ? '{"value":3}' : '{"value":2}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  url = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
  directory.cleanup();
});

const decode = (text: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(Body))(text).pipe(
    Effect.mapError(() => "invalid" as const),
  );

const resource = (name = "summary", offline = false, paged = false) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const client = yield* HttpClient.HttpClient;
    return yield* makeCachedFetch({
      cache: { fs, path, root: directory.path },
      client,
      url: `${url}/${name}`,
      bodyFile: `${name}.json`,
      stateFile: `${name}.state.json`,
      decode,
      offline: Effect.succeed(offline),
      ...(paged
        ? {
            load: (request) =>
              Effect.gen(function* () {
                const first = yield* request(`${url}/${name}`).pipe(Effect.flatMap(decode));
                const second = yield* request(`${url}/${name}?page=2`).pipe(Effect.flatMap(decode));
                const value = { value: first.value + second.value };
                return { value, cacheText: JSON.stringify(value) };
              }),
          }
        : {}),
    });
  }).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, NetLayer)));

const read = (name = "summary", offline = false) =>
  resource(name, offline).pipe(Effect.flatMap((cached) => cached.current()));
const state = (name = "summary") =>
  JSON.parse(readFileSync(join(directory.path, `${name}.state.json`), "utf8")) as unknown;

it.effect("a fresh cached body is returned without a request", () =>
  Effect.gen(function* () {
    mkdirSync(directory.path, { recursive: true });
    writeFileSync(join(directory.path, "summary.json"), '{"value":1}');
    writeFileSync(
      join(directory.path, "summary.state.json"),
      JSON.stringify({
        url: `${url}/summary`,
        cachedAt: new Date(yield* Clock.currentTimeMillis).toISOString(),
        lastAttempt: null,
        lastOutcome: "ok",
        backoffUntil: null,
      }),
    );
    expect(yield* read()).toEqual(Option.some({ value: 1 }));
    expect(requests).toEqual([]);
  }),
);

it.effect("a stale body refreshes once and replaces the cached file", () =>
  Effect.gen(function* () {
    expect(yield* read()).toEqual(Option.some({ value: 2 }));
    yield* TestClock.adjust("24 hours");
    expect(yield* read()).toEqual(Option.some({ value: 2 }));
    expect(requests).toHaveLength(2);
    expect(readFileSync(join(directory.path, "summary.json"), "utf8")).toBe('{"value":2}');
  }),
);

it.effect("500 and invalid bodies back off for ten minutes without losing stale data", () =>
  Effect.gen(function* () {
    yield* read();
    yield* TestClock.adjust("24 hours");
    mode = "error";
    expect(yield* read()).toEqual(Option.some({ value: 2 }));
    expect(state()).toMatchObject({ lastOutcome: "network" });
    yield* read();
    expect(requests).toHaveLength(2);
    yield* TestClock.adjust("10 minutes");
    mode = "invalid";
    expect(yield* read()).toEqual(Option.some({ value: 2 }));
    expect(state()).toMatchObject({ lastOutcome: "invalid" });
    yield* read();
    expect(requests).toHaveLength(3);
  }),
);

it.effect("404 backs off for 24 hours", () =>
  Effect.gen(function* () {
    mode = "missing";
    expect(Option.isNone(yield* read())).toBe(true);
    expect(state()).toMatchObject({ lastOutcome: "not_found" });
    yield* TestClock.adjust("86399999 millis");
    yield* read();
    expect(requests).toHaveLength(1);
    yield* TestClock.adjust("1 millis");
    mode = "ok";
    expect(Option.isSome(yield* read())).toBe(true);
    expect(requests).toHaveLength(2);
  }),
);

it.effect("a hanging response reaches the 1500 ms deadline", () =>
  Effect.gen(function* () {
    mode = "hold";
    const fiber = yield* read().pipe(Effect.forkChild);
    yield* Effect.promise(() => expect.poll(() => requests.length).toBe(1));
    yield* TestClock.adjust("1500 millis");
    expect(Option.isNone(yield* Fiber.join(fiber))).toBe(true);
    expect(state()).toMatchObject({ lastOutcome: "timeout" });
  }),
);

it.effect("a paged resource stores joined rows and times out when a later page hangs", () =>
  Effect.gen(function* () {
    const first = yield* resource("summary", false, true);
    expect(yield* first.current()).toEqual(Option.some({ value: 5 }));
    expect(readFileSync(join(directory.path, "summary.json"), "utf8")).toBe('{"value":5}');
    yield* TestClock.adjust("24 hours");
    mode = "hold-second";
    const stale = yield* resource("summary", false, true);
    const fiber = yield* stale.current().pipe(Effect.forkChild);
    yield* Effect.promise(() => expect.poll(() => requests.length).toBe(4));
    yield* TestClock.adjust("1500 millis");
    expect(yield* Fiber.join(fiber)).toEqual(Option.some({ value: 5 }));
    expect(state()).toMatchObject({ lastOutcome: "timeout" });
    expect(readFileSync(join(directory.path, "summary.json"), "utf8")).toBe('{"value":5}');
  }),
);

it.effect("offline makes no request and separate resources keep separate backoffs", () =>
  Effect.gen(function* () {
    expect(Option.isNone(yield* read("summary", true))).toBe(true);
    expect(requests).toEqual([]);
    mode = "error";
    yield* read("summary");
    mode = "ok";
    expect(yield* read("stack-entry")).toEqual(Option.some({ value: 2 }));
    expect(requests).toEqual(["/summary", "/stack-entry"]);
    expect(state("summary")).toMatchObject({ lastOutcome: "network" });
    expect(state("stack-entry")).toMatchObject({ lastOutcome: "ok" });
  }),
);
