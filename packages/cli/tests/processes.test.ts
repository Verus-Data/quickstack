import { execSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Duration, Effect, Exit, Fiber, Option } from "effect";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AppConfig } from "../src/config";
import { SpawnFailed } from "../src/errors";
import { Foreground, Processes, TAIL_BYTES, TAIL_LINES } from "../src/services/processes";
import { alive, runProcesses, tempDir } from "./helpers/cli";

let dir: ReturnType<typeof tempDir>;
beforeEach(() => {
  dir = tempDir();
});
afterEach(() => dir.cleanup());

const env = () => ({ PATH: process.env.PATH ?? "" });
const shell = (command: string, timeout?: Duration.Duration) => ({
  command,
  cwd: dir.path,
  env: env(),
  ...(timeout ? { timeout } : {}),
});
async function succeed<A, E>(exit: Promise<Exit.Exit<A, E>>): Promise<A> {
  const result = await exit;
  if (Exit.isFailure(result)) throw new Error(`expected success, got ${String(result.cause)}`);
  return result.value;
}
async function spawnFailure<A>(exit: Promise<Exit.Exit<A, SpawnFailed>>): Promise<SpawnFailed> {
  const result = await exit;
  if (Exit.isSuccess(result)) throw new Error("expected SpawnFailed");
  const error = result.cause.reasons.find((r) => r._tag === "Fail");
  expect(error?._tag === "Fail" && error.error).toBeInstanceOf(SpawnFailed);
  return (error as { error: SpawnFailed }).error;
}
/** Polls `assertion` with vi.waitFor from inside an Effect. */
const until = (assertion: () => void, timeout = 1000) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout }));
const pidIn = (file: string) => Number(readFileSync(join(dir.path, file), "utf8").trim());
const use = <A, E, R>(f: (p: Processes["Service"]) => Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    return yield* f(yield* Processes);
  });
const run = (command: string, timeout?: Duration.Duration) =>
  runProcesses(use((p) => p.run(shell(command, timeout))));

test("run reports the shell's exit code", async () => {
  const finished = await succeed(run("exit 3"));
  expect(finished).toMatchObject({ exitCode: 3, timedOut: false, pipesHeld: false });
});

test("run keeps the last TAIL_LINES lines of combined output and streams every chunk", async () => {
  const chunks: string[] = [];
  const finished = await succeed(
    runProcesses(
      use((p) =>
        p.run(
          shell("i=1; while [ $i -le 10000 ]; do echo line$i; i=$((i+1)); done; echo err >&2"),
          (chunk) =>
            Effect.sync(() => {
              chunks.push(chunk);
            }),
        ),
      ),
    ),
  );
  // stdout and stderr are separate pipes, so where `err` lands among stdout's lines isn't fixed;
  // stdout's own lines are the newest ones, in order.
  const lines = finished.tail.split("\n");
  expect(lines).toHaveLength(TAIL_LINES);
  expect(lines).toContain("err");
  const out = lines.filter((line) => line !== "err");
  expect(out).toEqual(
    Array.from({ length: out.length }, (_, i) => `line${10000 - out.length + 1 + i}`),
  );
  expect(out.length).toBeGreaterThanOrEqual(TAIL_LINES - 1);
  const streamed = chunks.join("");
  expect(streamed.startsWith("line1\nline2\n")).toBe(true);
  expect(streamed.split("\n").filter(Boolean)).toHaveLength(10001);
});

test("exec keeps at most TAIL_BYTES of each stream, the newest bytes, and says it truncated", async () => {
  const captured = await succeed(
    runProcesses(
      use((p) =>
        p.exec({
          argv: [
            "/bin/sh",
            "-c",
            "i=0; while [ $i -lt 40000 ]; do echo 0123456789; i=$((i+1)); done; echo last",
          ],
          cwd: dir.path,
          env: env(),
        }),
      ),
    ),
  );
  expect(new TextEncoder().encode(captured.stdout).length).toBe(TAIL_BYTES);
  expect(captured.stdout.endsWith("0123456789\nlast\n")).toBe(true);
  expect(captured).toMatchObject({ truncated: true, stderr: "", exitCode: 0 });
});

