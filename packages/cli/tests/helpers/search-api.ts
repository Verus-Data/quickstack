import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { SearchResponse } from "@stacks/format";
import { Clock, Effect, Schema } from "effect";
import { Command } from "effect/cli";
import { expect } from "vitest";
import { cli } from "../../src/cli";
import { SearchHit, SearchResult } from "../../src/schemas/search";
import { VERSION } from "../../src/version";
import { quiet, runCli } from "./cli";
import { bundled } from "./search-metadata";

export function officialHit(id: string, overrides: Partial<SearchHit> = {}): SearchHit {
  return Schema.decodeUnknownSync(SearchHit)({
    kind: "stack",
    id,
    name: `API ${id}`,
    summary: `Fresh server card for ${id}.`,
    origin: "index",
    trusted: true,
    tier: "strong",
    score: 0.84,
    coverage: 1,
    why: [{ field: "platforms", matched: "cli", from: "cli" }],
    penalties: [],
    evidence: {},
    ...overrides,
  });
}

export function response(
  stacks: ReadonlyArray<SearchHit> = [officialHit("go-cli")],
  fragments: ReadonlyArray<SearchHit> = [],
) {
  return {
    method: "lexical",
    indexGeneratedAt: "2026-10-28T10:00:00Z",
    understood: {
      platforms: ["cli"],
      productKinds: [],
      languages: ["go"],
      capabilities: [],
      unmatched: [],
    },
    noStrongMatch: false,
    stacks,
    fragments,
  };
}

/** Check successful fixtures against the shared route contract, without recreating its schema. */
export async function validResponse(value: ReturnType<typeof response>) {
  expect(Schema.decodeUnknownSync(SearchResponse)(value)).toEqual(value);
}

/** A held response has no timer; the client's TestClock owns the deadline. */
export async function searchServer() {
  const requests: { method: string | undefined; url: URL; raw: string }[] = [];
  let body: unknown = response();
  let mode: "ok" | "hold" | "partial" | "500" | "invalid" | "disconnect" = "ok";
  const server = createServer((request, reply) => {
    const raw = request.url ?? "/";
    requests.push({ method: request.method, url: new URL(raw, "http://fixture"), raw });
    if (mode === "hold") return;
    if (mode === "disconnect") {
      request.socket.destroy();
      return;
    }
    if (mode === "500") {
      reply.writeHead(500).end("unavailable");
      return;
    }
    reply.setHeader("Content-Type", "application/json");
    if (mode === "partial") {
      reply.write('{"method":');
      return;
    }
    reply.end(JSON.stringify(mode === "invalid" ? { method: "lexical", stacks: "bad" } : body));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing search fixture port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    answer(value: ReturnType<typeof response>) {
      body = value;
      mode = "ok";
    },
    mode(value: typeof mode) {
      mode = value;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
export type SearchServer = Awaited<ReturnType<typeof searchServer>>;

export function apiOptions(home: string, url: string): NonNullable<Parameters<typeof runCli>[1]> {
  const root = realpathSync(home);
  return {
    home: root,
    host: { cwd: root, registry: bundled },
    env: {
      ...quiet,
      STACKS_DEV_API_URL: url,
      XDG_CACHE_HOME: join(root, "cache"),
      XDG_STATE_HOME: join(root, "state"),
      XDG_DATA_HOME: join(root, "data"),
    },
  };
}

export function decoded(result: Awaited<ReturnType<typeof runCli>>) {
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  return Schema.decodeUnknownSync(SearchResult)(JSON.parse(result.stdout));
}

/** runCli owns a separate runtime; carry the test's clock into the real parsed command. */
export function clockedCli(
  args: string[],
  options: Parameters<typeof runCli>[1],
  clock: Clock.Clock,
) {
  return runCli(args, {
    ...options,
    program: Command.runWith(cli, { version: VERSION, renderErrors: false })(args).pipe(
      Effect.provideService(Clock.Clock, clock),
    ),
  });
}

/** A new source CLI process proves that backoff survives the originating JS runtime. */
export function childSearch(args: string[], options: ReturnType<typeof apiOptions>) {
  const home = options.home;
  if (!home) throw new Error("The search child needs an isolated home");
  return new Promise<Awaited<ReturnType<typeof runCli>>>((resolve, reject) => {
    execFile(
      "bun",
      [
        "--no-env-file",
        "--config=/dev/null",
        join(import.meta.dirname, "../../src/bin.ts"),
        ...args,
      ],
      {
        cwd: home,
        env: {
          HOME: home,
          XDG_CONFIG_HOME: join(home, "config"),
          NO_COLOR: "1",
          PATH: process.env.PATH,
          ...options.env,
        },
        timeout: 10_000,
      },
      (error, stdout, stderr) => {
        if (error === null) resolve({ status: 0, stdout, stderr });
        else if (typeof error.code === "number") resolve({ status: error.code, stdout, stderr });
        else reject(error);
      },
    );
  });
}
