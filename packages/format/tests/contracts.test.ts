import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { expect, test } from "vitest";
import {
  APP_TAG,
  Category,
  DEFAULT_STEP_TIMEOUT,
  EntryRef,
  Expect,
  FailureKind,
  Harness,
  Kind,
  Manifest,
  ManifestStep,
  Phase,
  ProjectId,
  type ResolvedStep,
  RunRecord,
  RunStep,
  StepLayer,
  TamperCheck,
  withStepDefaults,
} from "../src/index";

test("the shared entry exports retain their existing literals and defaults [4.0a#1]", () => {
  expect(Harness.literals).toEqual([
    "claude",
    "codex",
    "opencode",
    "cursor",
    "copilot",
    "codex-app",
  ]);
  expect(Kind.literals).toEqual(["stack", "fragment"]);
  expect(Phase.literals).toEqual(["setup", "check", "serve", "teardown"]);
  expect(StepLayer.literals).toEqual([
    "install",
    "lint",
    "typecheck",
    "test",
    "build",
    "serve",
    "docs",
    "check",
  ]);
  expect(Category.literals).toContain("app");
  expect(APP_TAG).toBe("app");
  expect(DEFAULT_STEP_TIMEOUT).toBe("10m");
  const step: ResolvedStep = withStepDefaults({ name: "test", run: "npm test" });
  expect(step).toEqual({ name: "test", run: "npm test", phase: "check", tags: [], timeout: "10m" });
  expect(Schema.decodeUnknownSync(Expect)({ http: "http://localhost/", within: "500ms" })).toEqual({
    http: "http://localhost/",
    within: "500ms",
  });
});

test("manifest schemas keep forward origins, app steps and optional fields [4.0a#1]", () => {
  const fixture = JSON.parse(
    readFileSync(join(import.meta.dirname, "fixtures/manifest.json"), "utf8"),
  );
  const decode = Schema.decodeUnknownSync(Manifest, { onExcessProperty: "error" });
  expect(decode(fixture)).toEqual(fixture);
  const ref = { id: "future", origin: "future-origin", trusted: false };
  expect(Schema.decodeUnknownSync(EntryRef)(ref)).toEqual(ref);
  const step = {
    name: "test",
    run: "npm test",
    tags: ["app"],
    owner: "future",
    skipByDefault: false,
  };
  expect(Schema.decodeUnknownSync(ManifestStep)(step)).toEqual(step);
  const later = {
    ...fixture,
    mode: "add",
    stack: null,
    fragments: [ref],
    verify: [step],
    handoff: { kind: "print", at: fixture.createdAt },
    fingerprint: "sha256:abc",
  };
  expect(decode(later)).toEqual(later);
  expect(() => decode({ ...fixture, verify: [step, step] })).toThrow(/unique/);
  expect(() => decode({ ...fixture, extra: true })).toThrow(/extra/);
  expect(() => decode({ ...fixture, schemaVersion: 2 })).toThrow();
  for (const id of ["../elsewhere", "a/b", "", "a\u0000b"]) {
    expect(() => Schema.decodeUnknownSync(ProjectId)(id)).toThrow();
  }
});

test("run records retain all outcomes and optional app stages without a version bump [4.0a#1]", () => {
  expect(FailureKind.literals).toEqual(["step", "env", "timeout", "interrupted"]);
  expect(TamperCheck.literals).toEqual(["full", "manifest-only"]);
  const step = {
    name: "test",
    phase: "check",
    status: "failed",
    failureKind: "step",
    exitCode: 1,
    durationMs: 10,
  };
  expect(Schema.decodeUnknownSync(RunStep)(step)).toEqual(step);
  const record = {
    schemaVersion: 1,
    at: "2026-10-27T00:00:00.000Z",
    cli: "0.3.1",
    agent: "other",
    outcome: "failed",
    scope: "full",
    tamperCheck: "full",
    acceptedChanges: false,
    durationMs: 10,
    secondsSinceCreated: 1,
    steps: [step],
  };
  const decode = Schema.decodeUnknownSync(RunRecord, { onExcessProperty: "error" });
  expect(decode(record)).toEqual(record);
  for (const outcome of ["green", "partial", "failed", "changed", "interrupted"]) {
    for (const app of [null, outcome]) {
      const staged = { ...record, outcome, stages: { base: outcome, app } };
      expect(decode(staged)).toEqual(staged);
    }
  }
  expect(() => decode({ ...record, schemaVersion: 2 })).toThrow();
  expect(() => decode({ ...record, agent: "copilot" })).toThrow();
});
