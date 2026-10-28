import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { workspaces } from "../../../package.json";
import { tempDir } from "./helpers/files";

const pkg = join(import.meta.dirname, "..");
const repo = join(pkg, "../..");
const scratch = tempDir();
afterAll(() => scratch.cleanup());

function findOnPath(name: string): string {
  const candidates = isAbsolute(name)
    ? [name]
    : (process.env.PATH ?? "").split(":").map((dir) => join(dir, name));
  const candidate = candidates.find((path) => existsSync(path));
  if (candidate === undefined) throw new Error(`Required executable not found: ${name}`);
  return candidate;
}

function findNode(): string {
  const candidate = findOnPath(process.env.STACKS_E2E_NODE || "node");
  const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
  const major = Number(result.stdout?.match(/^v(\d+)\./)?.[1]);
  if (result.status !== 0 || !Number.isInteger(major) || major < 22)
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
function files(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true }).flatMap((entry) =>
    entry.isFile() ? [join(entry.parentPath, entry.name).slice(root.length + 1)] : [],
  );
}
function tarball(): string {
  const directory = join(pkg, "dist/pack");
  const names = readdirSync(directory).filter((name) => name.endsWith(".tgz"));
  expect(names).toHaveLength(1);
  const name = names[0];
  if (name === undefined) throw new Error("pack did not produce a tarball");
  return join(directory, name);
}
const installed = join(scratch.path, "node_modules/@steamfield/stacks-format");

beforeAll(() => {
  writeFileSync(env.npm_config_userconfig, "");
  writeFileSync(env.npm_config_globalconfig, "");
  succeeded(run(findOnPath("bun"), ["run", "pack"], pkg));
  writeFileSync(
    join(scratch.path, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  // Both install inputs are local. The empty cache and --offline prevent registry fallback.
  const effect = realpathSync(join(repo, "packages/cli/node_modules/effect"));
  succeeded(
    run(node, [
      npmCli,
      "install",
      tarball(),
      effect,
      "--offline",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
    ]),
  );
}, 120_000); // One build, pack and offline install for this file; each child is capped at 60 seconds.

test("the tarball ships only dist JavaScript/declarations, JSON schemas, metadata and license [4.0a#5]", () => {
  const listing = run("tar", ["-tzf", tarball()]);
  succeeded(listing);
  const actual = listing.stdout
    .trim()
    .split("\n")
    .filter((file) => !file.endsWith("/"))
    .map((file) => file.replace(/^package\//, ""))
    .sort();
  const dist = files(join(pkg, "dist"))
    .filter((file) => !file.startsWith("pack/"))
    .map((file) => `dist/${file}`);
  expect(dist).toContain("dist/index.js");
  expect(dist).toContain("dist/index.d.ts");
  expect(dist.every((file) => file.endsWith(".js") || file.endsWith(".d.ts"))).toBe(true);
  const schemas = files(join(pkg, "schemas")).map((file) => `schemas/${file}`);
  expect(schemas).toContain("schemas/telemetry-event.v1.json");
  expect(actual).toEqual(["LICENSE", "package.json", ...dist, ...schemas].sort());
  const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
  for (const file of ["LICENSE", ...dist, ...schemas])
    expect(hash(join(installed, file))).toBe(hash(join(pkg, file)));
  const packed = readFileSync(join(installed, "package.json"), "utf8");
  expect(packed).not.toMatch(/(?:catalog|workspace):/);
  expect(JSON.parse(packed)).toMatchObject({ name: "@steamfield/stacks-format", type: "module" });
  expect(JSON.parse(packed).dependencies).toEqual({ effect: workspaces.catalog.effect });
});

test("plain Node imports the installed package and decodes a manifest [4.0a#5]", () => {
  const fixture = readFileSync(join(import.meta.dirname, "fixtures/manifest.json"), "utf8");
  writeFileSync(join(scratch.path, "manifest.json"), fixture);
  writeFileSync(
    join(scratch.path, "consumer.mjs"),
    `
import { readFileSync } from "node:fs";
import { Effect, Schema } from "effect";
import { bundleDigest, Manifest, EntryBundle } from "@steamfield/stacks-format";
const manifest = Schema.decodeUnknownSync(Manifest)(JSON.parse(readFileSync("manifest.json", "utf8")));
const bundle = Schema.decodeUnknownSync(EntryBundle)({ id: "demo", kind: "stack", files: [] });
console.log(JSON.stringify({ manifest, digest: await Effect.runPromise(bundleDigest(bundle)), resolved: import.meta.resolve("@steamfield/stacks-format") }));
`,
  );
  const result = run(node, ["consumer.mjs"]);
  succeeded(result);
  expect(result.stderr).toBe("");
  const output = JSON.parse(result.stdout);
  expect(output.manifest).toEqual(JSON.parse(fixture));
  expect(output.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(output.resolved).toBe(pathToFileURL(join(installed, "dist/index.js")).href);
});

test("installed declarations typecheck a consumer with no platform ambient types [4.0a#5]", () => {
  writeFileSync(
    join(scratch.path, "consumer.ts"),
    `
import { Effect, Schema } from "effect";
import { bundleDigest, canonicalBundle, EntryBundle, Manifest, RunRecord, type ResolvedStep, withStepDefaults } from "@steamfield/stacks-format";
const manifest: Manifest = Schema.decodeUnknownSync(Manifest)({});
const run: RunRecord = Schema.decodeUnknownSync(RunRecord)({});
const bundle: EntryBundle = Schema.decodeUnknownSync(EntryBundle)({ id: "demo", kind: "stack", files: [] });
const bytes: Uint8Array = canonicalBundle(bundle);
const digest: Effect.Effect<string> = bundleDigest(bundle);
const step: ResolvedStep = withStepDefaults({ name: "test", run: "npm test" });
export { manifest, run, bytes, digest, step };
`,
  );
  writeFileSync(
    join(scratch.path, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2023",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        types: [],
        strict: true,
        noEmit: true,
        skipLibCheck: false,
      },
      include: ["consumer.ts"],
    }),
  );
  const result = run(join(repo, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"]);
  succeeded(result);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("");
  // A second compile must reject an incompatible assignment, proving declarations aren't `any`.
  writeFileSync(
    join(scratch.path, "consumer.ts"),
    'import { Schema } from "effect"; import { bundleDigest, EntryBundle } from "@steamfield/stacks-format"; const bundle = Schema.decodeUnknownSync(EntryBundle)({ id: "demo", kind: "stack", files: [] }); const wrong: number = bundleDigest(bundle); export { wrong };',
  );
  const invalid = run(join(repo, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"]);
  expect(invalid.status).not.toBe(0);
  expect(invalid.stdout + invalid.stderr).toContain("TS2322");
});

test("the package supplies the workspace lifecycle scripts [4.0a#5]", () => {
  const metadata = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
  for (const name of ["build", "typecheck", "test", "coverage", "check", "clean", "pack"]) {
    expect(metadata.scripts[name], name).toEqual(expect.any(String));
    expect(metadata.scripts[name].trim(), name).not.toBe("");
  }
});
