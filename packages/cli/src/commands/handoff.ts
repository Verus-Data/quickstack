import { Effect, Option, Path, Schema } from "effect";
import { CliError, Flag } from "effect/cli";
import { AppConfig } from "../config";
import {
  agentPrompt,
  candidates,
  decideHandoff,
  type HandoffDecision,
  LAUNCH_ARGS,
  renderHandoff,
} from "../core/handoff";
import { MANIFEST_PATH, readManifest, writeManifest } from "../core/manifest";
import { shownPath } from "../core/shown-path";
import { printable } from "../core/text";
import { PermissionDenied, Usage } from "../errors";
import { AgentId } from "../schemas/entry";
import type { NewResult } from "../schemas/new";
import { Host } from "../services/host";
import { Invocation } from "../services/invocation";
import { type Audience, Output } from "../services/output";
import { Processes } from "../services/processes";

export const splitValues = (values: ReadonlyArray<string>) =>
  values.flatMap((value) => value.split(",").map((part) => part.trim())).filter(Boolean);
const isAgent = Schema.is(AgentId);
const agentValue = (option: string, value: string) =>
  isAgent(value)
    ? Effect.succeed(value)
    : Effect.fail(
        new CliError.InvalidValue({
          option,
          value,
          expected: "claude, codex, opencode or cursor",
          kind: "flag",
        }),
      );

/** Shared flags, with help reflecting the two commands' different sandbox semantics. */
export const projectFlags = (command: "new" | "add") => ({
  sandbox: Flag.Boolean("sandbox").pipe(
    Flag.withDescription(
      command === "new"
        ? "Local only: every default, no deploy, release or app fragments unless named with --with, steps tagged prod skipped. Implies --yes."
        : "Use the sandbox preset when creating a manifest. Existing projects keep their preset. Implies --yes.",
    ),
    Flag.withDefault(false),
  ),
  yes: Flag.Boolean("yes").pipe(
    Flag.withDescription(
      "The brief tells the agent to take every decision's default instead of asking you.",
    ),
    Flag.withDefault(false),
  ),
  agents: Flag.String("agents").pipe(
    Flag.withDescription(
      "Agents to write adapter files for: claude, codex, opencode, cursor (comma-separated). Default: the agents setting, else claude.",
    ),
    Flag.atLeast(0),
    Flag.mapEffect((values) =>
      Effect.forEach(splitValues(values), (value) => agentValue("agents", value)),
    ),
  ),
  launch: Flag.String("launch").pipe(
    Flag.withDescription(
      `The agent to hand the project to: claude, codex, opencode or cursor. Default: the agents setting, then claude, codex, opencode, cursor, whichever is on PATH first. ${command === "new" ? "Never with --json, --no-launch or --dry-run." : "Never with --json or --no-launch."}`,
    ),
    Flag.mapEffect((value) => agentValue("launch", value)),
    Flag.optional,
  ),
  noLaunch: Flag.Boolean("no-launch").pipe(
    Flag.withDescription(
      "Don't start an agent; print the prompt to give one. --json, a detected agent session or a non-terminal never starts one either.",
    ),
    Flag.withDefault(false),
  ),
});

/** Validate preferences and capture the inputs used when composition supplies its trust marks. */
export const prepareHandoff = (
  flags: { launch: Option.Option<AgentId>; noLaunch: boolean; dryRun?: boolean },
  json: boolean,
) =>
  Effect.gen(function* () {
    const preferred = Option.getOrUndefined(flags.launch);
    yield* validatePreferences(flags, json);
    const host = yield* Host;
    const config = yield* AppConfig;
    const processes = yield* Processes;
    const detected = yield* config.agent;
    const configured = (yield* config.get).agents ?? [];
    const launch = !flags.noLaunch && !flags.dryRun;
    const found = new Map<AgentId, string>();
    if (detected === "none" && !json && launch)
      for (const agent of candidates(preferred, configured)) {
        const bin = yield* processes.which(LAUNCH_ARGS[agent].bin);
        if (Option.isSome(bin)) found.set(agent, bin.value);
      }
    return (untrusted: ReadonlyArray<string>): HandoffDecision =>
      flags.dryRun
        ? { kind: "print", reason: "no-launch", untrusted }
        : decideHandoff({
            detected,
            json,
            launch,
            stdinIsTTY: host.stdinIsTTY,
            stdoutIsTTY: host.stdoutIsTTY,
            untrusted,
            ...(preferred ? { preferred } : {}),
            configured,
            found,
            prompt: agentPrompt(host.invocation),
          });
  });

