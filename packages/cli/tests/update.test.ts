import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { afterEach, expect, test, vi } from "vitest";
import { compareVersions, Version } from "../src/core/update/version";
import { UpdateResult } from "../src/schemas/update";
import { VerifyResult } from "../src/schemas/verify";
import { VERSION } from "../src/version";
import { alive, runCli, terminal } from "./helpers/cli";
import { composeRegistry } from "./helpers/registry";
import {
  available,
  COMMAND,
  failure,
  fixture,
  NEWER,
  PROCESS_TIMEOUT,
  program,
  REGISTRY,
  registry,
  SHORT,
  space,
  success,
} from "./helpers/update";
import { freePort, splitEvents, writeProject, writeServerScripts } from "./helpers/verify";

afterEach(() => space.release());

test("equal versions need one request and no npm detection [4.4d#1]", async () => {
  const f = fixture();
  const http = registry({ body: { version: VERSION, extra: "npm metadata" } });
  expect(success(await runCli(["update", "--json"], { ...f.options, http: http.http }))).toEqual({
    status: "up-to-date",
    current: VERSION,
    latest: VERSION,
  });
  expect(f.calls()).toEqual([]);
  expect(http.requests).toEqual([{ url: REGISTRY, method: "GET", accept: "application/json" }]);
});

test.each([
  ["0.3.0", "0.2.0"],
  ["0.2.0", "0.2.0-rc.1"],
])("running %s is ahead of published %s without npm [4.4d#2]", async (current, latest) => {
  const f = fixture();
  const http = registry({ body: { version: latest } });
  expect(
    success(
      await runCli(["update", "--json"], {
        ...f.options,
        http: http.http,
        program: program({ current }),
      }),
    ),
  ).toEqual({ status: "ahead", current, latest });
  expect(f.calls()).toEqual([]);
});

test("a person updates a global npm install to the exact reported version [4.4d#3]", async () => {
  const f = fixture();
  expect(
    success(
      await runCli(["update", "--json"], {
        ...f.options,
        http: registry().http,
      }),
    ),
  ).toEqual({ status: "updated", current: VERSION, latest: NEWER, install: "npm-global" });
  expect(f.calls().map((call) => call.argv)).toEqual([
    ["prefix", "-g"],
    ["install", "-g", `@steamfield/stacks@${NEWER}`],
  ]);
});

test("agents may check but cannot install in either text or JSON [4.4d#4]", async () => {
  for (const json of [false, true]) {
    const f = fixture();
    const options = { ...f.options, env: { ...f.options.env, CODEX_THREAD_ID: "thread" } };
    const result = await runCli(["update", ...(json ? ["--json"] : [])], {
      ...options,
      http: registry().http,
    });
    if (json)
      expect(failure(result, 6)).toMatchObject({
        tag: "PermissionDenied",
        details: { reason: "agent" },
        next: expect.stringMatching(/ask the user/),
      });
    else {
      expect(result.status).toBe(6);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Permission denied.");
      expect(result.stderr.trim().split("\n").at(-1)).toContain("Next:");
    }
    expect(f.calls().map((call) => call.argv)).toEqual([["prefix", "-g"]]);
    expect(
      success(
        await runCli(["update", "--check", "--json"], {
          ...options,
          http: registry().http,
        }),
      ),
    ).toEqual(available("npm-global"));
    expect(f.calls().every((call) => call.argv[0] === "prefix")).toBe(true);
  }
});

test("a person piping output still installs [4.4d#5]", async () => {
  const f = fixture();
  const result = await runCli(["update"], { ...f.options, http: registry().http });
  expect(result).toEqual({
    status: 0,
    stdout: `Updated stacks ${VERSION} -> ${NEWER}.\n`,
    stderr: "",
  });
  expect(f.calls().at(-1)?.argv).toEqual(["install", "-g", `@steamfield/stacks@${NEWER}`]);
});

