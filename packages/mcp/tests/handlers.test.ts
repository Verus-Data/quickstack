import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CliFailure } from "../src/errors";
import { listHandler, newHandler, verifyHandler } from "../src/handlers";
import { CliRunner } from "../src/run";
import { CliErrorEnvelope, ListResult, NewResult, VerifyResult } from "../src/schemas/cli";

function makeFakeCli(js: string): string {
  const dir = resolve(tmpdir(), `qs-mcp-fake-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, "fake-cli.mjs");
  writeFileSync(path, js, { mode: 0o755 });
  return path;
}

function makeLayer(scriptPath: string) {
  return CliRunner.test(scriptPath).pipe(Layer.provide(NodeServices.layer));
}

const LIST_JSON =
  '{"entries":[{"id":"astro-blog","kind":"stack","name":"Astro blog","description":"d","tags":["typescript"],"origin":"bundled","trusted":true,"shadows":[],"lastRun":null}],"rejected":[]}';

const NOT_FOUND_JSON =
  '{"error":{"tag":"NotFound","message":"Not found.","retryable":false,"details":{"suggestions":["astro-blog"],"id":"bogus-stack","kind":"stack"}}}';

const NEW_JSON =
  '{"project":"/tmp/test","fingerprint":"sha256:abc","stack":"astro-blog","fragments":["effect-schema"],"preset":"default","agents":["claude"],"written":["README.md",".claude/rules/effect.md"],"brief":".stacks/BRIEF.md","briefWords":100,"fixedWords":50,"missingTools":[],"untrusted":[],"warnings":[],"git":"fresh","stateRecord":true,"handoff":{"kind":"print","reason":"no-launch","agent":"none","untrusted":[],"prompt":"go"}}';

const VERIFY_RED_JSON =
  '{"outcome":"red","scope":"full","steps":[{"name":"test","phase":"check","layer":"test","command":"bun run test","status":"failed","exitCode":1,"durationMs":100}],"totals":{"passed":0,"failed":1,"skipped":0},"durationMs":200,"secondsSinceCreated":5,"tamperCheck":"full","firstGreen":false,"stateRecord":true}';

const VERIFY_GREEN_JSON =
  '{"outcome":"green","scope":"full","steps":[{"name":"test","phase":"check","layer":"test","command":"bun run test","status":"passed","exitCode":0,"durationMs":100}],"totals":{"passed":1,"failed":0,"skipped":0},"durationMs":200,"secondsSinceCreated":5,"tamperCheck":"full","firstGreen":true,"stateRecord":true}';

const FAKE_LIST = `process.stdout.write(${JSON.stringify(LIST_JSON)});\n`;

const FAKE_NOT_FOUND = `process.stderr.write(${JSON.stringify(`${NOT_FOUND_JSON}\n`)});\nprocess.exit(2);\n`;

const FAKE_NEW_SUCCESS = `process.stdout.write(${JSON.stringify(NEW_JSON)});\n`;

const FAKE_VERIFY_RED = `process.stdout.write(${JSON.stringify(VERIFY_RED_JSON)});\n`;

const FAKE_VERIFY_GREEN = `process.stdout.write(${JSON.stringify(VERIFY_GREEN_JSON)});\n`;

describe("listHandler", () => {
  it("decodes parameters and maps success", async () => {
    const script = makeFakeCli(FAKE_LIST);
    const result = await Effect.runPromise(listHandler({}).pipe(Effect.provide(makeLayer(script))));
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.id).toBe("astro-blog");
    expect(result.entries[0]?.kind).toBe("stack");
  });

  it("filters by kind", async () => {
    const script = makeFakeCli(FAKE_LIST);
    const result = await Effect.runPromise(
      listHandler({ kind: "fragment" }).pipe(Effect.provide(makeLayer(script))),
    );
    expect(result.entries).toHaveLength(0);
  });

  it("fails with CliFailure when CLI exits non-zero", async () => {
    const script = makeFakeCli(FAKE_NOT_FOUND);
    const error = await Effect.runPromise(
      Effect.flip(listHandler({}).pipe(Effect.provide(makeLayer(script)))),
    );
    expect(error).toBeInstanceOf(CliFailure);
    expect(error.tag).toBe("NotFound");
    expect(error.message).toBe("Not found.");
    expect(error.exitCode).toBe(2);
    const details = error.details as {
      suggestions: string[];
      id: string;
      kind: string;
    };
    expect(details.suggestions).toEqual(["astro-blog"]);
    expect(details.id).toBe("bogus-stack");
  });
});

describe("newHandler", () => {
  it("maps success from the CLI", async () => {
    const script = makeFakeCli(FAKE_NEW_SUCCESS);
    const result = await Effect.runPromise(
      newHandler({ stack: "astro-blog", sandbox: true }).pipe(Effect.provide(makeLayer(script))),
    );
    expect(result.project).toBe("/tmp/test");
    expect(result.stack).toBe("astro-blog");
    expect(result.briefWords).toBe(100);
    expect(result.handoff.kind).toBe("print");
  });

  it("fails with CliFailure carrying NotFound details", async () => {
    const script = makeFakeCli(FAKE_NOT_FOUND);
    const error = await Effect.runPromise(
      Effect.flip(newHandler({ stack: "bogus-stack" }).pipe(Effect.provide(makeLayer(script)))),
    );
    expect(error).toBeInstanceOf(CliFailure);
    expect(error.tag).toBe("NotFound");
    const details = error.details as { id: string; kind: string };
    expect(details.id).toBe("bogus-stack");
    expect(details.kind).toBe("stack");
  });
});

describe("verifyHandler", () => {
  it("returns normally for a red outcome", async () => {
    const script = makeFakeCli(FAKE_VERIFY_RED);
    const result = await Effect.runPromise(
      verifyHandler({}).pipe(Effect.provide(makeLayer(script))),
    );
    expect(result.outcome).toBe("red");
    expect(result.totals.failed).toBe(1);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.status).toBe("failed");
  });

  it("returns normally for a green outcome", async () => {
    const script = makeFakeCli(FAKE_VERIFY_GREEN);
    const result = await Effect.runPromise(
      verifyHandler({}).pipe(Effect.provide(makeLayer(script))),
    );
    expect(result.outcome).toBe("green");
    expect(result.totals.passed).toBe(1);
  });
});

describe("schemas", () => {
  it("decodes a ListResult", () => {
    const decoded = Schema.decodeUnknownSync(ListResult)(JSON.parse(LIST_JSON));
    expect(decoded.entries).toHaveLength(1);
  });

  it("decodes a NewResult", () => {
    const decoded = Schema.decodeUnknownSync(NewResult)(JSON.parse(NEW_JSON));
    expect(decoded.project).toBe("/tmp/test");
  });

  it("decodes a VerifyResult", () => {
    const decoded = Schema.decodeUnknownSync(VerifyResult)(JSON.parse(VERIFY_RED_JSON));
    expect(decoded.outcome).toBe("red");
  });

  it("decodes a CliErrorEnvelope", () => {
    const decoded = Schema.decodeUnknownSync(CliErrorEnvelope)(JSON.parse(NOT_FOUND_JSON));
    expect(decoded.error.tag).toBe("NotFound");
  });

  it("rejects a wrong ListEntry kind", () => {
    expect(() =>
      Schema.decodeUnknownSync(ListResult)({
        entries: [
          {
            id: "x",
            kind: "bogus",
            name: "X",
            description: "d",
            tags: [],
            origin: "bundled",
            trusted: true,
            shadows: [],
            lastRun: null,
          },
        ],
        rejected: [],
      }),
    ).toThrow();
  });
});
