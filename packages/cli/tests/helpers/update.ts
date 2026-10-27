import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Duration, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http";
import { expect } from "vitest";
import { renderUpdate } from "../../src/core/update/report";
import { update } from "../../src/core/update/update";
import { ErrorEnvelope } from "../../src/errors";
import { UpdateResult } from "../../src/schemas/update";
import { Output } from "../../src/services/output";
import { VERSION } from "../../src/version";
import { quiet, type runCli } from "./cli";
import { workspace } from "./verify";

export const space = workspace();
export const NEWER = "9.8.7";
export const COMMAND = `npm install -g @steamfield/stacks@${NEWER}`;
export const REGISTRY = "https://registry.npmjs.org/@steamfield%2fstacks/latest";
const Call = Schema.Struct({
  argv: Schema.Array(Schema.String),
  cwd: Schema.String,
  pid: Schema.Number,
  config: Schema.optionalKey(Schema.String),
});
export type Call = typeof Call.Type;
export type Reply = { status?: number; body?: unknown; raw?: string } | "transport" | "timeout";

export function registry(reply: Reply = { body: { version: NEWER } }) {
  const requests: { url: string; method: string; accept: string | undefined }[] = [];
  const client = HttpClient.make((request, url) => {
    requests.push({ url: url.href, method: request.method, accept: request.headers.accept });
    if (reply === "timeout") return Effect.never;
    if (reply === "transport")
      return Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, description: "scripted failure" }),
        }),
      );
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(reply.raw ?? JSON.stringify(reply.body ?? { version: NEWER }), {
          status: reply.status ?? 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
  });
  return { requests, http: Layer.succeed(HttpClient.HttpClient, client) };
}

export function fixture(options: { global?: boolean; npx?: boolean; prefix?: string } = {}) {
  const home = realpathSync(space.dir());
  const cwd = join(home, "project");
  const bin = join(home, "bin");
  const packageRoot = join(home, options.npx ? "cache/_npx/hash/package" : "package");
  const prefix = options.prefix ?? join(home, "prefix");
  const callsFile = join(home, "npm.calls");
  for (const path of [cwd, bin, packageRoot]) mkdirSync(path, { recursive: true });
  const installed = join(prefix, "lib/node_modules/@steamfield/stacks");
  if (options.global !== false) {
    mkdirSync(dirname(installed), { recursive: true });
    symlinkSync(packageRoot, installed);
  } else mkdirSync(installed, { recursive: true });
  const npm = join(bin, "npm");
  writeFileSync(
    npm,
    `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const mode = args[0] === "prefix" ? process.env.PREFIX_MODE : process.env.INSTALL_MODE;
fs.appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify({argv: args, cwd: process.cwd(), pid: process.pid, ...(process.env.npm_config_registry ? {config: process.env.npm_config_registry} : {})}) + "\\n");
if (mode === "hang") setInterval(() => {}, 1000);
else if (args[0] === "prefix") {
  if (mode === "fail") process.exit(1);
  if (mode === "remove-npm") fs.unlinkSync(process.argv[1]);
  process.stdout.write(${JSON.stringify(prefix)} + "\\n");
} else {
  process.stdout.write("npm-private-output\\n");
  process.stderr.write("npm-private-output\\n");
  process.exit(mode === "fail" ? 243 : 0);
}
`,
    { mode: 0o755 },
  );
  const calls = (): Call[] =>
    existsSync(callsFile)
      ? readFileSync(callsFile, "utf8")
          .trim()
          .split("\n")
          .map((line) =>
            Schema.decodeUnknownSync(Call)(JSON.parse(line), { onExcessProperty: "error" }),
          )
      : [];
  return {
    home,
    cwd,
    bin,
    npm,
    prefix,
    packageRoot,
    calls,
    options: {
      home,
      env: { ...quiet, PATH: bin },
      host: { cwd, packageRoot },
    },
  };
}

export const program = (options: Partial<Parameters<typeof update>[0]> = {}) =>
  Effect.gen(function* () {
    const result = yield* update({ check: false, ...options });
    yield* (yield* Output).result(Schema.encodeSync(UpdateResult)(result), renderUpdate(result));
  });

export function success(result: Awaited<ReturnType<typeof runCli>>): UpdateResult {
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  return Schema.decodeUnknownSync(UpdateResult)(JSON.parse(result.stdout), {
    onExcessProperty: "error",
  });
}
export function failure(result: Awaited<ReturnType<typeof runCli>>, status: number) {
  expect(result.status).toBe(status);
  expect(result.stdout).toBe("");
  const lines = result.stderr.trim().split("\n");
  expect(lines).toHaveLength(1);
  return Schema.decodeUnknownSync(ErrorEnvelope)(JSON.parse(lines.at(-1) ?? ""), {
    onExcessProperty: "error",
  }).error;
}
export const available = (install: "npm-global" | "npx" | "other") => ({
  status: "available",
  current: VERSION,
  latest: NEWER,
  install,
  command: install === "npx" ? `npx -y @steamfield/stacks@${NEWER}` : COMMAND,
});
export const SHORT = Duration.millis(250);
export const PROCESS_TIMEOUT = Duration.seconds(2);
