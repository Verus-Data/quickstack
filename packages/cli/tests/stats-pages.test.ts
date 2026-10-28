import { createServer } from "node:http";
import { join } from "node:path";
import { StatsSummary } from "@steamfield/stacks-format";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { ListResult } from "../src/schemas/list";
import { quiet, runCli, tempDir } from "./helpers/cli";
import { statsRegistry, summary } from "./helpers/stats";

test.each([
  {
    name: "different rollup headers produce no stats",
    second: { population: "seeded development data" },
    hasStats: false,
  },
  {
    name: "equivalent record keys in a different order retain stats",
    second: {
      population: "stacks projects",
      entryPoints: {
        handoff: { print: 0.59, launch: 0.41 },
        source: { unknown: 0.78, skill: 0.22 },
      },
    },
    hasStats: true,
  },
] as const)("summary pages with $name", async ({ second, hasStats }) => {
  if (!summary.published) throw new Error("fixture must be published");
  const home = tempDir();
  const registry = tempDir();
  statsRegistry(registry.path);
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    const secondPage = request.url?.includes("cursor=second") ?? false;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify(
        Schema.encodeSync(StatsSummary)(
          Schema.decodeUnknownSync(StatsSummary)({
            ...summary,
            ...(secondPage ? second : { population: "stacks projects" }),
            items: secondPage ? summary.items.slice(1) : summary.items.slice(0, 1),
            ...(!secondPage ? { nextCursor: "second" } : {}),
          }),
        ),
      ),
    );
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing port");
    const result = await runCli(["list", "--json"], {
      home: home.path,
      host: { cwd: home.path, registry: registry.path },
      env: {
        ...quiet,
        XDG_CACHE_HOME: join(home.path, "cache"),
        STACKS_DEV_API_URL: `http://127.0.0.1:${address.port}`,
      },
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = Schema.decodeUnknownSync(ListResult)(JSON.parse(result.stdout));
    expect(output.entries.some((entry) => entry.id === "go-cli")).toBe(true);
    expect(output.entries.find((entry) => entry.id === "go-cli")?.stats !== undefined).toBe(
      hasStats,
    );
    expect(requests).toEqual(["/v1/stats", "/v1/stats?cursor=second"]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    home.cleanup();
    registry.cleanup();
  }
});
