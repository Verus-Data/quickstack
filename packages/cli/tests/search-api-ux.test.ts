import { readFileSync } from "node:fs";
import { join } from "node:path";
import { StatsSummary } from "@steamfield/stacks-format";
import { Schema } from "effect";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ErrorEnvelope } from "../src/errors";
import { runCli, terminal } from "./helpers/cli";
import { emptyRegistry } from "./helpers/registry";
import {
  apiOptions,
  decoded,
  officialHit,
  response,
  type SearchServer,
  searchServer,
} from "./helpers/search-api";
import { put } from "./helpers/search-metadata";
import { workspace } from "./helpers/verify";

const space = workspace();
let server: SearchServer;
beforeEach(async () => {
  server = await searchServer();
});
afterEach(async () => {
  await server?.close();
  space.release();
});

function cachedEvidence(home: string) {
  const wire = readFileSync(
    join(import.meta.dirname, "../../format/tests/fixtures/stats/summary.json"),
    "utf8",
  );
  put(join(home, "cache/stacks/stats/summary.json"), wire);
  const summary = Schema.decodeUnknownSync(Schema.fromJsonString(StatsSummary))(wire);
  if (!summary.published) throw new Error("Expected published stats fixture");
  return summary;
}

test("API hits retain missing local evidence and use it to break ties", async () => {
  const home = space.dir();
  cachedEvidence(home);
  const opts = apiOptions(home, server.url);
  const local = decoded(await runCli(["search", "go cli", "--local", "--json"], opts));
  const go = local.stacks.find(({ id }) => id === "go-cli");
  expect(go?.evidence).toMatchObject({
    stats: { greenRateLower: 0.86 },
    lastRun: { result: "pass" },
  });
  const body = response([officialHit("api-first"), officialHit("go-cli")]);
  server.answer(body);
  const merged = decoded(await runCli(["search", "go cli", "--json"], opts));
  expect(merged.stacks[0]).toEqual({ ...body.stacks[1], evidence: go?.evidence });
  expect(merged.stacks.find(({ id }) => id === "api-first")?.evidence).toEqual({});
  expect(server.requests).toHaveLength(1);
});

test.each(["stats", "lastRun", "both"] as const)(
  "API %s wins while the other evidence field falls back locally",
  async (field) => {
    const home = space.dir();
    cachedEvidence(home);
    const opts = apiOptions(home, server.url);
    const local = decoded(await runCli(["search", "go cli", "--local", "--json"], opts));
    const go = local.stacks.find(({ id }) => id === "go-cli");
    const evidence = {
      ...(field !== "lastRun"
        ? { stats: { greenRateLower: 0.5, sample: 10, projects: 20, window: 7 as const } }
        : {}),
      ...(field !== "stats" && go?.evidence.lastRun
        ? { lastRun: { ...go.evidence.lastRun, date: "2026-10-28" } }
        : {}),
    };
    server.answer(response([officialHit("go-cli", { evidence })]));
    const merged = decoded(await runCli(["search", "go cli", "--json"], opts));
    expect(merged.stacks.find(({ id }) => id === "go-cli")?.evidence).toEqual({
      ...go?.evidence,
      ...evidence,
    });
    expect(server.requests).toHaveLength(1);
  },
);

test("same-id stack evidence does not attach to an API fragment", async () => {
  const opts = apiOptions(space.dir(), server.url);
  server.answer(response([], [officialHit("go-cli", { kind: "fragment" })]));
  const merged = decoded(await runCli(["search", "go cli", "--json"], opts));
  expect(merged.fragments.find(({ id }) => id === "go-cli")?.evidence).toEqual({});
  expect(server.requests).toHaveLength(1);
});

test("API fragments retain local cached stats when their evidence is empty", async () => {
  const home = space.dir();
  const summary = cachedEvidence(home);
  const row = summary.items[0];
  if (!row) throw new Error("Missing published stats fixture");
  put(
    join(home, "cache/stacks/stats/summary.json"),
    JSON.stringify(
      Schema.encodeSync(StatsSummary)({
        ...summary,
        items: [{ ...row, id: "clerk", kind: "fragment" }],
      }),
    ),
  );
  const opts = apiOptions(home, server.url);
  const local = decoded(await runCli(["search", "auth", "--local", "--json"], opts));
  const clerk = local.fragments.find(({ id }) => id === "clerk");
  expect(clerk?.evidence.stats).toMatchObject({ greenRateLower: 0.86 });
  server.answer(response([], [officialHit("clerk", { kind: "fragment" })]));
  const merged = decoded(await runCli(["search", "auth", "--json"], opts));
  expect(merged.fragments.find(({ id }) => id === "clerk")?.evidence).toEqual({
    stats: clerk?.evidence.stats,
  });
  expect(server.requests).toHaveLength(1);
});

