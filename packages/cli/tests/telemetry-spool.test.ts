import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { it } from "@effect/vitest";
import { Clock, Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  files,
  flushValue,
  json,
  notified,
  ok,
  queue,
  seed,
  spooled,
  spoolFiles,
  type TelemetryServer,
  telemetryCli,
  telemetryRoot,
  telemetryServer,
  workspace,
  writeJson,
} from "./helpers/telemetry";
import { readManifestAt } from "./helpers/verify";

let space: ReturnType<typeof workspace>;
let home: string;
let server: TelemetryServer;
beforeEach(async () => {
  space = workspace();
  home = space.home;
  server = await telemetryServer();
});
afterEach(async () => {
  await server.close();
  expect(server.errors).toEqual([]);
  space.cleanup();
});
const env = () => ({ STACKS_TELEMETRY_URL: server.url });
async function flush(options: { clock?: Clock.Clock; signal?: AbortSignal } = {}) {
  const args = ["telemetry", "flush", "--json"];
  const result = await telemetryCli(args, {
    home,
    env: env(),
    signal: options.signal,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  return result;
}
async function backlog(count: number) {
  await notified(home, server.url);
  await queue(home, server.url);
  seed(home, count - 1);
  return spooled(home);
}

test("private modes and project retention are enforced at flush [4.1a#15]", async () => {
  await notified(home, server.url);
  ok(await telemetryCli(["new", "go-cli", "project", "--json"], { home, env: env() }));
  const manifest = readManifestAt(join(home, "project"));
  const root = telemetryRoot(home);
  const current = join(root, "projects", `${manifest.projectId}.json`);
  const record = json(current);
  const day = 24 * 60 * 60 * 1000;
  const old = join(root, "projects", `${randomUUID()}.json`);
  const fresh = join(root, "projects", `${randomUUID()}.json`);
  if (typeof record !== "object" || record === null) throw new Error("Expected project record");
  writeJson(old, { ...record, scaffoldedAt: new Date(Date.now() - 366 * day).toISOString() });
  writeJson(fresh, { ...record, scaffoldedAt: new Date(Date.now() - 364 * day).toISOString() });
  await queue(home, server.url);
  server.mode("fail");
  ok(await flush());
  expect(existsSync(old)).toBe(false);
  expect(existsSync(fresh)).toBe(true);
  expect(statSync(root).mode & 0o777).toBe(0o700);
  expect(files(root).length).toBeGreaterThan(3);
  for (const file of files(root)) expect(statSync(file).mode & 0o777, file).toBe(0o600);
});

test("600 pending events shrink to the newest 500 before sending [4.1a#18]", async () => {
  await notified(home, server.url);
  await queue(home, server.url);
  const initial = spooled(home)[0];
  if (!initial) throw new Error("Missing seed event");
  rmSync(join(telemetryRoot(home), "spool"), { recursive: true });
  mkdirSync(join(telemetryRoot(home), "spool"), { mode: 0o700 });
  const start = Date.now() - 24 * 60 * 60 * 1000;
  const events = Array.from({ length: 600 }, (_, i) => ({
    ...initial,
    eventId: randomUUID(),
    sentAt: new Date(start + i * 1000).toISOString(),
  }));
  for (const event of events) {
    const file = join(telemetryRoot(home), "spool", `${event.eventId}.json`);
    writeJson(file, event);
    utimesSync(file, new Date(event.sentAt), new Date(event.sentAt));
  }
  server.mode("fail");
  ok(await flush());
  expect(
    spooled(home)
      .map((e) => e.eventId)
      .sort(),
  ).toEqual(
    events
      .slice(100)
      .map((e) => e.eventId)
      .sort(),
  );
  expect(server.requests).toHaveLength(1);
  expect(server.events().length).toBeLessThanOrEqual(50);
  const retained = new Set<string>(events.slice(100).map((e) => e.eventId));
  expect(server.events().every((e) => retained.has(e.eventId))).toBe(true);
}, 10_000); // 600 real filesystem writes, then a real failed POST.

test("events older than seven days are dropped before POST [4.1a#18]", async () => {
  await backlog(1);
  const fresh = spooled(home)[0];
  if (!fresh) throw new Error("Missing fresh event");
  const old = seed(home, 1, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString());
  for (const event of old) {
    const file = join(telemetryRoot(home), "spool", `${event.eventId}.json`);
    utimesSync(file, new Date(event.sentAt), new Date(event.sentAt));
  }
  ok(await flush());
  expect(server.events().map((e) => e.eventId)).toEqual([fresh.eventId]);
  expect(spooled(home)).toEqual([]);
});

function worker() {
  const child = spawn(
    "bun",
    [
      "--no-env-file",
      join(import.meta.dirname, "fixtures/telemetry/flush-worker.ts"),
      home,
      server.url,
    ],
    {
      env: { PATH: process.env.PATH, HOME: home, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, stdout, stderr }));
    },
  );
  return { child, done };
}

