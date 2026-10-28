import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { EchoTooLong } from "../src/errors";
import { echoHandler, pingHandler } from "../src/handlers";
import { ECHO_TOO_LONG_MESSAGE, MAX_ECHO_LENGTH } from "../src/toolkit";

describe("pingHandler", () => {
  it("returns { alive: true }", async () => {
    const result = await Effect.runPromise(pingHandler());
    expect(result).toEqual({ alive: true });
  });
});

describe("echoHandler", () => {
  it("returns the text and its length", async () => {
    const result = await Effect.runPromise(echoHandler({ text: "hello" }));
    expect(result).toEqual({ text: "hello", length: 5 });
  });

  it("handles an empty string", async () => {
    const result = await Effect.runPromise(echoHandler({ text: "" }));
    expect(result).toEqual({ text: "", length: 0 });
  });

  it("handles a string at the maximum length", async () => {
    const text = "a".repeat(MAX_ECHO_LENGTH);
    const result = await Effect.runPromise(echoHandler({ text }));
    expect(result).toEqual({ text, length: MAX_ECHO_LENGTH });
  });

  it("fails with EchoTooLong when the input exceeds the maximum", async () => {
    const text = "a".repeat(MAX_ECHO_LENGTH + 1);
    const error = await Effect.runPromise(Effect.flip(echoHandler({ text })));
    expect(error).toBeInstanceOf(EchoTooLong);
    expect(error._tag).toBe("EchoTooLong");
    expect(error.message).toBe(ECHO_TOO_LONG_MESSAGE);
  });
});
