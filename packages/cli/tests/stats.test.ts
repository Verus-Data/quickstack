import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "@effect/vitest";
import { StackStatsDetail, StatsDetail, StatsSummary } from "@steamfield/stacks-format";
import { Clock, Effect, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ListResult } from "../src/schemas/list";
import { ShowReport } from "../src/schemas/show";
import { tempDir } from "./helpers/cli";
import { minimal, writeEntry } from "./helpers/registry";
import {
  detail,
  fragmentDetail,
  type StatsServer,
  statsCli,
  statsRegistry,
  statsServer,
  summary,
} from "./helpers/stats";
import { stateEnv, writeRecordedProject } from "./helpers/verify";

let home: ReturnType<typeof tempDir>;
let registry: ReturnType<typeof tempDir>;
let server: StatsServer;
beforeEach(async () => {
  home = tempDir();
  registry = tempDir();
  statsRegistry(registry.path);
  server = await statsServer();
});
afterEach(async () => {
  await server?.close();
  home.cleanup();
  registry.cleanup();
});

const cli = (args: string[], extra: Partial<Parameters<typeof statsCli>[1]> = {}) =>
  statsCli(args, { home: home.path, registry: registry.path, server, ...extra });

function jsonResult(result: Awaited<ReturnType<typeof cli>>) {
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout) as unknown;
}
function listed(result: Awaited<ReturnType<typeof cli>>) {
  return Schema.decodeUnknownSync(ListResult)(jsonResult(result));
}
function row(result: ListResult, id: string) {
  const entry = result.entries.find((entry) => entry.id === id && entry.kind === "stack");
  expect(entry).toBeDefined();
  return entry;
}
function withoutStats(value: unknown) {
  if (typeof value !== "object" || value === null) throw new Error("expected JSON object");
  const copy = structuredClone(value);
  if (typeof copy !== "object" || copy === null) throw new Error("expected JSON object");
  if ("entries" in copy && Array.isArray(copy.entries)) {
    for (const entry of copy.entries)
      if (typeof entry === "object" && entry !== null) delete entry.stats;
  } else if ("stats" in copy) delete copy.stats;
  return copy;
}
function statsRequests() {
  return server.requests.filter(
    (path) => path.startsWith("/v1/stats") || /\/stats(?:\?|$)/.test(path),
  );
}

test("list reports every published summary cell, including upper bound and sample [4.2b#1]", async () => {
  const result = listed(await cli(["list", "--json"]));
  expect(Schema.decodeUnknownSync(ListResult)(result)).toEqual(result);
  expect(row(result, "go-cli")).toMatchObject({
    stats: {
      window: 28,
      through: summary.through,
      population: "stacks projects",
      projects: 215,
      greenRate: 0.91,
      greenRateLower: 0.86,
      greenRateUpper: 0.95,
      sample: 180,
      noVerifyShare: 0.12,
      medianMinutesToGreen: 14,
    },
  });
  expect(row(result, "astro-api")).toMatchObject({
    stats: {
      projects: 10,
      greenRate: null,
      greenRateLower: null,
      greenRateUpper: null,
      sample: null,
      noVerifyShare: null,
      medianMinutesToGreen: null,
    },
  });
  expect(statsRequests()).toEqual(["/v1/stats"]);
});

test("two summary pages produce the same list fields as one page [4.2b#1]", async () => {
  const one = listed(await cli(["list", "--json"]));
  server.pages(true);
  const otherHome = tempDir();
  try {
    const two = listed(await cli(["list", "--json"], { home: otherHome.path }));
    expect(two).toEqual(one);
    expect(server.requests).toContain("/v1/stats?cursor=second");
  } finally {
    otherHome.cleanup();
  }
});

test.each(["fail", "bad", "offline"] as const)(
  "%s summary keeps list output and bounded completion [4.2b#1]",
  async (failure) => {
    if (failure === "offline") {
      const online = listed(await cli(["list", "--json"]));
      expect(row(online, "go-cli")).toHaveProperty("stats");
    }
    const baseline = jsonResult(await cli(["list", "--json", "--offline"]));
    if (failure !== "offline") server.summaryMode(failure);
    const result = await cli(["list", "--json", ...(failure === "offline" ? ["--offline"] : [])]);
    expect(jsonResult(result)).toEqual(withoutStats(baseline));
    expect(statsRequests()).toHaveLength(1);
  },
);

