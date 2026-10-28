import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CliFailure } from "../src/errors";
import { CliErrorEnvelope, ListEntry } from "../src/schemas/cli";
import { ListParams, NewParams, VerifyParams } from "../src/schemas/tools";

describe("ListParams", () => {
  it("decodes with no kind", () => {
    const result = Schema.decodeUnknownSync(ListParams)({});
    expect(result.kind).toBeUndefined();
  });

  it("decodes with kind stack", () => {
    const result = Schema.decodeUnknownSync(ListParams)({ kind: "stack" });
    expect(result.kind).toBe("stack");
  });

  it("rejects an invalid kind", () => {
    expect(() => Schema.decodeUnknownSync(ListParams)({ kind: "bogus" })).toThrow();
  });
});

describe("NewParams", () => {
  it("decodes with required stack only", () => {
    const result = Schema.decodeUnknownSync(NewParams)({ stack: "astro-blog" });
    expect(result.stack).toBe("astro-blog");
    expect(result.dir).toBeUndefined();
    expect(result.sandbox).toBeUndefined();
  });

  it("decodes with all fields", () => {
    const result = Schema.decodeUnknownSync(NewParams)({
      stack: "astro-blog",
      dir: "./myproject",
      sandbox: false,
      with: ["effect-schema"],
      without: ["deploy"],
    });
    expect(result.stack).toBe("astro-blog");
    expect(result.dir).toBe("./myproject");
    expect(result.sandbox).toBe(false);
    expect(result.with).toEqual(["effect-schema"]);
    expect(result.without).toEqual(["deploy"]);
  });

  it("rejects a missing stack", () => {
    expect(() => Schema.decodeUnknownSync(NewParams)({})).toThrow();
  });
});

describe("VerifyParams", () => {
  it("decodes with no dir", () => {
    const result = Schema.decodeUnknownSync(VerifyParams)({});
    expect(result.dir).toBeUndefined();
  });

  it("decodes with dir", () => {
    const result = Schema.decodeUnknownSync(VerifyParams)({ dir: "/tmp/project" });
    expect(result.dir).toBe("/tmp/project");
  });
});

describe("ListEntry", () => {
  it("decodes a valid entry", () => {
    const result = Schema.decodeUnknownSync(ListEntry)({
      id: "x",
      kind: "stack",
      name: "X",
      description: "d",
      tags: [],
      origin: "bundled",
      trusted: true,
      shadows: [],
      lastRun: null,
    });
    expect(result.id).toBe("x");
  });

  it("decodes lastRun as an object", () => {
    const result = Schema.decodeUnknownSync(ListEntry)({
      id: "x",
      kind: "fragment",
      name: "X",
      description: "d",
      tags: [],
      origin: "bundled",
      trusted: false,
      shadows: [],
      lastRun: {
        date: "2026-01-01T00:00:00Z",
        result: "pass",
        agent: "claude",
        preset: "default",
        fingerprint: "abc123",
      },
    });
    expect(result.lastRun).not.toBeNull();
    expect(result.lastRun?.result).toBe("pass");
  });

  it("rejects lastRun as a string", () => {
    expect(() =>
      Schema.decodeUnknownSync(ListEntry)({
        id: "x",
        kind: "fragment",
        name: "X",
        description: "d",
        tags: [],
        origin: "bundled",
        trusted: false,
        shadows: [],
        lastRun: "2026-01-01T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("CliErrorEnvelope", () => {
  it("decodes with details", () => {
    const result = Schema.decodeUnknownSync(CliErrorEnvelope)({
      error: {
        tag: "NotFound",
        message: "Not found.",
        retryable: false,
        details: { suggestions: [], id: "bogus", kind: "stack" },
      },
    });
    expect(result.error.tag).toBe("NotFound");
    expect(result.error.details).toBeDefined();
  });

  it("decodes without details", () => {
    const result = Schema.decodeUnknownSync(CliErrorEnvelope)({
      error: { tag: "Usage", message: "Bad.", retryable: false },
    });
    expect(result.error.tag).toBe("Usage");
    expect(result.error.details).toBeUndefined();
  });
});

describe("CliFailure", () => {
  it("creates with tag and details", () => {
    const error = new CliFailure({
      message: "Not found.",
      tag: "NotFound",
      details: { id: "bogus" },
      exitCode: 2,
    });
    expect(error._tag).toBe("CliFailure");
    expect(error.tag).toBe("NotFound");
    expect(error.exitCode).toBe(2);
  });

  it("encodes to JSON with _tag", () => {
    const error = new CliFailure({
      message: "Not found.",
      tag: "NotFound",
      details: {},
      exitCode: 2,
    });
    const encoded = Schema.encodeSync(CliFailure)(error);
    expect(encoded._tag).toBe("CliFailure");
    expect(encoded.tag).toBe("NotFound");
  });
});
