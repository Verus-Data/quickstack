import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { version } from "../package.json";

function findNode(): string {
  const candidate = process.env.QUICKSTACK_E2E_NODE || Bun.which("node");
  const failure = "Set QUICKSTACK_E2E_NODE to a Node 22 or newer binary.";
  if (!candidate || !Bun.which(candidate)) throw new Error(failure);
  const result = Bun.spawnSync([candidate, "--version"]);
  const major = Number(result.stdout.toString().match(/^v(\d+)\./)?.[1]);
  if (result.exitCode !== 0 || !Number.isInteger(major) || major < 22) throw new Error(failure);
  return execFileSync(candidate, ["-p", "process.execPath"], { encoding: "utf8" }).trim();
}

export const node = findNode();
export const tarball = join(import.meta.dirname, `../dist/pack/quickstack-cli-${version}.tgz`);
const root = realpathSync(mkdtempSync(join(tmpdir(), "quickstack-package-")));
process.once("exit", () => rmSync(root, { recursive: true, force: true }));
export const prefix = join(root, "prefix");
export const packageRoot = join(prefix, "lib/node_modules/@quickstack/cli");
export const binary = join(prefix, "bin/quickstack");
const runtime = join(root, "runtime");
mkdirSync(runtime);
symlinkSync(node, join(runtime, "node"));
export const scratchPath = `${runtime}:${dirname(node)}:${join(prefix, "bin")}:/usr/bin:/bin`;
const adjacentNpm = join(dirname(node), "npm");
export const npm = existsSync(adjacentNpm) ? adjacentNpm : Bun.which("npm");
if (!npm) throw new Error("npm is required to install the packed e2e artifact.");
// Version managers may wrap bin/npm in a shell script; Node's install still owns this JS entry.
const installedNpm = join(dirname(node), "../lib/node_modules/npm/bin/npm-cli.js");
export const npmCli = existsSync(installedNpm) ? installedNpm : realpathSync(npm);
execFileSync(
  node,
  [
    npmCli,
    "install",
    "--global",
    "--prefix",
    prefix,
    tarball,
    "--offline",
    "--no-audit",
    "--no-fund",
    "--ignore-scripts",
  ],
  {
    env: { HOME: root, PATH: scratchPath, npm_config_cache: join(root, "cache") },
    timeout: 60_000,
    stdio: "pipe",
  },
);