test("a closed stats connection leaves list output unchanged [4.2b#1]", async () => {
  expect(row(listed(await cli(["list", "--json"])), "go-cli")).toHaveProperty("stats");
  const deadUrl = server.url;
  const old = server;
  server = await statsServer();
  await old.close();
  const otherHome = tempDir();
  try {
    const baseline = jsonResult(
      await cli(["list", "--json", "--offline"], { home: otherHome.path }),
    );
    const result = jsonResult(
      await cli(["list", "--json"], {
        home: otherHome.path,
        env: { STACKS_DEV_API_URL: deadUrl },
      }),
    );
    expect(result).toEqual(baseline);
  } finally {
    otherHome.cleanup();
  }
});

it.effect("two summary pages share one 1500 ms deadline [4.2b#1]", () =>
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const baseline = jsonResult(
      yield* Effect.promise(() => cli(["list", "--json", "--offline"], { clock })),
    );
    server.pages(true);
    server.summaryMode("holdBoth");
    const running = yield* Effect.promise(() => cli(["list", "--json"], { clock })).pipe(
      Effect.forkChild,
    );
    yield* Effect.promise(() => expect.poll(() => statsRequests().length).toBe(1));
    yield* TestClock.adjust("1000 millis");
    server.releaseFirst();
    yield* Effect.promise(() => expect.poll(() => statsRequests().length).toBe(2));
    yield* TestClock.adjust("500 millis");
    const result = yield* Fiber.join(running);
    expect(jsonResult(result)).toEqual(baseline);
    expect(statsRequests()).toEqual(["/v1/stats", "/v1/stats?cursor=second"]);
  }),
);

test("an unpublished summary adds no stats field [4.2b#2]", async () => {
  server.summaryMode("unpublished");
  const result = listed(await cli(["list", "--json"]));
  expect(row(result, "go-cli")).not.toHaveProperty("stats");
  expect(statsRequests()).toEqual(["/v1/stats"]);
});

it.effect("a failed summary backs off for ten minutes [4.2b#3]", () =>
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    server.summaryMode("fail");
    const first = yield* Effect.promise(() => cli(["list", "--json"], { clock }));
    expect(jsonResult(first)).not.toHaveProperty("stats");
    expect(statsRequests()).toHaveLength(1);
    server.summaryMode("ok");
    const second = yield* Effect.promise(() => cli(["list", "--json"], { clock }));
    expect(jsonResult(second)).toEqual(jsonResult(first));
    expect(statsRequests()).toHaveLength(1);
    yield* TestClock.adjust("10 minutes");
    const recovered = yield* Effect.promise(() => cli(["list", "--json"], { clock }));
    expect(row(listed(recovered), "go-cli")).toHaveProperty("stats");
    expect(statsRequests()).toHaveLength(2);
  }),
);

it.effect("a summary 404 backs off for a full day", () =>
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    server.summaryMode("notFound");
    jsonResult(yield* Effect.promise(() => cli(["list", "--json"], { clock })));
    expect(statsRequests()).toHaveLength(1);
    server.summaryMode("ok");
    yield* TestClock.adjust("86399999 millis");
    jsonResult(yield* Effect.promise(() => cli(["list", "--json"], { clock })));
    expect(statsRequests()).toHaveLength(1);
    yield* TestClock.adjust("1 millis");
    const recovered = listed(yield* Effect.promise(() => cli(["list", "--json"], { clock })));
    expect(row(recovered, "go-cli")).toHaveProperty("stats");
    expect(statsRequests()).toHaveLength(2);
  }),
);

test("a detail failure backs off only that entry [4.2b#3]", async () => {
  server.detailMode("fail");
  jsonResult(await cli(["show", "go-cli", "--json"]));
  expect(statsRequests()).toEqual(["/v1/stacks/go-cli/stats"]);
  server.detailMode("ok");
  jsonResult(await cli(["show", "go-cli", "--json"]));
  const other = jsonResult(await cli(["show", "astro-api", "--json"]));
  expect(other).toHaveProperty("stats");
  expect(statsRequests()).toEqual(["/v1/stacks/go-cli/stats", "/v1/stacks/astro-api/stats"]);
});