test("two OS processes claim disjoint batches while the first POST is held [4.1a#19]", async () => {
  const pending = await backlog(75);
  server.mode("hold");
  const first = worker();
  let second: ReturnType<typeof worker> | undefined;
  try {
    await vi.waitFor(() => expect(server.requests).toHaveLength(1), { timeout: 2000, interval: 5 });
    second = worker();
    // The first response remains held until the second POST proves it has claimed its batch.
    await vi.waitFor(() => expect(server.requests).toHaveLength(2), { timeout: 2000, interval: 5 });
    expect(first.child.exitCode).toBeNull();
    expect(second.child.exitCode).toBeNull();
    const ids = server.events().map((e) => e.eventId);
    expect(ids).toHaveLength(75);
    expect(new Set(ids).size).toBe(75);
    expect(ids.sort()).toEqual(pending.map((e) => e.eventId).sort());
    server.release();
    for (const result of await Promise.all([first.done, second.done])) {
      expect(result.code, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      expect(flushValue(result.stdout).sent).toBeGreaterThan(0);
    }
    expect(spooled(home)).toEqual([]);
  } finally {
    server.release();
    first.child.kill("SIGKILL");
    second?.child.kill("SIGKILL");
    await Promise.all([first.done, second?.done]);
  }
}, 15_000); // Two source workers must start and POST within the explicit flush's 5s deadline.

test("a corrupt install identity cannot send with an ephemeral id [4.1a#21]", async () => {
  await notified(home, server.url);
  writeFileSync(join(telemetryRoot(home), "install.json"), "{interrupted");
  const baseline = await telemetryCli(["show", "go-cli", "--json", "--no-telemetry"], {
    home,
    env: env(),
  });
  ok(baseline);
  const actual = await telemetryCli(["show", "go-cli", "--json"], { home, env: env() });
  expect(actual).toEqual(baseline);
  ok(await flush());
  // Recovery is optional; sending with an identity that was never persisted is forbidden.
  if (server.events().length > 0) {
    const persisted = Schema.decodeUnknownSync(
      Schema.Struct({ installId: Schema.String.check(Schema.isUUID()) }),
    )(json(join(telemetryRoot(home), "install.json")));
    expect(server.events().every((event) => event.installId === persisted.installId)).toBe(true);
  }
  expect(spooled(home)).toEqual([]);
});

test("a corrupt spool file cannot poison a valid batch [4.1a#22]", async () => {
  const pending = await backlog(2);
  const corrupt = join(telemetryRoot(home), "spool", `${randomUUID()}.json`);
  writeFileSync(corrupt, "{partial");
  const result = await flush();
  ok(result);
  expect(flushValue(result.stdout).sent).toBe(2);
  expect(
    server
      .events()
      .map((e) => e.eventId)
      .sort(),
  ).toEqual(pending.map((e) => e.eventId).sort());
  expect(existsSync(corrupt)).toBe(false);
  expect(spoolFiles(home)).toEqual([]);
});

test("an unwritable full spool drops new events without affecting output [4.1a#23]", async () => {
  await backlog(500);
  const root = join(telemetryRoot(home), "spool");
  const pending = spooled(home)
    .map((e) => e.eventId)
    .sort();
  chmodSync(root, 0o500);
  try {
    const baseline = await telemetryCli(["show", "go-cli", "--json", "--no-telemetry"], {
      home,
      env: env(),
    });
    ok(baseline);
    const actual = await telemetryCli(["show", "go-cli", "--json"], { home, env: env() });
    expect(actual).toEqual(baseline);
    expect(
      spooled(home)
        .map((e) => e.eventId)
        .sort(),
    ).toEqual(pending);
    expect(server.requests).toEqual([]);
  } finally {
    chmodSync(root, 0o700);
  }
}, 10_000); // Fill the real spool before removing its write permission.

test.each(["foreign", "reject"])(
  "202 with %s ids validates against exactly the sent batch [4.1a#24]",
  async (mode) => {
    const pending = await backlog(3);
    server.mode(mode === "foreign" ? "foreign" : "reject");
    const result = await flush();
    ok(result);
    expect(flushValue(result.stdout)).toMatchObject(
      mode === "foreign" ? { sent: 0, kept: 3, rejected: 0 } : { sent: 2, kept: 0, rejected: 1 },
    );
    expect(
      spooled(home)
        .map((e) => e.eventId)
        .sort(),
    ).toEqual(mode === "foreign" ? pending.map((e) => e.eventId).sort() : []);
    if (mode === "foreign") {
      expect(existsSync(join(telemetryRoot(home), "flush.json"))).toBe(true);
      server.mode("accept");
      ok(await flush());
      expect(server.requests).toHaveLength(1);
    }
  },
);

it.effect.each([
  { status: 429, kind: "seconds", seconds: 120 },
  { status: 503, kind: "seconds", seconds: 1200 },
  { status: 429, kind: "date", seconds: 1200 },
  { status: 503, kind: "date", seconds: 120 },
])("$status honors Retry-After as $kind across fresh invocations [4.1a#25]", (row) =>
  Effect.gen(function* () {
    const now = Date.now();
    yield* TestClock.setTime(now);
    const clock = yield* Clock.Clock;
    yield* Effect.promise(() => backlog(1));
    server.retry(
      row.status,
      row.kind === "seconds"
        ? String(row.seconds)
        : new Date(now + row.seconds * 1000).toUTCString(),
    );
    const first = yield* Effect.promise(() => flush({ clock }));
    ok(first);
    expect(flushValue(first.stdout)).toMatchObject({ sent: 0, kept: 1 });
    expect(server.requests).toHaveLength(1);
    server.mode("accept");
    yield* TestClock.adjust((row.seconds - 60) * 1000);
    ok(yield* Effect.promise(() => flush({ clock })));
    expect(server.requests).toHaveLength(1);
    expect(spooled(home)).toHaveLength(1);
    yield* TestClock.adjust("2 minutes");
    ok(yield* Effect.promise(() => flush({ clock })));
    expect(server.requests).toHaveLength(2);
    expect(spooled(home)).toEqual([]);
  }),
);

test("an interrupted POST returns every claimed event to the spool [4.1a#26]", async () => {
  const pending = await backlog(3);
  server.mode("hold");
  const controller = new AbortController();
  const running = flush({ signal: controller.signal });
  try {
    await vi.waitFor(() => expect(server.requests).toHaveLength(1), { timeout: 2000, interval: 5 });
    controller.abort();
    const result = await running;
    expect(result.status).toBe(130);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { tag: "Interrupted" } });
    expect(
      spooled(home)
        .map((e) => e.eventId)
        .sort(),
    ).toEqual(pending.map((e) => e.eventId).sort());
  } finally {
    controller.abort();
    server.release();
    await running;
  }
}, 10_000); // Observe the real POST, then abort and wait for its finalizer.