test("a person's check detects npm but never installs [4.4d#6]", async () => {
  const f = fixture();
  expect(
    success(
      await runCli(["update", "--check", "--json"], {
        ...f.options,
        http: registry().http,
      }),
    ),
  ).toEqual(available("npm-global"));
  expect(f.calls().map((call) => call.argv)).toEqual([["prefix", "-g"]]);
});

test.each([
  [
    "--offline",
    [
      ["update", "--check", "--offline"],
      ["update", "--offline"],
    ],
    {},
  ],
  ["STACKS_OFFLINE=1", [["update", "--check"], ["update"]], { STACKS_OFFLINE: "1" }],
])("offline mode (%s) refuses update without a request or npm", async (_, invocations, env) => {
  for (const args of invocations)
    for (const json of [false, true]) {
      const f = fixture();
      const http = registry();
      const result = await runCli([...args, ...(json ? ["--json"] : [])], {
        ...f.options,
        env: { ...f.options.env, ...env },
        http: http.http,
      });
      if (json)
        expect(failure(result, 2)).toMatchObject({
          tag: "BadInput",
          details: { flag: "offline" },
          next: expect.stringMatching(/without --offline/),
        });
      else {
        expect(result.status).toBe(2);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("Invalid input.");
        expect(result.stderr.trim().split("\n").at(-1)).toMatch(/^\s*Next: .*without --offline/);
      }
      expect(http.requests).toEqual([]);
      expect(f.calls()).toEqual([]);
    }
});

test("npx installations give an exact npx command without spawning npm [4.4d#7]", async () => {
  const f = fixture({ npx: true });
  expect(
    success(
      await runCli(["update", "--json"], {
        ...f.options,
        http: registry().http,
      }),
    ),
  ).toEqual(available("npx"));
  expect(f.calls()).toEqual([]);
});

test("unavailable or inconclusive npm detection degrades to other [4.4d#8]", {
  timeout: 30_000,
}, async () => {
  for (const mode of ["absent", "fail", "hang", "different", "missing", "spawn"]) {
    const f = fixture({ global: mode !== "different" });
    if (mode === "spawn") writeFileSync(f.npm, "#!/nonexistent-test-interpreter\n");
    const result = await runCli(["update", "--json"], {
      ...f.options,
      http: registry().http,
      host: {
        ...f.options.host,
        ...(mode === "missing" ? { packageRoot: join(f.home, "missing") } : {}),
      },
      env: {
        ...f.options.env,
        PREFIX_MODE: mode,
        ...(mode === "absent" ? { PATH: join(f.home, "empty") } : {}),
      },
      program: program({ detectionTimeout: PROCESS_TIMEOUT }),
    });
    expect(success(result)).toEqual(available("other"));
    expect(f.calls().every((call) => call.argv[0] === "prefix")).toBe(true);
    if (mode === "hang") {
      const pid = f.calls()[0]?.pid;
      expect(pid).toBeDefined();
      if (pid !== undefined) expect(alive(-pid)).toBe(false);
    }
  }
});

test.each([
  ["transport", "transport", undefined],
  ["503", { status: 503 }, 503],
  ["404", { status: 404 }, 404],
  ["302", { status: 302 }, 302],
  ["missing version", { body: {} }, 200],
  ["shell text", { body: { version: "1.0.0 && x" } }, 200],
  ["tag", { body: { version: "latest" } }, 200],
  ["final newline", { body: { version: "1.0.0\n" } }, 200],
  ["oversized component", { body: { version: "1000000000.0.0" } }, 200],
  ["oversized version", { body: { version: `1.0.0-${"a".repeat(59)}` } }, 200],
  ["non-string version", { body: { version: 100 } }, 200],
  ["invalid JSON", { raw: "{" }, 200],
  ["timeout", "timeout", undefined],
] satisfies ReadonlyArray<readonly [string, Parameters<typeof registry>[0], number | undefined]>)(
  "registry %s fails fast without spawning npm [4.4d#9]",
  async (_name, reply, status) => {
    const f = fixture();
    const http = registry(reply);
    const result = await runCli(["update", "--json"], {
      ...f.options,
      http: http.http,
      program: program({ registryTimeout: SHORT }),
    });
    expect(failure(result, 4)).toEqual({
      tag: "UpstreamUnavailable",
      message: "Upstream service is unavailable.",
      retryable: true,
      next: "wait a moment, then run the same command again.",
      details: { service: "npm-registry", ...(status === undefined ? {} : { status }) },
    });
    expect(http.requests).toHaveLength(1);
    expect(f.calls()).toEqual([]);
  },
);