test("a release build ignores API host environment variables [4.2b#4]", async () => {
  const source = listed(await cli(["list", "--json"]));
  expect(row(source, "go-cli")).toHaveProperty("stats");
  const count = statsRequests().length;
  const release = listed(
    await cli(["list", "--json"], {
      releaseBuild: true,
      env: { STACKS_API_URL: server.url, STACKS_DEV_API_URL: server.url },
    }),
  );
  expect(row(release, "go-cli")).not.toHaveProperty("stats");
  expect(statsRequests()).toHaveLength(count);
});

test("a non-default index host disables stats requests [4.2b#5]", async () => {
  expect(row(listed(await cli(["list", "--json"])), "go-cli")).toHaveProperty("stats");
  const count = statsRequests().length;
  const result = listed(
    await cli(["list", "--json"], {
      env: { STACKS_INDEX_URL: "http://127.0.0.1:9/v1/index.json" },
    }),
  );
  expect(row(result, "go-cli")).not.toHaveProperty("stats");
  expect(statsRequests()).toHaveLength(count);
});

test("verify never fetches stats [4.2b#6]", async () => {
  writeRecordedProject(home.path, home.path, [{ name: "check", run: "true" }], {
    stack: { id: "go-cli", origin: "bundled", trusted: true },
  });
  const options = {
    env: { ...stateEnv(home.path), PATH: process.env.PATH },
  };
  const first = await cli(["verify", "--json"], options);
  expect(first.status).toBe(0);
  expect(first.stdout).not.toBe("");
  expect(first.stderr).toContain('"event":"step-started"');
  expect(statsRequests()).toHaveLength(0);
  expect(row(listed(await cli(["list", "--json"])), "go-cli")).toHaveProperty("stats");
  const count = statsRequests().length;
  const result = await cli(["verify", "--json"], options);
  expect(result.status).toBe(0);
  expect(result.stdout).not.toBe("");
  expect(statsRequests()).toHaveLength(count);
});

test("show exposes decoded detail, agent breakdown and change markers [4.2b#7]", async () => {
  const report = jsonResult(await cli(["show", "go-cli", "--json"]));
  const decoded = Schema.decodeUnknownSync(ShowReport)(report);
  expect(decoded).toHaveProperty("stats");
  if (typeof report !== "object" || report === null || !("stats" in report))
    throw new Error("show result needs stats");
  const stats = Schema.decodeUnknownSync(StatsDetail)(report.stats);
  expect(stats).toMatchObject({
    id: "go-cli",
    kind: "stack",
    byAgent: detail.byAgent,
    series: detail.series,
    pickRate: detail.pickRate,
  });
  expect(statsRequests()).toEqual(["/v1/stacks/go-cli/stats"]);
});

test("unavailable detail and a user copy omit show stats [4.2b#7]", async () => {
  const offline = jsonResult(await cli(["show", "go-cli", "--json", "--offline"]));
  server.detailMode("fail");
  expect(jsonResult(await cli(["show", "go-cli", "--json"]))).toEqual(withoutStats(offline));
  expect(statsRequests()).toEqual(["/v1/stacks/go-cli/stats"]);
  const userRoot = join(realpathSync(home.path), "config", "stacks");
  writeEntry({
    root: userRoot,
    kind: "stack",
    dir: "go-cli",
    frontmatter: minimal("stack", "go-cli"),
  });
  const user = jsonResult(await cli(["show", "go-cli", "--json"]));
  expect(user).not.toHaveProperty("stats");
  expect(statsRequests()).toHaveLength(1);
});

test("show fetches fragment details from the fragment route [4.2b#7]", async () => {
  writeEntry({
    root: registry.path,
    kind: "fragment",
    dir: "lint",
    frontmatter: minimal("fragment", "lint"),
  });
  const report = jsonResult(await cli(["show", "lint", "--kind", "fragment", "--json"]));
  if (typeof report !== "object" || report === null || !("stats" in report))
    throw new Error("fragment show needs stats");
  expect(Schema.decodeUnknownSync(StatsDetail)(report.stats)).toEqual(fragmentDetail);
  expect(statsRequests()).toEqual(["/v1/fragments/lint/stats"]);
});

