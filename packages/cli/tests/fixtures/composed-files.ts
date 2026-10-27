import { chmodSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Exit, Schema } from "effect";
import { expect } from "vitest";
import { NewResult } from "../../src/schemas/new";
import { quiet, runCli, tempDir } from "../helpers/cli";
import { bundledAt, composeExit } from "../helpers/compose";
import { minimal, writeEntry } from "../helpers/registry";

export const STACK_META = minimal(
  "stack",
  "sample",
  `fragments:
  required: [sample, z-extra]
merge: [.shared/settings.json]
commands: { test: bun test, lint: bun run lint }`,
);
export const BODY = "# Build it\n\nKeep the public API small.\n";
export const TEMPLATE = [
  "name={{ project_name }}",
  "slug={{ project_slug }}",
  "env={{ env_prefix }}",
  "scope={{ package_scope }}",
  "author={{ author }}",
  "year={{ year }}",
  "",
].join("\n");
export const BINARY = Uint8Array.from([0, 255, 128, 13, 10, 0, 65]);

/** A real registry, with a stack and fragment sharing an id and three ordered JSON writers. */
export function fileFixture(home: string) {
  const root = join(home, "registry with spaces");
  const stack = writeEntry(root, "stack", "sample", STACK_META, BODY);
  const first = writeEntry(
    root,
    "fragment",
    "sample",
    minimal("fragment", "sample", "merge: [.shared/settings.json]"),
    "# First fragment\n",
  );
  const last = writeEntry(
    root,
    "fragment",
    "z-extra",
    minimal("fragment", "z-extra", "requires: [sample]\nmerge: [.shared/settings.json]"),
    "# Last fragment\n",
  );
  const put = (entry: string, file: string, bytes: string | Uint8Array, mode = 0o644) => {
    const at = join(entry, file);
    mkdirSync(join(at, ".."), { recursive: true });
    writeFileSync(at, bytes);
    chmodSync(at, mode);
    return at;
  };
  put(stack, "files/README.md.tmpl", TEMPLATE);
  put(stack, "files/.gitignore", "node_modules/\n{{ project_name }}\n");
  put(stack, "files/payload.bin", BINARY);
  put(stack, "files/docs/naïve notes.txt", "Café\n");
  put(stack, "files/-flags.txt", "literal leading dash\n");
  put(stack, "files/.shared/settings.json", '{"nested":{"stack":true},"order":["stack"]}');
  put(first, "files/.shared/settings.json", '{"nested":{"first":true},"order":["first"]}');
  put(last, "files/.shared/settings.json", '{"nested":{"last":true},"order":["last"]}');
  put(first, "files/.githooks/pre-commit", "#!/bin/sh\nexit 0\n", 0o751);
  for (const agent of ["claude", "codex"])
    put(stack, `adapters/${agent}/AGENTS.md`, "Read .quickstacks/BRIEF.md.\n");
  return { root, stack, first, last, put };
}
export type FileFixture = ReturnType<typeof fileFixture>;

export async function composition(
  fixture: FileFixture,
  options: Parameters<typeof composeExit>[0] = {},
) {
  const exit = await composeExit(
    { stack: "sample", agents: ["claude"], ...options },
    { roots: bundledAt(fixture.root) },
  );
  if (!Exit.isSuccess(exit)) throw new Error(`Fixture did not compose: ${JSON.stringify(exit)}`);
  return exit.value;
}

/** Real command, filesystem and git; the caller checks the result and on-disk files. */
export function scaffoldCli(
  fixture: FileFixture,
  home: string,
  dir: string,
  options: {
    agents?: string;
    sandbox?: boolean;
    env?: Record<string, string>;
    cwd?: string;
    invocation?: string;
    scope?: string;
  } = {},
) {
  return runCli(
    [
      "new",
      "sample",
      dir,
      "--json",
      "--agents",
      options.agents ?? "claude",
      ...(options.sandbox ? ["--sandbox"] : []),
      ...(options.scope ? ["--scope", options.scope] : []),
    ],
    {
      home,
      host: {
        registry: fixture.root,
        cwd: options.cwd ?? home,
        ...(options.invocation ? { invocation: options.invocation } : {}),
      },
      env: {
        ...quiet,
        PATH: process.env.PATH ?? "",
        GIT_CONFIG_NOSYSTEM: "1",
        ...options.env,
      },
    },
  );
}
export function newResult(result: Awaited<ReturnType<typeof scaffoldCli>>) {
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  return Schema.decodeUnknownSync(NewResult)(JSON.parse(result.stdout));
}

/** Files only, with git's own metadata excluded from the scaffold comparison. */
export function projectFiles(root: string, rel = ""): string[] {
  return readdirSync(join(root, rel))
    .sort()
    .filter((name) => rel !== "" || name !== ".git")
    .flatMap((name) => {
      const at = rel ? `${rel}/${name}` : name;
      return statSync(join(root, at)).isDirectory() ? projectFiles(root, at) : [at];
    })
    .sort();
}

export function workspace() {
  const dirs: ReturnType<typeof tempDir>[] = [];
  return {
    dir: () => {
      const dir = tempDir();
      dirs.push(dir);
      return dir.path;
    },
    release: () => {
      for (const dir of dirs.splice(0)) dir.cleanup();
    },
  };
}
