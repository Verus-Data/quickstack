import { existsSync } from "node:fs";
import { join } from "node:path";
import { StackStatsDetail, StatsDetail, StatsSummary } from "@steamfield/stacks-format";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { tempDir } from "./helpers/cli";
import { detail, statsCli, statsRegistry, statsServer, summary } from "./helpers/stats";

test("seeded text labels suppressed stats in list and show", async () => {
  const home = tempDir();
  const registry = tempDir();
  statsRegistry(registry.path);
  const server = await statsServer();
  server.summary(
    Schema.decodeUnknownSync(Schema.toType(StatsSummary))({
      ...summary,
      population: "seeded development data",
    }),
  );
  server.detail(
    Schema.decodeUnknownSync(Schema.toType(StackStatsDetail))({
      ...detail,
      population: "seeded development data",
      greenRate: { value: null, lower: null, upper: null, sample: null, suppressed: true },
    }),
  );
  try {
    const options = { home: home.path, registry: registry.path, server };
    const listed = await statsCli(["list"], options);
    const shown = await statsCli(["show", "go-cli"], options);
    expect(listed.status).toBe(0);
    expect(listed.stderr).toBe("");
    expect(listed.stdout).toContain("green unavailable (seeded)");
    expect(shown.status).toBe(0);
    expect(shown.stderr).toBe("");
    expect(shown.stdout).toContain("green unavailable (seeded)");
  } finally {
    await server.close();
    home.cleanup();
    registry.cleanup();
  }
});

test("show rejects a detail body for another entry without caching it", async () => {
  const home = tempDir();
  const registry = tempDir();
  statsRegistry(registry.path);
  const server = await statsServer();
  server.detail(
    Schema.decodeUnknownSync(Schema.toType(StatsDetail))({ ...detail, id: "astro-api" }),
  );
  try {
    const result = await statsCli(["show", "go-cli", "--json"], {
      home: home.path,
      registry: registry.path,
      server,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const report: unknown = JSON.parse(result.stdout);
    expect(report).not.toHaveProperty("stats");
    expect(existsSync(join(home.path, "cache", "stacks", "stats", "stack-go-cli.json"))).toBe(
      false,
    );
    expect(server.requests).toEqual(["/v1/stacks/go-cli/stats"]);
  } finally {
    await server.close();
    home.cleanup();
    registry.cleanup();
  }
});
