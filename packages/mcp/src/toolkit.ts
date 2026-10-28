import { Tool, Toolkit } from "effect/ai";
import { EchoTooLong } from "./errors";
import { EchoParams, EchoSuccess } from "./schemas/echo";
import { PingSuccess } from "./schemas/ping";

export const MAX_ECHO_LENGTH = 10000;

export const ECHO_TOO_LONG_MESSAGE = `echo input exceeds maximum length of ${MAX_ECHO_LENGTH} characters`;

export const ping = Tool.make("ping", {
  description:
    "Returns { alive: true } to confirm the server is reachable. Reports no failure of its own.",
  success: PingSuccess,
});

export const echo = Tool.make("echo", {
  description:
    "Echoes the provided text back alongside its character length. Fails with EchoTooLong when the input exceeds the maximum allowed length.",
  parameters: EchoParams,
  success: EchoSuccess,
  failure: EchoTooLong,
  failureMode: "return",
});

export const toolkit = Toolkit.make(ping, echo);