test("human show names the top three failing steps and recent content change [4.2b#8]", async () => {
  server.detail({
    ...detail,
    stepFailureShares: {
      test: { value: 0.65, suppressed: false },
      build: { value: 0.3, suppressed: false },
      typecheck: { value: 0.2, suppressed: false },
      install: { value: 0.1, suppressed: false },
    },
  });
  const result = await cli(["show", "go-cli"], { human: true });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toMatch(/test[\s\S]*build[\s\S]*typecheck/);
  expect(result.stdout).not.toMatch(/install\s+10%/);
  expect(result.stdout).toContain("content changed 2026-10-20");
});

test.each(["seeded development data", "stacks projects"] as const)(
  "human and agent text label %s accurately [4.2b#9]",
  async (population) => {
    server.summary(Schema.decodeUnknownSync(StatsSummary)({ ...summary, population }));
    server.detail(Schema.decodeUnknownSync(StackStatsDetail)({ ...detail, population }));
    for (const human of [false, true]) {
      const list = await cli(["list"], { human });
      const show = await cli(["show", "go-cli"], { human });
      expect(list.status).toBe(0);
      expect(list.stderr).toBe("");
      expect(show.status).toBe(0);
      expect(show.stderr).toBe("");
      expect(list.stdout).toContain(
        population === "seeded development data"
          ? "green 91% (n=180, seeded)"
          : "green 91% (n=180)",
      );
      expect(show.stdout).toContain(
        population === "seeded development data" ? "n=180, seeded" : "n=180",
      );
      if (population === "stacks projects") {
        expect(list.stdout).not.toContain("seeded");
        expect(show.stdout).not.toContain("seeded");
      }
    }
  },
);

test("a repeated summary cursor fails the fetch without looping indefinitely", async () => {
  server.pages(true);
  server.summaryMode("repeat");
  const baseline = jsonResult(await cli(["list", "--json", "--offline"]));
  const result = await cli(["list", "--json"]);
  expect(jsonResult(result)).toEqual(withoutStats(baseline));
  expect(server.requests.filter((path) => path.startsWith("/v1/stats"))).toHaveLength(2);
}, 3000);

it.effect("fresh cached rows are reused and an undecodable body is refetched", () =>
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const first = listed(yield* Effect.promise(() => cli(["list", "--json"], { clock })));
    expect(row(first, "go-cli")).toHaveProperty("stats");
    listed(yield* Effect.promise(() => cli(["list", "--json"], { clock })));
    expect(statsRequests()).toHaveLength(1);
    const cache = join(realpathSync(home.path), "cache", "stacks", "stats", "summary.json");
    expect(readFileSync(cache, "utf8")).not.toBe("");
    writeFileSync(cache, '{"items":"old wire"}');
    const refreshed = listed(yield* Effect.promise(() => cli(["list", "--json"], { clock })));
    expect(row(refreshed, "go-cli")).toHaveProperty("stats");
    expect(statsRequests()).toHaveLength(2);
    yield* TestClock.adjust("24 hours");
    listed(yield* Effect.promise(() => cli(["list", "--json"], { clock })));
    expect(statsRequests()).toHaveLength(3);
  }),
);

test("an unwritable stats cache leaves list output available", async () => {
  const onlineHome = tempDir();
  let online: ListResult;
  try {
    online = listed(await cli(["list", "--json"], { home: onlineHome.path }));
    expect(row(online, "go-cli")).toHaveProperty("stats");
  } finally {
    onlineHome.cleanup();
  }
  const cache = join(realpathSync(home.path), "cache", "stacks");
  mkdirSync(cache, { recursive: true });
  writeFileSync(join(cache, "stats"), "not a directory");
  const result = listed(await cli(["list", "--json"]));
  expect(result).toEqual(online);
});

test("CLI summary decoding accepts both older rows and rows with trending", async () => {
  const withTrending = listed(await cli(["list", "--json"]));
  if (!summary.published) throw new Error("fixture must be published");
  const withoutTrending = Schema.decodeUnknownSync(StatsSummary)({
    ...summary,
    items: summary.items.map(({ trending: _trending, ...item }) => item),
  });
  server.summary(withoutTrending);
  const otherHome = tempDir();
  try {
    const older = listed(await cli(["list", "--json"], { home: otherHome.path }));
    expect(older).toEqual(withTrending);
    expect(row(older, "go-cli")).toHaveProperty("stats");
  } finally {
    otherHome.cleanup();
  }
});
