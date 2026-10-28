import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { tempDir } from "./helpers/files";
import { searchInput } from "./helpers/search-input";

const pkg = join(import.meta.dirname, "..");
const repo = join(pkg, "../..");
const scratch = tempDir();
afterAll(() => scratch.cleanup());

function findOnPath(name: string): string {
  const candidates = isAbsolute(name)
    ? [name]
    : (process.env.PATH ?? "").split(":").map((dir) => join(dir, name));
  const candidate = candidates.find((path) => existsSync(path));
  if (!candidate) throw new Error(`Required executable not found: ${name}`);
  return candidate;
}
function findNode(): string {
  const candidate = findOnPath(process.env.STACKS_E2E_NODE || "node");
  const version = spawnSync(candidate, ["--version"], { encoding: "utf8" });
  const major = Number(version.stdout?.match(/^v(\d+)\./)?.[1]);
  if (version.status !== 0 || !Number.isInteger(major) || major < 22)
    throw new Error("Set STACKS_E2E_NODE to a Node 22 or newer binary.");
  const resolved = spawnSync(candidate, ["-p", "process.execPath"], { encoding: "utf8" });
  if (resolved.status !== 0) throw new Error("Could not resolve selected Node executable.");
  return resolved.stdout.trim();
}
const node = findNode();
const installedNpm = join(dirname(node), "../lib/node_modules/npm/bin/npm-cli.js");
const npmCli = existsSync(installedNpm) ? installedNpm : realpathSync(findOnPath("npm"));
const env = {
  HOME: scratch.path,
  PATH: `${dirname(node)}:${process.env.PATH ?? "/usr/bin:/bin"}`,
  npm_config_cache: join(scratch.path, "cache"),
  npm_config_userconfig: join(scratch.path, "user.npmrc"),
  npm_config_globalconfig: join(scratch.path, "global.npmrc"),
};
function run(executable: string, args: string[], cwd = scratch.path) {
  return spawnSync(executable, args, { cwd, env, encoding: "utf8", timeout: 60_000 });
}
function succeeded(result: ReturnType<typeof run>) {
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status, result.stdout + result.stderr).toBe(0);
}

/** Isolate build output from package.test.ts, which also packs under file parallelism. */
function packageCopy() {
  const root = join(scratch.path, "build");
  const copy = join(root, "packages/format");
  mkdirSync(copy, { recursive: true });
  for (const file of ["package.json", "tsconfig.base.json"])
    cpSync(join(repo, file), join(root, file));
  for (const file of [
    "src",
    "scripts",
    "schemas",
    "LICENSE",
    "package.json",
    "tsconfig.json",
    "tsconfig.build.json",
  ])
    cpSync(join(pkg, file), join(copy, file), { recursive: true });
  symlinkSync(join(repo, "node_modules"), join(root, "node_modules"));
  symlinkSync(join(pkg, "node_modules"), join(copy, "node_modules"));
  return copy;
}

beforeAll(() => {
  writeFileSync(env.npm_config_userconfig, "");
  writeFileSync(env.npm_config_globalconfig, "");
  const copy = packageCopy();
  succeeded(run(findOnPath("bun"), ["run", "pack"], copy));
  const tarballs = readdirSync(join(copy, "dist/pack")).filter((file) => file.endsWith(".tgz"));
  expect(tarballs).toHaveLength(1);
  const tarball = tarballs[0];
  if (!tarball) throw new Error("Missing packed format package");
  writeFileSync(join(scratch.path, "package.json"), '{"private":true,"type":"module"}');
  succeeded(
    run(node, [
      npmCli,
      "install",
      join(copy, "dist/pack", tarball),
      realpathSync(join(repo, "packages/cli/node_modules/effect")),
      "--offline",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
    ]),
  );
  writeFileSync(join(scratch.path, "input.json"), JSON.stringify(searchInput()));
}, 120_000); // One real pack and offline install; each child is bounded to 60 seconds.

test("plain Node imports and runs rank from the installed tarball without a TypeScript transform [4.5e#13]", () => {
  writeFileSync(
    join(scratch.path, "consumer.mjs"),
    `
import { readFileSync } from "node:fs";
import { Schema } from "effect";
import { rank, SearchHit, SearchMetadata, SearchResponse, SearchResult, SearchVocabulary } from "@steamfield/stacks-format";
const raw = JSON.parse(readFileSync("input.json", "utf8"));
const input = {
  ...raw, vocabulary: Schema.decodeUnknownSync(SearchVocabulary)(raw.vocabulary),
  entries: raw.entries.map(record => ({ ...record, search: Schema.decodeUnknownSync(SearchMetadata)(record.search) })),
};
const result = Schema.decodeUnknownSync(SearchResult)(rank(input));
const hit = Schema.decodeUnknownSync(SearchHit)(result.stacks[0]);
const response = Schema.decodeUnknownSync(SearchResponse)({
  method: "lexical", indexGeneratedAt: "2026-10-28T10:00:00Z",
  understood: result.understood, noStrongMatch: result.noStrongMatch,
  stacks: result.stacks.map(hit => ({ ...hit, origin: "index", trusted: true })), fragments: [],
});
console.log(JSON.stringify({ result, hit, response, resolved: import.meta.resolve("@steamfield/stacks-format") }));
`,
  );
  const result = run(node, ["--no-experimental-strip-types", "consumer.mjs"]);
  succeeded(result);
  expect(result.stderr).toBe("");
  const output = JSON.parse(result.stdout);
  expect(output.resolved).toBe(
    pathToFileURL(join(scratch.path, "node_modules/@steamfield/stacks-format/dist/index.js")).href,
  );
  expect(output.hit).toMatchObject({ id: "go-cli", tier: "strong" });
  expect(output.result).toMatchObject({
    ranking: "local",
    understood: { languages: ["go"], platforms: ["cli"] },
  });
  expect(output.response).toMatchObject({
    method: "lexical",
    stacks: [expect.objectContaining({ id: "go-cli", origin: "index" }), expect.any(Object)],
  });
});
