import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { SearchResult } from "@steamfield/stacks-format";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { emptyRegistry } from "./helpers/registry";
import { buildRemoteFixture, remoteCli, remoteServer, success } from "./helpers/remote-index";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());

test("search includes cached index entries without refreshing the index or fetching bundles", async () => {
  const root = space.dir();
  const fixture = await buildRemoteFixture(root);
  const server = await remoteServer(fixture.out);
  const options = { home: join(root, "home"), server, host: { registry: emptyRegistry } };
  mkdirSync(options.home);
  try {
    success(await remoteCli(["list", "--json"], options));
    server.requests.length = 0;
    const result = await remoteCli(["search", "sample", "--json"], options);
    success(result);
    const value = Schema.decodeUnknownSync(SearchResult)(JSON.parse(result.stdout));
    expect(value.stacks).toContainEqual(expect.objectContaining({ id: "sample", origin: "index" }));
    expect(server.requests).toEqual([]);
    const offline = await remoteCli(["search", "sample", "--offline", "--json"], options);
    success(offline);
    // 4.5e's remote fields say why the API wasn't asked, which differs offline.
    const ranking = (result: object) =>
      Object.entries(result).filter(([key]) => key !== "remote" && key !== "remoteReason");
    expect(ranking(Schema.decodeUnknownSync(SearchResult)(JSON.parse(offline.stdout)))).toEqual(
      ranking(value),
    );
    expect(server.requests).toEqual([]);
  } finally {
    await server.close();
  }
}, 90_000);
