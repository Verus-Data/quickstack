import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OfficialNames, SignedIndex } from "@stacks/format";
import { Schema } from "effect";
import { expect } from "vitest";
import { entryPath, fixture, privateKey, proof } from "../fixtures/index/harness";
import { writeLedger } from "./ledger";
import { minimal, writeEntry } from "./registry";

export type NamesFixture = Awaited<ReturnType<typeof fixture>>;
export type NamesSource = OfficialNames["sources"][number];
type BuildResult = Awaited<ReturnType<NamesFixture["invoke"]>>;

export function git(f: NamesFixture, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: f.root,
    env: {
      HOME: join(f.root, "home"),
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_AUTHOR_NAME: "Fixture",
      GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "Fixture",
      GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      GIT_AUTHOR_DATE: "2026-10-27T09:00:00Z",
      GIT_COMMITTER_DATE: "2026-10-27T09:00:00Z",
    },
    encoding: "utf8",
  }).trim();
}

export function release(f: NamesFixture, tag: string) {
  git(f, "add", "packages/cli/registry");
  git(f, "commit", "--quiet", "-m", `fixture: ${tag}`);
  git(f, "tag", tag);
}

export function renameStep(f: NamesFixture, from: string, to: string) {
  const file = join(entryPath(f.registry, "stack", "sample"), "STACK.md");
  const text = readFileSync(file, "utf8");
  expect(text).toContain(`name: ${from},`);
  writeFileSync(file, text.replace(`name: ${from},`, `name: ${to},`));
}

export function defaultOnly(f: NamesFixture) {
  const file = join(entryPath(f.registry, "stack", "sample"), "STACK.md");
  const text = readFileSync(file, "utf8");
  expect(text).toContain("  optional: [extra, unproven]\n");
  writeFileSync(file, text.replace("  optional: [extra, unproven]\n", ""));
}

export async function taggedFixture(temporary: string) {
  const f = await fixture(temporary);
  for (const id of ["tools", "extra", "unproven", "retired-tool"]) {
    writeEntry({
      root: f.registry,
      kind: "fragment",
      dir: id,
      frontmatter: minimal(
        "fragment",
        id,
        `verify:\n  - { name: ${id}-check, layer: check, run: "true" }`,
      ),
    });
  }
  const sample = readFileSync(join(f.registry, "stacks/sample/STACK.md"), "utf8");
  const retired = entryPath(f.registry, "stack", "retired");
  writeEntry({ root: f.registry, kind: "stack", dir: "retired", frontmatter: "" });
  writeFileSync(join(retired, "STACK.md"), sample.replaceAll("sample", "retired"));
  renameStep(f, "lint", "lint-v1");
  release(f, "v0.1.0");
  rmSync(retired, { recursive: true });
  rmSync(entryPath(f.registry, "fragment", "retired-tool"), { recursive: true });
  renameStep(f, "lint-v1", "lint-v2");
  release(f, "v0.2.0");
  renameStep(f, "lint-v2", "lint-index");
  defaultOnly(f);
  writeLedger(f.registry, [await proof(f.registry)]);
  git(f, "add", "packages/cli/registry");
  git(f, "commit", "--quiet", "-m", "fixture: unreleased index composition");
  return { ...f, commit: git(f, "rev-parse", "HEAD") };
}

export function succeeded(result: BuildResult, warning = false) {
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).not.toBe("");
  if (!warning) expect(result.stderr).toBe("");
}

export function rejectedNames(result: BuildResult) {
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("v1/names.json");
  expect(result.stderr).not.toMatch(
    /Module not found|Cannot find module|SyntaxError|ReferenceError/,
  );
}

export async function buildNames(f: NamesFixture, out = f.out, previous = "none") {
  const result = await f.invoke(["--out", out, "--previous", previous, "--key", privateKey]);
  succeeded(result);
}

export function readNames(out: string) {
  const envelope = Schema.decodeUnknownSync(SignedIndex)(
    JSON.parse(readFileSync(join(out, "v1/names.json"), "utf8")),
  );
  const names: OfficialNames = Schema.decodeUnknownSync(OfficialNames)(
    JSON.parse(envelope.payload),
  );
  return { envelope, names };
}

/** The names contract defines membership, not ordering of sources, compositions or names. */
export function unordered(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(unordered).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unordered(item)]));
  return value;
}

export function releaseSource(version: string) {
  const ids =
    version === "0.1.0" ? ["sample", "never-proven", "retired"] : ["sample", "never-proven"];
  return {
    origin: "release",
    version,
    fragments:
      version === "0.1.0"
        ? ["tools", "extra", "unproven", "retired-tool"]
        : ["tools", "extra", "unproven"],
    stacks: ids.map((id) => {
      const lint = id === "sample" ? `lint-v${version === "0.1.0" ? "1" : "2"}` : "lint";
      const steps = ["install", lint, "typecheck", "test", "tools-check"];
      return {
        id,
        compositions: [
          { fragments: ["tools"], steps },
          { fragments: ["tools", "extra"], steps: [...steps, "extra-check"] },
          { fragments: ["tools", "unproven"], steps: [...steps, "unproven-check"] },
        ],
      };
    }),
  };
}
