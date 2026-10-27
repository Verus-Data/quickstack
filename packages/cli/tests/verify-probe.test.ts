import { existsSync } from "node:fs";
import type { Server } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { alive } from "./helpers/cli";
import {
  answers,
  decodeResult,
  envelope,
  freePort,
  holdPort,
  readPid,
  stepNamed,
  verify,
  workspace,
  writeProject,
  writeServerScripts,
} from "./helpers/verify";

const space = workspace();
const servers: Server[] = [];
afterEach(async () => {
  space.release();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

const has = (root: string, file: string) => existsSync(join(root, file));
/** `${name}` as a manifest writes it, for `expect.http` expansion. */
const ref = (name: string) => `$${"{"}${name}}`;
const EARLY_EXIT =
  "serve command exited before its probe passed; serve commands must stay in the foreground";
const leftover = (port: number) =>
  `port ${port} still answering after the serve step stopped; a process left the step's process group`;

/** A project whose serve step runs `node <script>` against `http://<host>:${PORT_WEB}/`. */
async function serveProject(
  script: string,
  options: { host?: string; within?: string; delayMs?: number; timeout?: string } = {},
) {
  const root = space.dir();
  const port = await freePort();
  writeServerScripts(root);
  writeProject(
    root,
    [
      {
        name: "web",
        phase: "serve",
        run: `node ${script}`,
        expect: {
          http: `http://${options.host ?? "localhost"}:${ref("PORT_WEB")}/`,
          within: options.within ?? "20s",
        },
        ...(options.timeout ? { timeout: options.timeout } : {}),
      },
      { name: "clean", phase: "teardown", run: "touch torn" },
    ],
    { env: { PORT_WEB: String(port), LISTEN_DELAY_MS: String(options.delayMs ?? 0) } },
  );
  return { root, port };
}

describe("serve probes", () => {
  test("a foreground HTTP server passes its probe and its port is closed afterwards [1.3a#7]", {
    timeout: 30_000,
  }, async () => {
    const { root, port } = await serveProject("server.cjs");
    const result = await verify(["--json"], { cwd: root });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const decoded = decodeResult(result.stdout);
    expect(decoded.outcome).toBe("green");
    expect(stepNamed(decoded, "web")).toMatchObject({
      phase: "serve",
      status: "passed",
      command: "node server.cjs",
    });
    expect(await answers(port)).toBe(false);
    expect(has(root, "torn")).toBe(true);
  });

  test("the probe URL takes the caller's value over the manifest's env default", {
    timeout: 30_000,
  }, async () => {
    const { root } = await serveProject("server.cjs", { host: "127.0.0.1" });
    const port = await freePort();
    const result = await verify(["--json"], { cwd: root, env: { PORT_WEB: String(port) } });
    expect(result.status).toBe(0);
    expect(stepNamed(decodeResult(result.stdout), "web").status).toBe("passed");
    expect(await answers(port)).toBe(false);
  });

  test("a serve step's timeout is ignored; within governs", { timeout: 30_000 }, async () => {
    const { root } = await serveProject("server.cjs", { delayMs: 1500, timeout: "500ms" });
    const result = await verify(["--json"], { cwd: root });
    expect(result.status).toBe(0);
    expect(stepNamed(decodeResult(result.stdout), "web").status).toBe("passed");
  });

  test("a serve command that exits 1 early fails step with its tail [1.3a#8]", {
    timeout: 30_000,
  }, async () => {
    const root = space.dir();
    const port = await freePort();
    writeProject(root, [
      {
        name: "web",
        phase: "serve",
        run: "echo boom-early; exit 1",
        expect: { http: `http://127.0.0.1:${port}/`, within: "20s" },
      },
    ]);
    const started = Date.now();
    const result = await verify(["--json"], { cwd: root });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(result.status).toBe(5);
    const web = stepNamed(decodeResult(result.stdout), "web");
    expect(web).toMatchObject({ status: "failed", failureKind: "step", exitCode: 1 });
    expect(web.outputTail).toContain("boom-early");
    expect(envelope(result.stderr)).toMatchObject({
      error: {
        tag: "VerifyFailed",
        details: { failed: [{ name: "web", failureKind: "step", exitCode: 1 }] },
      },
    });
  });

  test("a probe on a busy port fails env without starting the command [1.3a#8]", async () => {
    const root = space.dir();
    const port = await freePort();
    servers.push(await holdPort(port));
    writeProject(root, [
      {
        name: "web",
        phase: "serve",
        run: "touch started; exec sleep 30",
        expect: { http: `http://127.0.0.1:${port}/`, within: "20s" },
      },
      { name: "clean", phase: "teardown", run: "touch torn" },
    ]);
    const result = await verify(["--json"], { cwd: root });
    expect(result.status).toBe(5);
    const web = stepNamed(decodeResult(result.stdout), "web");
    expect(web).toMatchObject({
      status: "failed",
      failureKind: "env",
      reason: `port ${port} already in use`,
    });
    expect(web.exitCode).toBeUndefined();
    expect(has(root, "started")).toBe(false);
    expect(has(root, "torn")).toBe(true);
    expect(envelope(result.stderr)).toEqual({
      error: {
        tag: "VerifyFailed",
        message: "Verify failed.",
        retryable: false,
        details: { failed: [{ name: "web", failureKind: "env" }] },
      },
    });
  });

  test("a serve command that backgrounds its server and exits 0 fails with the early-exit reason [1.3a#9]", {
    timeout: 30_000,
  }, async () => {
    // The detached server listens 1.5 s later, so the command's exit 0 comes before any probe can pass.
    const { root } = await serveProject("background.cjs", { delayMs: 1500 });
    const pidFile = space.trackPid(join(root, "server.pid"));
    const result = await verify(["--json"], { cwd: root });
    expect(result.status).toBe(5);
    expect(stepNamed(decodeResult(result.stdout), "web")).toMatchObject({
      status: "failed",
      failureKind: "step",
      reason: EARLY_EXIT,
    });
    expect(readPid(pidFile)).toBeDefined();
  });

  test("a server that escaped the step's process group fails with the still-answering reason after its probe passed [1.3a#9]", {
    timeout: 30_000,
  }, async () => {
    const { root, port } = await serveProject("foreground.cjs");
    const pidFile = space.trackPid(join(root, "server.pid"));
    const started = Date.now();
    const result = await verify(["--json"], { cwd: root });
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(result.status).toBe(5);
    expect(stepNamed(decodeResult(result.stdout), "web")).toMatchObject({
      status: "failed",
      failureKind: "step",
      reason: leftover(port),
    });
    expect(has(root, "torn")).toBe(true);
    const pid = readPid(pidFile);
    expect(pid).toBeDefined();
    expect(alive(pid as number)).toBe(true);
  });

  test("a probe that never answers fails timeout after within, and the command is stopped [1.3a#10]", {
    timeout: 30_000,
  }, async () => {
    const root = space.dir();
    const port = await freePort();
    writeProject(root, [
      {
        name: "web",
        phase: "serve",
        run: "echo $$ > web.pid; exec sleep 30",
        expect: { http: `http://127.0.0.1:${port}/`, within: "1s" },
      },
    ]);
    const started = Date.now();
    const result = await verify(["--json"], { cwd: root });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(result.status).toBe(5);
    expect(stepNamed(decodeResult(result.stdout), "web")).toMatchObject({
      status: "failed",
      failureKind: "timeout",
      reason: "probe not ready after 1s",
    });
    const pid = readPid(join(root, "web.pid"));
    expect(pid).toBeDefined();
    await vi.waitFor(() => expect(alive(pid as number)).toBe(false), { timeout: 2000 });
  });
});

describe("probe URLs checked before anything starts", () => {
  async function refused(http: string) {
    const root = space.dir();
    writeProject(root, [
      { name: "web", phase: "serve", run: "touch started; exec sleep 30", expect: { http } },
    ]);
    const result = await verify(["--json"], { cwd: root });
    expect(result.status).toBe(5);
    expect(has(root, "started")).toBe(false);
    return stepNamed(decodeResult(result.stdout), "web");
  }

  test("a probe URL to a non-local host fails step before starting anything [1.3a#11]", async () => {
    const web = await refused("http://example.com/");
    expect(web).toMatchObject({ status: "failed", failureKind: "step" });
    expect(web.reason?.startsWith("probe URL must be")).toBe(true);
  });

  test("a probe URL with a scheme other than http fails step before starting anything [1.3a#11]", async () => {
    const port = await freePort();
    const web = await refused(`https://localhost:${port}/`);
    expect(web).toMatchObject({ status: "failed", failureKind: "step" });
    expect(web.reason?.startsWith("probe URL must be")).toBe(true);
  });

  test("a probe URL host that only looks local fails step", async () => {
    const port = await freePort();
    const web = await refused(`http://localhost.example.com:${port}/`);
    expect(web).toMatchObject({ status: "failed", failureKind: "step" });
    expect(web.reason?.startsWith("probe URL must be")).toBe(true);
  });

  test("a probe URL with an unresolved variable fails env before starting anything [1.3a#11]", async () => {
    const web = await refused(`http://localhost:${ref("NOPE_UNSET_PORT")}/`);
    expect(web).toMatchObject({ status: "failed", failureKind: "env" });
    expect(web.reason?.startsWith(`probe URL uses ${"$"}{`)).toBe(true);
  });
});
