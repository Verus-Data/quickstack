import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import { entry, Logging } from "../src/logging";
import { Output } from "../src/services/output";
import { ndjson, runCli, tempDir, terminal } from "./helpers/cli";

const record = () =>
  entry({
    date: new Date("2026-01-01T00:00:00Z"),
    level: "Info",
    message: ["command", { private: "hidden" }],
    annotations: { msg: "collision", token: "hidden", object: { secret: "hidden" } },
  });
test("logging has stable UTC shape and safe annotations", () => {
  expect(record()).toEqual({
    time: "2026-01-01T00:00:00.000Z",
    level: "info",
    msg: "command",
    detail: ["[redacted]"],
    annotation_msg: "collision",
    token: "[redacted]",
    object: "[redacted]",
  });
});
test("command logs include duration, outcome and shared invocation id", async () => {
  const result = await runCli(["doctor"], {
    env: { LOG_LEVEL: "info", STACKS_LOG_FORMAT: "json" },
    program: Effect.logInfo("child"),
    host: terminal,
  });
  const records = ndjson(result.stderr);
  expect(records).toHaveLength(2);
  expect(records[0]).toMatchObject({ msg: "child" });
  expect(records[1]).toMatchObject({ msg: "command", outcome: "success", status: 0 });
  expect((records[0] as { invocationId: string }).invocationId).toBe(
    (records[1] as { invocationId: string }).invocationId,
  );
});
test("JSON mode preserves its error envelope and sends command logs to the optional file", async () => {
  const dir = tempDir();
  try {
    const file = join(dir.path, "cli.jsonl");
    const result = await runCli(["unknown", "--json"], {
      env: { LOG_LEVEL: "info", STACKS_LOG_FILE: file },
    });
    expect(JSON.parse(result.stderr).error.tag).toBe("Usage");
    expect(ndjson(readFileSync(file, "utf8"))).toHaveLength(1);
  } finally {
    dir.cleanup();
  }
});
test("sink recreates directories and warns once on repeated failures", async () => {
  const dir = tempDir();
  const output = Output.memory();
  const logDir = join(dir.path, "logs");
  const file = join(logDir, "cli.jsonl");
  const settings = { level: "Info" as const, format: "json" as const, noColor: true, file };
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const logging = yield* Logging;
        logging.records.push(record());
        yield* logging.flush(settings);
        yield* Effect.sync(() => rmSync(logDir, { recursive: true }));
        logging.records.push(record());
        yield* logging.flush(settings);
        expect(ndjson(readFileSync(file, "utf8"))).toHaveLength(1);
        yield* Effect.sync(() => {
          rmSync(logDir, { recursive: true });
          writeFileSync(logDir, "blocked");
        });
        logging.records.push(record(), record());
        yield* logging.flush(settings);
      }).pipe(
        Effect.provide(Logging.layer),
        Effect.provide(Layer.merge(NodeServices.layer, output.layer)),
      ),
    );
    expect(output.stderr.join("").match(/Log file unavailable/g)).toHaveLength(1);
  } finally {
    dir.cleanup();
  }
});
