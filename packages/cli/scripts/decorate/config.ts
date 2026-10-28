import { detectAgent } from "../../src/config";

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";
/** Indicative Sonnet rates only; actual cost always comes from OpenRouter usage. */
export const estimateUsd = (tokens: number) => (tokens * 3 + 600 * 15) / 1_000_000;

/** Maintainer secrets and agent markers stay at this script's environment boundary. */
export function readConfig() {
  const base = new URL(process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1");
  if (
    base.href !== "https://openrouter.ai/api/v1" &&
    !(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))
  )
    throw new Error(
      "OPENROUTER_BASE_URL must be the OpenRouter endpoint or a loopback test server.",
    );
  return {
    base: base.href.replace(/\/$/, ""),
    key: process.env.OPENROUTER_API_KEY,
    agent: detectAgent(process.env),
    stdinIsTTY: process.stdin.isTTY === true,
  };
}
export type DecorateConfig = ReturnType<typeof readConfig>;
