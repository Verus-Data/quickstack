import { join } from "node:path";
import { Effect, Exit } from "effect";
import { describe, expect, test } from "vitest";
import { AppConfig } from "../../src/config";
import { runToolsWith, type ToolEntry } from "../../src/core/analyze/tools";
import { SpawnFailed } from "../../src/errors";
import { countResults, type SarifRun } from "../../src/schemas/analyze";
import { type Captured, Processes } from "../../src/services/processes";
import { runWithProcesses } from "./helpers";

const TREE = join(import.meta.dirname, "..", "fixtures", "analyze", "tree");
const BIN = join(import.meta.dirname, "..", "fixtures", "analyze", "bin", "fake-tool.mjs");

function adapter(id: string, mode: string, timeoutMs = 10000): ToolEntry {
  return {
    id,
    languages: [],
    binary: "node",
    sarifArgv: [BIN, `--mode=${mode}`],
    timeoutMs,
    verified: false,
  };
}

function resultsCount(runs: readonly SarifRun[]): number {
  return countResults({ version: "2.1.0", runs });
}

async function run(tools: readonly ToolEntry[], toolIds: readonly string[]) {
  const program = Effect.gen(function* () {
    const processes = yield* Processes;
    const config = yield* AppConfig;
    const env = config.childEnv([]);
    return yield* runToolsWith(tools, TREE, toolIds, env, processes);
  });
  const exit = await runWithProcesses(program);
  if (Exit.isFailure(exit)) throw new Error(`runTools failed: ${String(exit.cause)}`);
  return exit.value;
}

describe("tool ledger states", () => {
  test("a fake binary emitting valid SARIF records ran with its result count", async () => {
    const { ledger, runs } = await run([adapter("valid", "valid")], []);
    expect(ledger[0]?.status).toBe("ran");
    expect(resultsCount(runs)).toBe(1);
    expect(runs.length).toBe(1);
    expect(runs[0]?.tool?.driver?.name).toBe("fake-tool");
  });

  test("a fake binary that prints valid SARIF and exits 1 records ran with findings counted", async () => {
    const { ledger, runs } = await run([adapter("findings", "findings")], []);
    expect(ledger[0]?.status).toBe("ran");
    expect(resultsCount(runs)).toBe(1);
    expect(runs.length).toBe(1);
    expect(runs[0]?.tool?.driver?.name).toBe("fake-tool");
  });

  test("a fake binary exiting 2 with no stdout records failed and contributes no runs", async () => {
    const { ledger, runs } = await run([adapter("fail", "fail")], []);
    expect(ledger[0]?.status).toBe("failed");
    expect(ledger[0]?.reason).toContain("exit-code:2");
    expect(runs.length).toBe(0);
  });

  test("a fake binary exiting 0 with invalid JSON records failed with invalid-sarif", async () => {
    const { ledger, runs } = await run([adapter("badjson", "malformed")], []);
    expect(ledger[0]?.status).toBe("failed");
    expect(ledger[0]?.reason).toContain("invalid-sarif");
    expect(runs.length).toBe(0);
  });

  test("a missing binary records absent", async () => {
    const { ledger, runs } = await run(
      [
        {
          id: "missing",
          languages: [],
          binary: "nonexistent-binary-xyz-12345",
          sarifArgv: [],
          timeoutMs: 10000,
          verified: false,
        },
      ],
      [],
    );
    expect(ledger[0]?.status).toBe("absent");
    expect(runs.length).toBe(0);
  });

  test("a fake binary sleeping past its timeout records timeout and the run still succeeds", async () => {
    const { ledger, runs } = await run([adapter("slow", "slow", 500)], []);
    expect(ledger[0]?.status).toBe("timeout");
    expect(runs.length).toBe(0);
  });

  test("a malformed SARIF payload is rejected with invalid-sarif while other runs survive", async () => {
    const { ledger, runs } = await run(
      [adapter("malformed", "malformed"), adapter("valid", "valid")],
      [],
    );
    const malformed = ledger.find((e) => e.id === "malformed");
    const valid = ledger.find((e) => e.id === "valid");
    expect(malformed?.status).toBe("failed");
    expect(malformed?.reason).toContain("invalid-sarif");
    expect(valid?.status).toBe("ran");
    expect(runs.length).toBe(1);
    expect(runs[0]?.tool?.driver?.name).toBe("fake-tool");
  });

  test("a SARIF log with the wrong version is rejected naming the version", async () => {
    const { ledger } = await run([adapter("wrongversion", "invalid-version")], []);
    expect(ledger[0]?.status).toBe("failed");
    expect(ledger[0]?.reason).toContain("invalid-sarif");
    expect(ledger[0]?.reason).toContain("2.0.0");
  });

  test("--tool selection marks non-selected adapters as skipped with reason not-selected", async () => {
    const { ledger } = await run(
      [
        {
          id: "alpha",
          languages: [],
          binary: "nonexistent-alpha-12345",
          sarifArgv: [],
          timeoutMs: 10000,
          verified: false,
        },
        {
          id: "beta",
          languages: [],
          binary: "nonexistent-beta-67890",
          sarifArgv: [],
          timeoutMs: 10000,
          verified: false,
        },
        {
          id: "gamma",
          languages: [],
          binary: "nonexistent-gamma-00000",
          sarifArgv: [],
          timeoutMs: 10000,
          verified: false,
        },
      ],
      ["beta"],
    );
    const alpha = ledger.find((e) => e.id === "alpha");
    const beta = ledger.find((e) => e.id === "beta");
    const gamma = ledger.find((e) => e.id === "gamma");
    expect(alpha?.status).toBe("skipped");
    expect(alpha?.reason).toBe("not-selected");
    expect(gamma?.status).toBe("skipped");
    expect(gamma?.reason).toBe("not-selected");
    expect(beta?.status).toBe("absent");
    expect(ledger.length).toBe(3);
  });

  test("without --tool every adapter is probed and none is skipped", async () => {
    const { ledger } = await run(
      [
        {
          id: "alpha",
          languages: [],
          binary: "nonexistent-alpha-12345",
          sarifArgv: [],
          timeoutMs: 10000,
          verified: false,
        },
        {
          id: "beta",
          languages: [],
          binary: "nonexistent-beta-67890",
          sarifArgv: [],
          timeoutMs: 10000,
          verified: false,
        },
      ],
      [],
    );
    expect(ledger.length).toBe(2);
    for (const entry of ledger) {
      expect(entry.status).not.toBe("skipped");
    }
  });
});