const recordPrinted = (file: string) =>
  readManifest(file).pipe(
    Effect.flatMap((manifest) =>
      manifest.handoff
        ? writeManifest(file, { ...manifest, handoff: { kind: "print", at: manifest.handoff.at } })
        : Effect.void,
    ),
    Effect.ignore,
  );

export type SummaryContext = {
  shown: string;
  audience: Audience;
  untrusted: NewResult["untrusted"];
};

/** Render the result, then print the next task or give the terminal to the selected agent. */
export const completeHandoff = (input: {
  project: string;
  untrusted: NewResult["untrusted"];
  decision: HandoffDecision;
  preview?: boolean;
  render: (context: SummaryContext) => string;
  encode: (handoff: NewResult["handoff"]) => unknown;
}) =>
  Effect.gen(function* () {
    const { decision } = input;
    const invocation = yield* Invocation;
    yield* invocation.annotate({
      handoff: decision.kind,
      ...(decision.kind === "print" ? {} : { agent: decision.agent }),
    });
    const host = yield* Host;
    const output = yield* Output;
    const shown = yield* shownPath(host.cwd, input.project);
    const untrusted =
      output.audience === "agent"
        ? yield* Effect.forEach(input.untrusted, (entry) =>
            Effect.map(shownPath(host.cwd, entry.dir), (dir) => ({ ...entry, dir })),
          )
        : input.untrusted;
    const summary = input.render({ shown, audience: output.audience, untrusted });
    if (decision.kind !== "launch") {
      yield* output.result(
        input.encode({
          ...decision,
          untrusted: [...decision.untrusted],
          prompt: agentPrompt(host.invocation),
        }),
        input.preview
          ? summary
          : `${summary}\n\n${renderHandoff(decision, { shown, invocation: host.invocation, audience: output.audience })}`,
      );
      return;
    }
    yield* output.result(
      null,
      `${summary}\n\nLaunching ${printable(decision.bin)} in ${printable(shown)}...`,
    );
    yield* output.flushNow;
    const config = yield* AppConfig;
    const path = yield* Path.Path;
    const status = yield* (yield* Processes)
      .interactive({
        bin: decision.bin,
        args: [...decision.args],
        cwd: input.project,
        env: config.childEnv([]),
      })
      .pipe(
        Effect.catchTag("SpawnFailed", (failure) =>
          Effect.andThen(
            recordPrinted(path.join(input.project, MANIFEST_PATH)),
            failure.errno === "EACCES"
              ? Effect.fail(
                  new PermissionDenied({ details: { reason: "launch", path: decision.bin } }),
                )
              : Effect.die(failure),
          ),
        ),
      );
    yield* invocation.exitWith(status);
  });

function validatePreferences(
  flags: { launch: Option.Option<AgentId>; noLaunch: boolean; dryRun?: boolean },
  json: boolean,
) {
  return Effect.gen(function* () {
    const preferred = Option.getOrUndefined(flags.launch);
    if (preferred && flags.dryRun)
      return yield* new Usage({ details: { flags: ["--dry-run", "--launch"] } });
    if (preferred && flags.noLaunch)
      return yield* new Usage({ details: { flags: ["--launch", "--no-launch"] } });
    if (preferred && json) return yield* new Usage({ details: { flags: ["--launch", "--json"] } });
  });
}
