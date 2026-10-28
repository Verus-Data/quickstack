import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { EchoTooLong } from "../src/errors";
import { EchoParams, EchoSuccess } from "../src/schemas/echo";
import { PingSuccess } from "../src/schemas/ping";

describe("PingSuccess", () => {
  it("decodes a valid object", () => {
    const result = Schema.decodeUnknownSync(PingSuccess)({ alive: true });
    expect(result).toEqual({ alive: true });
  });

  it("rejects a missing field", () => {
    expect(() => Schema.decodeUnknownSync(PingSuccess)({})).toThrow();
  });

  it("rejects a wrong type", () => {
    expect(() => Schema.decodeUnknownSync(PingSuccess)({ alive: "yes" })).toThrow();
  });
});

describe("EchoParams", () => {
  it("decodes a valid object", () => {
    const result = Schema.decodeUnknownSync(EchoParams)({ text: "hello" });
    expect(result).toEqual({ text: "hello" });
  });

  it("rejects a missing text field", () => {
    expect(() => Schema.decodeUnknownSync(EchoParams)({})).toThrow();
  });

  it("rejects a wrong type for text", () => {
    expect(() => Schema.decodeUnknownSync(EchoParams)({ text: 42 })).toThrow();
  });
});

describe("EchoSuccess", () => {
  it("round-trips a valid value", () => {
    const value = { text: "hello", length: 5 };
    const encoded = Schema.encodeSync(EchoSuccess)(value);
    const decoded = Schema.decodeUnknownSync(EchoSuccess)(encoded);
    expect(decoded).toEqual(value);
  });

  it("rejects a non-integer length", () => {
    expect(() => Schema.decodeUnknownSync(EchoSuccess)({ text: "hi", length: 2.5 })).toThrow();
  });
});

describe("EchoTooLong", () => {
  it("creates an error with a _tag and message", () => {
    const error = new EchoTooLong({ message: "too long" });
    expect(error._tag).toBe("EchoTooLong");
    expect(error.message).toBe("too long");
  });

  it("encodes to JSON with _tag and message", () => {
    const error = new EchoTooLong({ message: "too long" });
    const encoded = Schema.encodeSync(EchoTooLong)(error);
    expect(encoded._tag).toBe("EchoTooLong");
    expect(encoded.message).toBe("too long");
  });
});