test("the kept output starts on a character boundary when truncation cuts one", async () => {
  const captured = await succeed(
    runProcesses(
      use((p) =>
        p.exec({
          argv: ["node", "-e", 'process.stdout.write("\u00e9".repeat(200000) + "x")'],
          cwd: dir.path,
          env: env(),
        }),
      ),
    ),
  );
  expect(captured.truncated).toBe(true);
  expect(captured.stdout.startsWith("\u00e9")).toBe(true);
  expect(captured.stdout.endsWith("\u00e9x")).toBe(true);
  expect(new TextEncoder().encode(captured.stdout).length).toBe(TAIL_BYTES - 1);
});

test("streamed output ends with a partial character flushed, not dropped", async () => {
  const chunks: string[] = [];
  await succeed(
    runProcesses(
      use((p) =>
        p.run(shell("printf 'a\\303'"), (chunk) =>
          Effect.sync(() => {
            chunks.push(chunk);
          }),
        ),
      ),
    ),
  );
  expect(chunks.join("")).toBe("a\ufffd");
});

test("a NUL byte in an argument fails SpawnFailed instead of throwing", async () => {
  const error = await spawnFailure(
    runProcesses(use((p) => p.exec({ argv: ["echo", "a\u0000b"], cwd: dir.path, env: env() }))),
  );
  expect({ kind: error.kind, errno: error.errno }).toEqual({
    kind: "command",
    errno: "ERR_INVALID_ARG_VALUE",
  });
});

test("a timeout kills the process group and reports timedOut", async () => {
  const started = Date.now();
  const finished = await succeed(run("sleep 60", Duration.millis(300)));
  expect(finished).toMatchObject({ timedOut: true, exitCode: 128 + 15, signal: "SIGTERM" });
  expect(Date.now() - started).toBeLessThan(5000);
});

test("run drains for 2s after the shell exits, then kills a group still holding the pipes", async () => {
  const started = Date.now();
  const finished = await succeed(run("sleep 60 & echo $! > bg; echo hi"));
  expect(Date.now() - started).toBeLessThan(3500);
  expect(finished).toMatchObject({ exitCode: 0, pipesHeld: true, timedOut: false });
  expect(finished.tail.split("\n")).toEqual([
    "hi",
    "quickstack: output was still open 2s after the command exited; its process group was killed.",
  ]);
  expect(alive(pidIn("bg"))).toBe(false);
});

test("stdin is closed, so a command reading it gets EOF at once", async () => {
  const started = Date.now();
  expect(await succeed(run("cat"))).toMatchObject({ exitCode: 0, pipesHeld: false });
  expect(Date.now() - started).toBeLessThan(1500);
});

test("a missing command under the shell is exit 127, not a spawn failure", async () => {
  expect(await succeed(run("definitely-not-a-command-qs"))).toMatchObject({ exitCode: 127 });
});

test("a missing cwd fails SpawnFailed with kind cwd", async () => {
  const error = await spawnFailure(
    runProcesses(
      use((p) => p.run({ command: "true", cwd: join(dir.path, "missing"), env: env() })),
    ),
  );
  expect({ kind: error.kind, errno: error.errno }).toEqual({ kind: "cwd", errno: "ENOENT" });
});

test("interactive with a missing binary fails SpawnFailed with kind command", async () => {
  const error = await spawnFailure(
    runProcesses(
      use((p) =>
        p.interactive({ bin: join(dir.path, "nope"), args: [], cwd: dir.path, env: env() }),
      ),
    ),
  );
  expect({ kind: error.kind, errno: error.errno }).toEqual({ kind: "command", errno: "ENOENT" });
});

test("a started process and its grandchild are both gone once the scope closes", async () => {
  await succeed(
    runProcesses(
      Effect.gen(function* () {
        const processes = yield* Processes;
        const running = yield* processes.start(
          shell("echo $$ > leader; sleep 60 & echo $! > grandchild; echo up; wait"),
        );
        yield* until(() => expect(existsSync(join(dir.path, "grandchild"))).toBe(true));
        expect(alive(pidIn("leader"))).toBe(true);
        yield* until(() => expect(Effect.runSync(running.tail)).toBe("up"));
      }),
    ),
  );
  expect(alive(-pidIn("leader"))).toBe(false);
  expect(alive(pidIn("grandchild"))).toBe(false);
});

