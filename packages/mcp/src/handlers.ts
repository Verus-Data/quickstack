import { Effect, Schema } from "effect";
import { CliFailure } from "./errors";
import { type CliOutput, CliRunner } from "./run";
import { CliErrorEnvelope, ListResult, NewResult, VerifyResult } from "./schemas/cli";
import type {
  ListParams,
  ListSuccess,
  NewParams,
  NewSuccess,
  VerifyParams,
  VerifySuccess,
} from "./schemas/tools";
import { toolkit } from "./toolkit";

function parseEnvelope(stderr: string, exit: number): CliFailure {
  const trimmed = stderr.trim();
  const lastLine = trimmed.split("\n").pop() ?? trimmed;
  try {
    const decoded = Schema.decodeUnknownSync(CliErrorEnvelope)(JSON.parse(lastLine));
    return new CliFailure({
      message: decoded.error.message,
      tag: decoded.error.tag,
      details: decoded.error.details ?? {},
      exitCode: exit,
    });
  } catch {
    return new CliFailure({
      message: `CLI exited with code ${exit}`,
      tag: "CliError",
      details: { stderr },
      exitCode: exit,
    });
  }
}

function logCall(
  tool: string,
  target: string,
  durationMs: number,
  exit: number,
): Effect.Effect<void> {
  return Effect.logInfo(`tool=${tool} target=${target} duration=${durationMs}ms exit=${exit}`);
}

export const listHandler = (
  params: ListParams,
): Effect.Effect<ListSuccess, CliFailure, CliRunner> =>
  Effect.gen(function* () {
    const runner = yield* CliRunner;
    const start = Date.now();
    const output: CliOutput = yield* runner.run(["list"]);
    const elapsed = Date.now() - start;
    const target = params.kind ?? "all";
    if (output.exit !== 0) {
      const failure = parseEnvelope(output.stderr, output.exit);
      yield* logCall("stacks_list", target, elapsed, output.exit);
      return yield* Effect.fail(failure);
    }
    const decoded = Schema.decodeUnknownSync(ListResult)(JSON.parse(output.stdout));
    let entries = decoded.entries;
    if (params.kind !== undefined) {
      entries = entries.filter((e) => e.kind === params.kind);
    }
    yield* logCall("stacks_list", target, elapsed, output.exit);
    return { entries } satisfies ListSuccess;
  });

function newArgs(params: NewParams): string[] {
  const args = ["new", params.stack];
  if (params.dir !== undefined) {
    args.push(params.dir);
  }
  const sandbox = params.sandbox ?? true;
  if (sandbox) {
    args.push("--sandbox");
  }
  args.push("--no-launch");
  if (params.with !== undefined) {
    for (const frag of params.with) {
      args.push("--with", frag);
    }
  }
  if (params.without !== undefined) {
    for (const frag of params.without) {
      args.push("--without", frag);
    }
  }
  return args;
}

export const newHandler = (params: NewParams): Effect.Effect<NewSuccess, CliFailure, CliRunner> =>
  Effect.gen(function* () {
    const runner = yield* CliRunner;
    const start = Date.now();
    const output: CliOutput = yield* runner.run(newArgs(params));
    const elapsed = Date.now() - start;
    if (output.exit !== 0) {
      const failure = parseEnvelope(output.stderr, output.exit);
      yield* logCall("stacks_new", params.stack, elapsed, output.exit);
      return yield* Effect.fail(failure);
    }
    const decoded = Schema.decodeUnknownSync(NewResult)(JSON.parse(output.stdout));
    yield* logCall("stacks_new", params.stack, elapsed, output.exit);
    return {
      project: decoded.project,
      stack: decoded.stack,
      fragments: decoded.fragments,
      agents: decoded.agents,
      written: decoded.written,
      briefWords: decoded.briefWords,
      handoff: decoded.handoff,
    } satisfies NewSuccess;
  });

export const verifyHandler = (
  params: VerifyParams,
): Effect.Effect<VerifySuccess, CliFailure, CliRunner> =>
  Effect.gen(function* () {
    const runner = yield* CliRunner;
    const cwd = params.dir ?? process.cwd();
    const start = Date.now();
    const output: CliOutput = yield* runner.run(["verify"], { cwd });
    const elapsed = Date.now() - start;
    if (output.exit === -1) {
      yield* logCall("stacks_verify", cwd, elapsed, output.exit);
      return yield* Effect.fail(
        new CliFailure({
          message: output.stderr,
          tag: "CliError",
          details: {},
          exitCode: output.exit,
        }),
      );
    }
    try {
      const decoded = Schema.decodeUnknownSync(VerifyResult)(JSON.parse(output.stdout));
      yield* logCall("stacks_verify", cwd, elapsed, output.exit);
      return {
        outcome: decoded.outcome,
        totals: decoded.totals,
        durationMs: decoded.durationMs,
        steps: decoded.steps.map((s) => ({
          name: s.name,
          status: s.status,
          ...(s.exitCode !== undefined ? { exitCode: s.exitCode } : {}),
          durationMs: s.durationMs,
        })),
      } satisfies VerifySuccess;
    } catch {
      const failure = parseEnvelope(output.stderr, output.exit);
      yield* logCall("stacks_verify", cwd, elapsed, output.exit);
      return yield* Effect.fail(failure);
    }
  });

export const handlerLayer = toolkit.toLayer({
  stacks_list: listHandler,
  stacks_new: newHandler,
  stacks_verify: verifyHandler,
});
