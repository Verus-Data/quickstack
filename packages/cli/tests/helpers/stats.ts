import { readFileSync, realpathSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import {
  StatsDetail as Detail,
  StackStatsDetail as StackDetail,
  type StackStatsDetail,
  type StatsDetail,
  type StatsSummary,
  StatsSummary as Summary,
} from "@steamfield/stacks-format";
import { type Clock, Schema } from "effect";
import { quiet, runCli } from "./cli";
import { minimal, writeEntry } from "./registry";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../../../format/tests/fixtures/stats/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as unknown;

const originalSummary = Schema.decodeUnknownSync(Summary)(fixture("summary"));
const originalDetail = Schema.decodeUnknownSync(Detail)(fixture("stack-detail"));
export const fragmentDetail = Schema.decodeUnknownSync(Detail)(fixture("fragment-detail"));
if (!originalSummary.published || !originalDetail.published || originalDetail.kind !== "stack")
  throw new Error("stats fixtures must be published stack data");

export const summary: StatsSummary = Schema.decodeUnknownSync(Summary)({
  ...originalSummary,
  population: "stacks projects",
});
export const detail: StackStatsDetail = Schema.decodeUnknownSync(StackDetail)({
  ...originalDetail,
  population: "stacks projects",
});

export function statsRegistry(root: string) {
  for (const id of ["go-cli", "astro-api"])
    writeEntry({ root, kind: "stack", dir: id, frontmatter: minimal("stack", id) });
}

type Mode = "ok" | "bad" | "unpublished" | "repeat" | "fail" | "hold" | "holdBoth" | "notFound";
export async function statsServer() {
  const requests: string[] = [];
  let summaryMode: Mode = "ok";
  let detailMode: Mode = "ok";
  let pages = false;
  let currentSummary: StatsSummary = summary;
  let currentDetail: StatsDetail = detail;
  let releaseFirst: (() => void) | undefined;
  const summaryBody = (mode: Mode, cursor: boolean) => {
    if (mode === "unpublished")
      return Schema.decodeUnknownSync(Summary)({
        generatedAt: currentSummary.generatedAt,
        through: currentSummary.through,
        population: currentSummary.population,
        window: currentSummary.window,
        published: false,
        items: currentSummary.items.map(({ id, kind, lastRun }) => ({
          id,
          kind,
          ...(lastRun === undefined ? {} : { lastRun }),
        })),
      });
    if (!pages || !currentSummary.published) return currentSummary;
    return Schema.decodeUnknownSync(Summary)({
      ...currentSummary,
      items: cursor ? currentSummary.items.slice(1) : currentSummary.items.slice(0, 1),
      ...(!cursor || mode === "repeat" ? { nextCursor: "second" } : {}),
    });
  };
  const detailBody = (path: string) => {
    if (path === "/v1/fragments/lint/stats") return fragmentDetail;
    if (path === "/v1/stacks/astro-api/stats" && currentDetail.published)
      return Schema.decodeUnknownSync(Detail)({ ...currentDetail, id: "astro-api" });
    return currentDetail;
  };
  const responseBody = (url: URL, mode: Mode) => {
    if (url.pathname !== "/v1/stats")
      return JSON.stringify(Schema.encodeSync(Detail)(detailBody(url.pathname)));
    if (url.searchParams.has("cursor") && url.searchParams.get("cursor") !== "second")
      return "wrong cursor";
    return JSON.stringify(
      Schema.encodeSync(Summary)(summaryBody(mode, url.searchParams.has("cursor"))),
    );
  };
  const held = (mode: Mode, url: URL, response: ServerResponse) => {
    if (mode === "hold") return true;
    if (mode !== "holdBoth") return false;
    if (!url.searchParams.has("cursor"))
      releaseFirst = () => {
        response.setHeader("Content-Type", "application/json");
        response.end(responseBody(url, mode));
      };
    return true;
  };
  const server = createServer((request, response) => {
    const raw = request.url ?? "/";
    requests.push(raw);
    const url = new URL(raw, "http://fixture");
    const isSummary = url.pathname === "/v1/stats";
    const mode = isSummary ? summaryMode : detailMode;
    if (held(mode, url, response)) return;
    if (mode === "fail") {
      response.writeHead(503).end("unavailable");
      return;
    }
    if (mode === "notFound") {
      response.writeHead(404).end("missing");
      return;
    }
    response.setHeader("Content-Type", "application/json");
    if (mode === "bad") {
      response.end("not JSON");
      return;
    }
    const body = responseBody(url, mode);
    response.writeHead(body === "wrong cursor" ? 400 : 200).end(body);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing stats server port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    summaryMode(value: Mode) {
      summaryMode = value;
    },
    detailMode(value: Mode) {
      detailMode = value;
    },
    pages(value: boolean) {
      pages = value;
    },
    releaseFirst() {
      if (!releaseFirst) throw new Error("first summary page is not pending");
      releaseFirst();
      releaseFirst = undefined;
    },
    summary(value: StatsSummary) {
      currentSummary = value;
    },
    detail(value: StatsDetail) {
      currentDetail = value;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
export type StatsServer = Awaited<ReturnType<typeof statsServer>>;

export function statsCli(
  args: string[],
  options: {
    home: string;
    registry: string;
    server: StatsServer;
    env?: Record<string, string | undefined>;
    releaseBuild?: boolean;
    clock?: Clock.Clock;
    human?: boolean;
  },
) {
  const home = realpathSync(options.home);
  return runCli(args, {
    home,
    host: {
      cwd: home,
      registry: realpathSync(options.registry),
      ...(options.human ? { stdoutIsTTY: true } : {}),
    },
    env: {
      ...quiet,
      XDG_CACHE_HOME: join(home, "cache"),
      STACKS_DEV_API_URL: options.server.url,
      ...options.env,
    },
    releaseBuild: options.releaseBuild,
    clock: options.clock,
  });
}