const VALID_SARIF = JSON.stringify({
  version: "2.1.0",
  runs: [{ tool: { driver: { name: "stub" } }, results: [] }],
});

function recordingProcesses(captured: Captured): {
  recorded: { argv: readonly string[] | undefined };
  service: Processes["Service"];
} {
  const recorded: { argv: readonly string[] | undefined } = { argv: undefined };
  const service = {
    exec: (spec: { argv: readonly string[] }) =>
      Effect.sync(() => {
        recorded.argv = spec.argv;
        return captured;
      }),
  } as unknown as Processes["Service"];
  return { recorded, service };
}

function failingProcesses(errno: string): Processes["Service"] {
  return {
    exec: () => Effect.fail(new SpawnFailed({ kind: "command", errno })),
  } as unknown as Processes["Service"];
}

describe("argv contract", () => {
  test("argv[0] is tool.binary, not sarifArgv[0], for an adapter whose binary differs from its first argument", async () => {
    const tool: ToolEntry = {
      id: "structural",
      languages: [],
      binary: "node",
      sarifArgv: [BIN, "--mode=valid"],
      timeoutMs: 10000,
      verified: false,
    };
    const captured: Captured = {
      exitCode: 0,
      durationMs: 0,
      stdout: VALID_SARIF,
      stderr: "",
      truncated: false,
      timedOut: false,
    };
    const { recorded, service } = recordingProcesses(captured);
    const exit = await Effect.runPromiseExit(runToolsWith([tool], TREE, [], {}, service));
    if (Exit.isFailure(exit)) throw new Error(`runToolsWith failed: ${String(exit.cause)}`);
    expect(recorded.argv).toBeDefined();
    expect(recorded.argv?.[0]).toBe("node");
    expect(recorded.argv?.[1]).toBe(BIN);
    expect(tool.binary).not.toBe(tool.sarifArgv[0]);
  });
});

describe("spawn failure classification", () => {
  test("ENOENT records absent", async () => {
    const tool: ToolEntry = {
      id: "enoent",
      languages: [],
      binary: "nonexistent",
      sarifArgv: [],
      timeoutMs: 10000,
      verified: false,
    };
    const exit = await Effect.runPromiseExit(
      runToolsWith([tool], TREE, [], {}, failingProcesses("ENOENT")),
    );
    if (Exit.isFailure(exit)) throw new Error(`runToolsWith failed: ${String(exit.cause)}`);
    expect(exit.value.ledger[0]?.status).toBe("absent");
  });

  test("EACCES records failed with reason spawn:EACCES", async () => {
    const tool: ToolEntry = {
      id: "eacces",
      languages: [],
      binary: "some-binary",
      sarifArgv: [],
      timeoutMs: 10000,
      verified: false,
    };
    const exit = await Effect.runPromiseExit(
      runToolsWith([tool], TREE, [], {}, failingProcesses("EACCES")),
    );
    if (Exit.isFailure(exit)) throw new Error(`runToolsWith failed: ${String(exit.cause)}`);
    expect(exit.value.ledger[0]?.status).toBe("failed");
    expect(exit.value.ledger[0]?.reason).toBe("spawn:EACCES");
  });
});