test("a started process that exits on its own reports how it finished", async () => {
  const finished = await succeed(
    runProcesses(
      use((p) => Effect.flatMap(p.start(shell("echo done; exit 4")), (running) => running.exited)),
    ),
  );
  expect(finished).toMatchObject({ exitCode: 4, tail: "done", timedOut: false });
});

test("a started process that leaves a grandchild holding its output still times out", async () => {
  const finished = await succeed(
    runProcesses(
      use((p) =>
        Effect.flatMap(
          p.start(shell("sleep 60 & echo $! > grandchild; echo started", Duration.millis(300))),
          (running) => running.exited,
        ),
      ),
    ),
  );
  expect(finished).toMatchObject({ timedOut: true, tail: "started" });
  expect(alive(pidIn("grandchild"))).toBe(false);
});

test("a started group that ends on its own leaves the registry", async () => {
  await succeed(
    runProcesses(
      Effect.gen(function* () {
        const holder = yield* Foreground;
        const running = yield* (yield* Processes).start(shell("exit 0"));
        yield* running.exited;
        yield* until(() => expect(holder.groups.size).toBe(0));
      }),
    ),
  );
});

test("a group that ignores SIGTERM gets SIGKILL 5 s later", async () => {
  const started = Date.now();
  const finished = await succeed(
    run("trap '' TERM; echo $$ > leader; sleep 60", Duration.millis(200)),
  );
  const elapsed = Date.now() - started;
  expect(finished).toMatchObject({ timedOut: true, exitCode: 128 + 9, signal: "SIGKILL" });
  expect(alive(-pidIn("leader"))).toBe(false);
  expect(elapsed).toBeGreaterThanOrEqual(5000);
  expect(elapsed).toBeLessThan(7000);
}, 15000);

test("closing a scope stops its groups together, not one grace period after another", async () => {
  const started = Date.now();
  await succeed(
    runProcesses(
      Effect.gen(function* () {
        const processes = yield* Processes;
        for (const name of ["one", "two", "three"])
          yield* processes.start(shell(`trap '' TERM; echo $$ > ${name}; sleep 60`));
        yield* until(() =>
          expect(["one", "two", "three"].every((f) => existsSync(join(dir.path, f)))).toBe(true),
        );
      }),
    ),
  );
  const elapsed = Date.now() - started;
  for (const name of ["one", "two", "three"]) expect(alive(-pidIn(name))).toBe(false);
  expect(elapsed).toBeGreaterThanOrEqual(5000);
  expect(elapsed).toBeLessThan(8000);
}, 25000);

test("interrupting an interactive child kills it and gives the terminal back", async () => {
  await succeed(
    runProcesses(
      Effect.gen(function* () {
        const holder = yield* Foreground;
        const processes = yield* Processes;
        const fiber = yield* Effect.forkChild(
          processes.interactive({ bin: "sleep", args: ["60"], cwd: dir.path, env: env() }),
        );
        yield* until(() => expect(holder.foreground).toBeDefined());
        const pid = holder.foreground as number;
        expect(alive(pid)).toBe(true);
        yield* Fiber.interrupt(fiber);
        expect(holder.foreground).toBeUndefined();
        yield* until(() => expect(alive(pid)).toBe(false));
      }),
    ),
  );
});

test("an interactive child stays in the CLI's process group and its exit code comes back", async () => {
  const code = await succeed(
    runProcesses(
      use((p) =>
        p.interactive({
          bin: "/bin/sh",
          args: ["-c", "ps -o pgid= -p $$ > pgid; exit 9"],
          cwd: dir.path,
          env: env(),
        }),
      ),
    ),
  );
  expect(code).toBe(9);
  const parent = execSync(`ps -o pgid= -p ${process.pid}`, { encoding: "utf8" }).trim();
  expect(readFileSync(join(dir.path, "pgid"), "utf8").trim()).toBe(parent);
});

