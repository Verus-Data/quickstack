import { execFileSync } from "node:child_process";
import { verify } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type IndexEntry, SignedIndex } from "@stacks/format";
import { Schema } from "effect";
import { expect } from "vitest";
import {
  compositionFingerprint,
  fixture,
  keyId,
  privateKey,
  proof,
  publicKey,
} from "../fixtures/index/harness";
import { writeLedger } from "./ledger";
import { git, type NamesFixture, succeeded } from "./official-names";
import { minimal, writeEntry } from "./registry";

export async function buildDirectory(f: NamesFixture, out = f.out, previous = "none") {
  succeeded(await f.invoke(["--out", out, "--previous", previous, "--key", privateKey]));
}

export function failedDirectory(result: Awaited<ReturnType<NamesFixture["invoke"]>>) {
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim()).not.toBe("");
  expect(result.stderr).not.toMatch(
    /Module not found|Cannot find module|SyntaxError|ReferenceError/,
  );
}

export function directoryEnvelope(out: string) {
  return Schema.decodeUnknownSync(SignedIndex)(
    JSON.parse(readFileSync(join(out, "v1/directory.json"), "utf8")),
  );
}

export function entryRefs(entries: ReadonlyArray<Pick<IndexEntry, "id" | "kind">>) {
  return entries.map(({ id, kind }) => ({ id, kind }));
}

export function datedEntries(
  entries: ReadonlyArray<Pick<IndexEntry, "id" | "kind"> & { readonly addedAt: string }>,
) {
  return entries.map(({ id, kind, addedAt }) => ({
    id,
    kind,
    addedAt: new Date(addedAt).toISOString(),
  }));
}

export async function readDirectory(out: string) {
  const envelope = directoryEnvelope(out);
  expect(envelope.keyId).toBe(keyId);
  expect(
    verify(
      null,
      Buffer.from(envelope.payload),
      publicKey,
      Buffer.from(envelope.signature, "base64"),
    ),
  ).toBe(true);
  const { DirectoryData } = await import("@stacks/format");
  return Schema.decodeUnknownSync(DirectoryData)(JSON.parse(envelope.payload));
}

export function writeRemoved(f: NamesFixture, entries: Record<string, unknown>) {
  writeFileSync(join(f.registry, "removed.json"), JSON.stringify({ schemaVersion: 1, entries }));
}

/** The committer date is the oracle's input; git's author date deliberately differs. */
export function commitAt(f: NamesFixture, date: string, message: string) {
  git(f, "add", "packages/cli/registry");
  execFileSync("git", ["commit", "--quiet", "-m", message], {
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
      GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: date,
    },
  });
}

export const removal = {
  kind: "stack",
  removedAt: "2026-11-04",
  replacedBy: "sample",
  reason: "Merged <old> into sample & kept its guidance",
};

/** Lexical tag order differs from version order; HEAD no longer has the old entry or proof. */
export async function removedFixture(temporary: string) {
  const f = await fixture(temporary);
  const writeOld = (name: string, command: string) =>
    writeEntry({
      root: f.registry,
      kind: "stack",
      dir: "old-stack",
      frontmatter: minimal(
        "stack",
        "old-stack",
        `tags: [api]\nverify:\n  - { name: test, layer: test, run: "${command}" }\n  - { name: inspect, run: "bun run inspect" }`,
      ).replace("name: old-stack name", `name: ${name}`),
    });
  writeOld("Original name", "bun run old-test");
  writeEntry({
    root: f.registry,
    kind: "fragment",
    dir: "aaa-old-tool",
    frontmatter: minimal("fragment", "aaa-old-tool"),
  });
  commitAt(f, "2026-11-01T09:00:00Z", "fixture: first removed entries");
  git(f, "tag", "v0.9.0");
  writeOld("Last shipped name", "bun run test");
  const record = await proof(f.registry, {
    stack: "old-stack",
    date: "2026-11-02",
    fingerprint: await compositionFingerprint(f.registry, { stack: "old-stack" }),
  });
  writeLedger(f.registry, [f.record, record]);
  commitAt(f, "2026-11-02T09:00:00Z", "fixture: last shipped content and proof");
  git(f, "tag", "v0.10.0");
  rmSync(join(f.registry, "stacks/old-stack"), { recursive: true });
  rmSync(join(f.registry, "fragments/aaa-old-tool"), { recursive: true });
  writeLedger(f.registry, [f.record]);
  commitAt(f, "2026-11-04T09:00:00Z", "fixture: remove entries");
  git(f, "tag", "v0.11.0");
  return {
    ...f,
    historicalProof: {
      date: "2026-11-02",
      result: "pass",
      agent: "claude",
      preset: "sandbox",
      minutesToGreen: 2.5,
      fingerprint: record.fingerprint,
    },
  };
}

export function removedRows(replacement = true) {
  const { replacedBy, ...withoutReplacement } = removal;
  return {
    "old-stack": replacement ? removal : withoutReplacement,
    "aaa-old-tool": { kind: "fragment", removedAt: "2026-11-04", reason: "Retired tool" },
  };
}
