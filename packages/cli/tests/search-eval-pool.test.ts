import { copyFileSync, mkdirSync, symlinkSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { execute } from "./helpers/remote-index";
import { fixtureRecord } from "./helpers/search-command";
import { cliRoot, copyVocabulary, put } from "./helpers/search-metadata";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());

test("embedding fusion can promote an entry beyond the first twenty lexical candidates", async () => {
  const root = space.dir();
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "tests/fixtures/search"), { recursive: true });
  copyFileSync(join(cliRoot, "scripts/search-eval.ts"), join(root, "scripts/search-eval.ts"));
  for (const path of ["src", "node_modules", "scripts/decorate", "tests/helpers"])
    symlinkSync(join(cliRoot, path), join(root, path));
  const registry = join(root, "registry");
  copyVocabulary(registry);
  for (let i = 0; i < 21; i++) await fixtureRecord(registry, `entry-${i}`);
  await fixtureRecord(registry, "zz-target");
  put(
    join(root, "tests/fixtures/search/golden.json"),
    JSON.stringify({
      schemaVersion: 1,
      gate: { mrr: 0, recallAt3: 0, fragmentRecallAt5: 0 },
      queries: [
        {
          id: "outside-lexical-pool",
          query: "quasar",
          pool: "paraphrase",
          split: "holdout",
          relevant: [{ kind: "stack", id: "zz-target", grade: 2 }],
        },
      ],
    }),
  );
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const value = Schema.decodeUnknownSync(Schema.Struct({ input: Schema.Array(Schema.String) }))(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        data: value.input.map((text, index) => ({
          index,
          embedding: text.includes("zz-target") || text === "quasar" ? [1, 0] : [0, 1],
        })),
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing embedding server port");
  try {
    const result = await execute(
      "bun",
      ["--no-env-file", "--config=/dev/null", "scripts/search-eval.ts", "--embeddings"],
      root,
      {
        PATH: process.env.PATH,
        HOME: root,
        NO_COLOR: "1",
        OPENROUTER_API_KEY: "fake-local-key",
        OPENROUTER_BASE_URL: `http://127.0.0.1:${address.port}/api/v1`,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(/Fused stacks: zz-target\b/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 30_000);