test("a rejected registry response releases its unfinished request [4.4d#9]", async () => {
  const f = fixture();
  const requests: string[] = [];
  const body = new ReadableStream<Uint8Array>();
  let requestSignal: AbortSignal | undefined;
  const client = HttpClient.make((request, url, signal) => {
    requests.push(url.href);
    requestSignal = signal;
    return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(body, { status: 503 })));
  });
  try {
    const result = await runCli(["update", "--json"], {
      ...f.options,
      http: Layer.succeed(HttpClient.HttpClient, client),
      program: program({ registryTimeout: SHORT }),
    });
    expect(failure(result, 4)).toEqual({
      tag: "UpstreamUnavailable",
      message: "Upstream service is unavailable.",
      retryable: true,
      next: "wait a moment, then run the same command again.",
      details: { service: "npm-registry", status: 503 },
    });
    expect(requests).toEqual([REGISTRY]);
    expect(f.calls()).toEqual([]);
    expect(requestSignal?.aborted).toBe(true);
  } finally {
    await body.cancel();
  }
});

test("npm failures name the command while suppressing private output and logs [4.4d#10]", async () => {
  const f = fixture();
  const log = join(f.home, "update.jsonl");
  const options = {
    ...f.options,
    env: {
      ...f.options.env,
      INSTALL_MODE: "fail",
      LOG_LEVEL: "debug",
      STACKS_LOG_FILE: log,
    },
  };
  const json = await runCli(["update", "--json"], { ...options, http: registry().http });
  expect(failure(json, 6)).toMatchObject({
    tag: "UpdateFailed",
    retryable: false,
    details: { command: COMMAND, exitCode: 243 },
  });
  expect(failure(json, 6).details).toEqual({ command: COMMAND, exitCode: 243 });
  const text = await runCli(["update"], { ...options, http: registry().http });
  expect(text.status).toBe(6);
  expect(text.stdout).toBe("");
  expect(text.stderr).toBe(
    `Update failed.\n  npm exit: 243\n  Next: run ${COMMAND} yourself to see npm's output.\n`,
  );
  expect(json.stderr + text.stderr + text.stdout + readFileSync(log, "utf8")).not.toContain(
    "npm-private-output",
  );
});

test("npm that disappears after detection reports a safe install failure [4.4d#10]", async () => {
  const f = fixture();
  const result = await runCli(["update", "--json"], {
    ...f.options,
    http: registry().http,
    env: { ...f.options.env, PREFIX_MODE: "remove-npm" },
  });
  expect(failure(result, 6)).toMatchObject({
    tag: "UpdateFailed",
    retryable: false,
    details: { command: COMMAND },
  });
  expect(f.calls().map((call) => call.argv)).toEqual([["prefix", "-g"]]);
});

test("npm detection and installation use home and retain captured npm configuration [4.4d#11]", async () => {
  const f = fixture();
  writeFileSync(join(f.cwd, ".npmrc"), "prefix=/untrusted\nregistry=https://untrusted.invalid\n");
  expect(
    success(
      await runCli(["update", "--json"], {
        ...f.options,
        http: registry().http,
        env: { ...f.options.env, npm_config_registry: "https://mirror.invalid" },
      }),
    ).status,
  ).toBe("updated");
  expect(f.calls()).toHaveLength(2);
  for (const call of f.calls()) {
    expect(call.cwd).toBe(f.home);
    expect(call.config).toBe("https://mirror.invalid");
  }
});