test("a later flush recovers a killed process's stale claims [4.1a#26]", async () => {
  const pending = await backlog(3);
  // Model an earlier process killed before its finalizer: retain the sender's actual claim layout.
  server.mode("hold");
  const killed = worker();
  try {
    await vi.waitFor(() => expect(server.requests).toHaveLength(1), { timeout: 2000, interval: 5 });
    killed.child.kill("SIGKILL");
    await killed.done;
    const root = telemetryRoot(home);
    const age = new Date(Date.now() - 11 * 60 * 1000);
    for (const file of files(root)) utimesSync(file, age, age);
    // The claim directory itself is the age marker specified by the plan.
    const parents = new Set(files(root).map((file) => join(file, "..")));
    for (const parent of parents) utimesSync(parent, age, age);
    server.mode("accept");
    const recovered = await flush();
    ok(recovered);
    expect(flushValue(recovered.stdout).sent).toBe(3);
    expect(
      server.requests
        .at(-1)
        ?.events.map((e) => e.eventId)
        .sort(),
    ).toEqual(pending.map((e) => e.eventId).sort());
    expect(spooled(home)).toEqual([]);
  } finally {
    killed.child.kill("SIGKILL");
    server.release();
    await killed.done;
  }
}, 15_000); // Start a worker, observe its POST, kill it and recover the on-disk claim.