test("exec passes arguments byte for byte, with no shell", async () => {
  const hostile = "a; touch pwned $(touch pwned2) `id`";
  const captured = await succeed(
    runProcesses(
      use((p) =>
        p.exec({
          argv: ["node", "-e", "process.stdout.write(process.argv[1])", hostile],
          cwd: dir.path,
          env: env(),
        }),
      ),
    ),
  );
  expect(captured).toMatchObject({ stdout: hostile, stderr: "", exitCode: 0, truncated: false });
  expect(existsSync(join(dir.path, "pwned"))).toBe(false);
  expect(existsSync(join(dir.path, "pwned2"))).toBe(false);
});

test("exec keeps stdout and stderr apart", async () => {
  const captured = await succeed(
    runProcesses(
      use((p) =>
        p.exec({
          argv: [
            "node",
            "-e",
            'process.stdout.write("out"); process.stderr.write("err"); process.exit(2)',
          ],
          cwd: dir.path,
          env: env(),
        }),
      ),
    ),
  );
  expect(captured).toMatchObject({ stdout: "out", stderr: "err", exitCode: 2, timedOut: false });
});

test("exec with a missing program fails SpawnFailed with kind command", async () => {
  const error = await spawnFailure(
    runProcesses(
      use((p) => p.exec({ argv: ["definitely-not-a-command-qs"], cwd: dir.path, env: env() })),
    ),
  );
  expect({ kind: error.kind, errno: error.errno }).toEqual({ kind: "command", errno: "ENOENT" });
});

test("exec applies its timeout to the process group", async () => {
  const captured = await succeed(
    runProcesses(
      use((p) =>
        p.exec({ argv: ["sleep", "60"], cwd: dir.path, env: env(), timeout: Duration.millis(300) }),
      ),
    ),
  );
  expect(captured).toMatchObject({ timedOut: true, exitCode: 128 + 15, signal: "SIGTERM" });
});

test("which takes the first executable regular file on the captured PATH", async () => {
  const [plain, folder, good] = ["a", "b", "c"].map((name) => join(dir.path, name)) as [
    string,
    string,
    string,
  ];
  for (const d of [plain, folder, good]) mkdirSync(d);
  writeFileSync(join(plain, "tool"), "not executable");
  mkdirSync(join(folder, "tool"));
  writeFileSync(join(good, "tool"), "#!/bin/sh\n");
  chmodSync(join(good, "tool"), 0o755);
  const which = (name: string, path: string) =>
    succeed(
      runProcesses(
        use((p) => p.which(name)),
        { PATH: path },
      ),
    );
  expect(await which("tool", `${plain}:${folder}:${good}`)).toEqual(
    Option.some(join(good, "tool")),
  );
  expect(await which("missing", `${plain}:${good}`)).toEqual(Option.none());
  expect(await which(join(good, "tool"), "")).toEqual(Option.some(join(good, "tool")));
  expect(await which(join(plain, "tool"), "")).toEqual(Option.none());
});

test("which skips empty PATH entries instead of searching the working directory", async () => {
  writeFileSync(join(dir.path, "here"), "#!/bin/sh\n");
  chmodSync(join(dir.path, "here"), 0o755);
  const previous = process.cwd();
  process.chdir(dir.path);
  try {
    const found = await succeed(
      runProcesses(
        use((p) => p.which("here")),
        { PATH: "::" },
      ),
    );
    expect(found).toEqual(Option.none());
  } finally {
    process.chdir(previous);
  }
});

test("childEnv drops the names it is given and adds nothing that wasn't captured", async () => {
  const captured = { PATH: process.env.PATH ?? "", KEEP: "1", EMPTY: "", CLAUDECODE: "1" };
  const childEnv = await succeed(
    runProcesses(
      Effect.gen(function* () {
        return (yield* AppConfig).childEnv(["CLAUDECODE"], { SET: "y" });
      }),
      captured,
    ),
  );
  expect(childEnv).toEqual({ PATH: captured.PATH, KEEP: "1", EMPTY: "", SET: "y" });
  // The child sees exactly that record: nothing from this process's own environment leaks in.
  const seen = await succeed(
    runProcesses(use((p) => p.exec({ argv: ["/usr/bin/env"], cwd: dir.path, env: childEnv }))),
  );
  expect(seen.stdout.trim().split("\n").sort()).toEqual(
    Object.entries(childEnv)
      .map(([k, v]) => `${k}=${v}`)
      .sort(),
  );
});