test("empty search lists ask for a different product description in every audience", async () => {
  server.answer(response([], []));
  const opts = apiOptions(space.dir(), server.url);
  opts.host = { ...opts.host, registry: emptyRegistry };
  const json = decoded(await runCli(["search", "!!!", "--json"], opts));
  expect(json).toMatchObject({ noStrongMatch: true, stacks: [], fragments: [], remote: "used" });
  for (const host of [{}, terminal]) {
    const text = await runCli(["search", "!!!"], { ...opts, host: { ...opts.host, ...host } });
    expect(text.status).toBe(0);
    expect(text.stderr).toBe("");
    expect(text.stdout).toContain("Nothing matched.");
    expect(text.stdout.replace(/\s+/g, " ")).toContain(
      'Next: ask the user to describe the product differently, then run stacks search "<request>" or stacks list.',
    );
    expect(text.stdout).not.toMatch(/stacks (?:show|new)|weak match|confirm the fit/i);
  }
  expect(server.requests).toHaveLength(3);
});

test("weak-only search still asks before using a match", async () => {
  server.answer(response([officialHit("go-cli", { tier: "weak" })]));
  const opts = apiOptions(space.dir(), server.url);
  opts.host = { ...opts.host, registry: emptyRegistry };
  for (const host of [{}, terminal]) {
    const text = await runCli(["search", "cli"], { ...opts, host: { ...opts.host, ...host } });
    expect(text.status).toBe(0);
    expect(text.stderr).toBe("");
    expect(text.stdout).toContain("confirm with the user before using a weak match");
    expect(text.stdout).toContain("stacks show go-cli");
  }
});

test.each([
  { args: ["search", "go", "--limit", "50"], details: { flag: "limit", value: "50" } },
  { args: ["search", "   "], details: { flag: "request", length: 0 } },
  { args: ["search", "x".repeat(501)], details: { flag: "request", length: 501 } },
])("input details name the rejected value: $details", async ({ args, details }) => {
  const result = await runCli([...args, "--json"], apiOptions(space.dir(), server.url));
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  const envelope = Schema.decodeUnknownSync(ErrorEnvelope)(JSON.parse(result.stderr), {
    onExcessProperty: "error",
  });
  expect(envelope.error).toMatchObject({ tag: "BadInput", details });
  expect(envelope.error.details).not.toHaveProperty("id");
  expect(server.requests).toEqual([]);
});

test.each([
  { args: ["search"], command: "search", suggestion: undefined },
  { args: ["search", "cli", "--kind", "stacks"], command: "search", suggestion: "stack" },
  { args: ["show"], command: "show", suggestion: undefined },
  { args: ["show", "go-cli", "--kind", "stacks"], command: "show", suggestion: "stack" },
  { args: ["new", "go-cli", "app", "--preset", "sandbx"], command: "new", suggestion: "sandbox" },
])(
  "parser errors name $command help and suggest choices",
  async ({ args, command, suggestion }) => {
    const opts = apiOptions(space.dir(), server.url);
    const result = await runCli([...args, "--json"], opts);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    const envelope = Schema.decodeUnknownSync(ErrorEnvelope)(JSON.parse(result.stderr), {
      onExcessProperty: "error",
    });
    expect(envelope.error.next).toContain(`stacks ${command} --help`);
    expect(envelope.error.details).toMatchObject({ command });
    if (suggestion) expect(envelope.error.details).toMatchObject({ suggestions: [suggestion] });
    for (const host of [{}, terminal]) {
      const text = await runCli(args, { ...opts, host: { ...opts.host, ...host } });
      expect(text.status).toBe(2);
      expect(text.stdout).toBe("");
      expect(text.stderr).toContain(`stacks ${command} --help`);
      if (suggestion) expect(text.stderr).toContain(`Did you mean: ${suggestion}?`);
    }
    expect(server.requests).toEqual([]);
  },
);
