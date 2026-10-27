import {
  cpSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Schema } from "effect";
import { expect } from "vitest";
import { quiet, runCli, tempDir } from "./cli";
import { spawnGit } from "./git";
import { stateEnv } from "./verify";

const fixtures = join(import.meta.dirname, "..", "fixtures");
const dirs: ReturnType<typeof tempDir>[] = [];
export const releaseAdd = () => {
  for (const dir of dirs.splice(0)) dir.cleanup();
};
export type AddProject = { home: string; root: string; registry: string };

/** Every project is a real repository; its HOME, state and registry are isolated. */
export function addProject(name = "app"): AddProject {
  const dir = tempDir();
  dirs.push(dir);
  const home = dir.path;
  const root = join(home, name);
  const registry = join(home, "registry");
  mkdirSync(root);
  cpSync(join(fixtures, "registry-add"), registry, { recursive: true });
  const git = spawnGit(["init", "--quiet", root]);
  expect(git.stderr?.toString() ?? "").toBe("");
  expect(git.status).toBe(0);
  return { home, root, registry };
}

export function addCli(
  project: AddProject,
  args: readonly string[],
  options: Parameters<typeof runCli>[1] = {},
) {
  return runCli(args, {
    ...options,
    home: project.home,
    env: {
      ...quiet,
      ...stateEnv(project.home),
      PATH: process.env.PATH ?? "",
      GIT_CONFIG_NOSYSTEM: "1",
      ...options.env,
    },
    host: { cwd: project.root, registry: project.registry, ...options.host },
  });
}

export async function scaffolded() {
  const project = addProject();
  const run = await addCli(project, [
    "new",
    "fixture-stack",
    project.root,
    "--without",
    "default-only",
    "--json",
  ]);
  expect(run.status).toBe(0);
  expect(run.stderr).toBe("");
  const { NewResult } = await import("../../src/schemas/new");
  Schema.decodeUnknownSync(NewResult)(JSON.parse(run.stdout));
  return project;
}

export function put(root: string, path: string, bytes: string | Uint8Array) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
}
export const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");
export function projectFragment(project: AddProject) {
  cpSync(join(fixtures, "add-project", "fragments"), join(project.root, ".stacks", "fragments"), {
    recursive: true,
  });
}

/** Sorted paths and bytes, including metadata; don't traverse git internals or symlinks. */
export function snapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (relative: string) => {
    for (const name of readdirSync(join(root, relative)).sort()) {
      if (name === ".git") continue;
      const path = relative ? `${relative}/${name}` : name;
      const at = join(root, path);
      const stat = lstatSync(at);
      if (stat.isSymbolicLink()) result[path] = `link:${readlinkSync(at)}`;
      else if (stat.isDirectory()) {
        result[path] = "directory";
        walk(path);
      } else result[path] = readFileSync(at).toString("base64");
    }
  };
  walk("");
  return result;
}

type CliRun = Awaited<ReturnType<typeof runCli>>;
export async function added(run: CliRun) {
  expect(run.status).toBe(0);
  expect(run.stderr).toBe("");
  expect(run.stdout.trim().split("\n")).toHaveLength(1);
  // Resolve the future schema only after the command ran, so each red test reports its behavior.
  const { AddResult } = await import("../../src/schemas/add");
  return Schema.decodeUnknownSync(AddResult)(JSON.parse(run.stdout));
}

const ErrorEnvelope = Schema.Struct({
  error: Schema.Struct({
    tag: Schema.String,
    message: Schema.String,
    retryable: Schema.Boolean,
    details: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  }),
});
export function refused(run: CliRun, status: number, tag: string) {
  expect(run.status).toBe(status);
  expect(run.stdout).toBe("");
  expect(run.stderr.trim().split("\n")).toHaveLength(1);
  const result = Schema.decodeUnknownSync(ErrorEnvelope)(JSON.parse(run.stderr));
  expect(result.error.tag).toBe(tag);
  return result.error;
}
