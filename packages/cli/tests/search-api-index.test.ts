import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { Command } from "effect/cli";
import { afterAll, beforeAll, expect, test } from "vitest";
import { cli } from "../src/cli";
import { RemoteIndex } from "../src/core/remote-index";
import { NewResult } from "../src/schemas/new";
import { ShowReport } from "../src/schemas/show";
import { VERSION } from "../src/version";
import { runCli, tempDir } from "./helpers/cli";
import {
  buildRemoteFixture,
  keys,
  type RemoteFixture,
  type RemoteServer,
  remoteServer,
} from "./helpers/remote-index";
import {
  apiOptions,
  decoded,
  officialHit,
  response,
  type SearchServer,
  searchServer,
  validResponse,
} from "./helpers/search-api";

const scratch = tempDir();
let fixture: RemoteFixture;
let api: SearchServer;
let index: RemoteServer;
// Two signed snapshots are built once with the existing real index fixture builder.
beforeAll(async () => {
  fixture = await buildRemoteFixture(scratch.path);
  api = await searchServer();
  index = await remoteServer(fixture.out);
}, 90_000);
afterAll(async () => {
  await api?.close();
  await index?.close();
  scratch.cleanup();
});

test("an API-only stack is discoverable and show/new resolve it through the signed index [4.5e#15]", async () => {
  const options = apiOptions(scratch.path, api.url);
  options.env = { ...options.env, PATH: process.env.PATH };
  const invoke = (args: string[]) =>
    runCli(args, {
      ...options,
      program: Command.runWith(cli, { version: VERSION, renderErrors: false })(args).pipe(
        Effect.provide(RemoteIndex.layer({ keys, officialUrl: `${index.url}/v1/index.json` })),
      ),
    });
  // Above every bundled stack's local score, so the API's own hit leads the merged list.
  const body = response([officialHit("sample", { score: 1 })]);
  api.answer(body);
  const local = decoded(await invoke(["search", "sample", "--local", "--limit", "20", "--json"]));
  expect(local.stacks.some(({ id }) => id === "sample")).toBe(false);
  const found = decoded(await invoke(["search", "sample", "--json"]));
  expect(found).toMatchObject({ ranking: "api", remote: "used" });
  expect(found.stacks[0]).toEqual(body.stacks[0]);
  expect(index.requests).toEqual([]);
  expect(api.requests).toHaveLength(1);
  const shown = await invoke(["show", "sample", "--json"]);
  expect(shown.status, shown.stderr).toBe(0);
  expect(shown.stderr).toBe("");
  expect(Schema.decodeUnknownSync(ShowReport)(JSON.parse(shown.stdout))).toMatchObject({
    id: "sample",
    origin: "index",
    trusted: true,
  });
  expect(index.requests).toContain("/v1/index.json");
  expect(index.requests.some((path) => path.startsWith("/v1/entries/stack/sample/"))).toBe(true);
  const target = join(scratch.path, "new-project");
  const created = await invoke(["new", "sample", target, "--sandbox", "--no-launch", "--json"]);
  expect(created.status, created.stderr).toBe(0);
  expect(created.stderr).toBe("");
  const result = Schema.decodeUnknownSync(NewResult)(JSON.parse(created.stdout));
  expect(result).toMatchObject({ stack: "sample", untrusted: [] });
  expect(existsSync(join(target, ".stacks/manifest.json"))).toBe(true);
  expect(JSON.parse(readFileSync(join(target, ".stacks/manifest.json"), "utf8"))).toMatchObject({
    stack: { id: "sample", origin: "index", trusted: true },
  });
  await validResponse(body);
});