test("each success status has exactly its documented fields and schema is available [4.4d#12]", async () => {
  const f = fixture();
  for (const [latest, check, expected] of [
    [VERSION, false, { status: "up-to-date", current: VERSION, latest: VERSION }],
    ["0.0.0", false, { status: "ahead", current: VERSION, latest: "0.0.0" }],
    [NEWER, true, available("npm-global")],
    [NEWER, false, { status: "updated", current: VERSION, latest: NEWER, install: "npm-global" }],
  ] as const) {
    expect(
      success(
        await runCli(["update", "--json", ...(check ? ["--check"] : [])], {
          ...f.options,
          http: registry({ body: { version: latest } }).http,
        }),
      ),
    ).toEqual(expected);
  }
  const schema = await runCli(["schema", "update", "--json"], { http: registry().http });
  expect(schema.status).toBe(0);
  expect(schema.stderr).toBe("");
  expect(JSON.parse(schema.stdout)).toMatchObject({ anyOf: expect.any(Array) });
  expect(() =>
    Schema.decodeUnknownSync(UpdateResult)(
      {
        status: "updated",
        current: VERSION,
        latest: NEWER,
      },
      { onExcessProperty: "error" },
    ),
  ).toThrow();
});

test("a malformed running version is a defect before any registry or npm operation", async () => {
  const f = fixture();
  const http = registry();
  const result = await runCli(["update", "--json"], {
    ...f.options,
    http: http.http,
    program: program({ current: "invalid-own-version" }),
  });
  expect(failure(result, 1)).toMatchObject({ tag: "Defect", retryable: false });
  expect(result.stderr).not.toContain("invalid-own-version");
  expect(http.requests).toEqual([]);
  expect(f.calls()).toEqual([]);
});

test("other commands and a local verify probe never call the npm registry [4.4d#13]", async () => {
  const f = fixture();
  const http = registry();
  for (const args of [["--version"], ["doctor", "--json"], ["list", "--json"]]) {
    const result = await runCli(args, {
      ...f.options,
      http: http.http,
      host: {
        ...f.options.host,
        registry: composeRegistry,
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).not.toBe("");
    expect(result.stderr).toBe("");
  }
  const port = await freePort();
  writeServerScripts(f.cwd);
  writeProject(
    f.cwd,
    [
      {
        name: "web",
        phase: "serve",
        run: `${process.execPath} server.cjs`,
        expect: { http: `http://127.0.0.1:${port}/`, within: "5s" },
      },
    ],
    { env: { PORT_WEB: String(port) } },
  );
  const result = await runCli(["verify", "--json"], { ...f.options, http: http.http });
  expect(result.status).toBe(0);
  expect(
    Schema.decodeUnknownSync(VerifyResult)(JSON.parse(result.stdout), {
      onExcessProperty: "error",
    }),
  ).toMatchObject({ outcome: "green" });
  expect(splitEvents(result.stderr).rest).toBe("");
  expect(http.requests.length).toBeGreaterThan(0);
  expect(http.requests.every((request) => request.url.startsWith("http://127.0.0.1:"))).toBe(true);
});

test("only human mode reports progress, before npm starts [4.4d#14]", async () => {
  const f = fixture();
  let progress = false;
  const human = await runCli(["update"], {
    ...f.options,
    http: registry().http,
    host: { ...f.options.host, ...terminal },
    stderr: async (text) => {
      if (text.includes("Installing")) {
        expect(f.calls().map((call) => call.argv)).toEqual([["prefix", "-g"]]);
        progress = true;
      }
    },
  });
  expect(progress).toBe(true);
  expect(human).toEqual({
    status: 0,
    stdout: `Updated stacks ${VERSION} -> ${NEWER}.\n`,
    stderr: `Installing @steamfield/stacks@${NEWER} with npm...\n`,
  });
  const json = await runCli(["update", "--json"], { ...f.options, http: registry().http });
  expect(success(json).status).toBe("updated");
  const agent = await runCli(["update"], { ...f.options, http: registry().http });
  expect(agent).toEqual({
    status: 0,
    stdout: `Updated stacks ${VERSION} -> ${NEWER}.\n`,
    stderr: "",
  });
});

test("help documents checking, JSON, registry access and exits [4.4d#15]", async () => {
  const http = registry();
  const result = await runCli(["update", "--help"], { http: http.http });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  for (const word of ["--check", "--json", "0", "4", "6", "130", "registry", "background", "agent"])
    expect(result.stdout).toContain(word);
  expect(http.requests).toEqual([]);
});

test("a version manager's symlinked prefix detects the same global package [4.4d#16]", async () => {
  const real = space.dir();
  const link = join(space.dir(), "node-24");
  symlinkSync(real, link);
  const f = fixture({ prefix: link });
  const throughLink = join(link, "lib/node_modules/@steamfield/stacks");
  expect(
    success(
      await runCli(["update", "--check", "--json"], {
        ...f.options,
        http: registry().http,
        host: { ...f.options.host, packageRoot: throughLink },
      }),
    ),
  ).toEqual(available("npm-global"));
  expect(f.calls().map((call) => call.argv)).toEqual([["prefix", "-g"]]);
});

test("a timed out install fails and its process group is gone [4.4d#17]", {
  timeout: 30_000,
}, async () => {
  const f = fixture();
  const result = await runCli(["update", "--json"], {
    ...f.options,
    http: registry().http,
    env: { ...f.options.env, INSTALL_MODE: "hang" },
    program: program({ installTimeout: PROCESS_TIMEOUT }),
  });
  expect(failure(result, 6)).toMatchObject({
    tag: "UpdateFailed",
    retryable: false,
    details: { command: COMMAND, timedOut: true },
  });
  const pid = f.calls().find((call) => call.argv[0] === "install")?.pid;
  expect(pid).toBeDefined();
  if (pid !== undefined) expect(alive(-pid)).toBe(false);
});

test("interrupting an install exits 130 and terminates npm [4.4d#18]", {
  timeout: 30_000,
}, async () => {
  const f = fixture();
  const controller = new AbortController();
  const running = runCli(["update", "--json"], {
    ...f.options,
    http: registry().http,
    env: { ...f.options.env, INSTALL_MODE: "hang" },
    signal: controller.signal,
  });
  let pid: number | undefined;
  try {
    await vi.waitFor(
      () => {
        pid = f.calls().find((call) => call.argv[0] === "install")?.pid;
        expect(pid).toBeDefined();
      },
      { timeout: 10_000 },
    );
  } finally {
    controller.abort();
  }
  const result = await running;
  expect(result.status).toBe(130);
  expect(result.stdout).toBe("");
  expect(result.stderr).not.toContain("npm-private-output");
  if (pid !== undefined) expect(alive(-pid)).toBe(false);
});

it.prop(
  "version comparison is reflexive and antisymmetric [4.4d#19]",
  [Version, Version],
  ([a, b]) => {
    expect(compareVersions(a, a)).toBe(0);
    expect(Math.sign(compareVersions(a, b)) + Math.sign(compareVersions(b, a))).toBe(0);
  },
);

test("numeric prereleases, releases and numeric minor versions sort as semver [4.4d#19]", () => {
  const ordered = ["0.2.0-rc.9", "0.2.0-rc.10", "0.2.0", "0.10.0"];
  for (let index = 1; index < ordered.length; index++) {
    const a = ordered[index - 1];
    const b = ordered[index];
    if (a !== undefined && b !== undefined) expect(compareVersions(a, b)).toBeLessThan(0);
  }
  expect(compareVersions("1.0.0-1", "1.0.0-a")).toBeLessThan(0);
  expect(compareVersions("1.0.0-a", "1.0.0-a.1")).toBeLessThan(0);
  expect(compareVersions("1.0.0-A", "1.0.0-a")).toBeLessThan(0);
  expect(compareVersions("1.0.0-9007199254740992", "1.0.0-9007199254740993")).toBeLessThan(0);
  expect(compareVersions("999999998.0.0", "999999999.0.0")).toBeLessThan(0);
});
