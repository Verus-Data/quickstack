import { Effect, Option, Path, Schema } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";
import { AppConfig } from "../config";
import { add } from "../core/add";
import {
  agentPrompt,
  candidates,
  decideHandoff,
  LAUNCH_ARGS,
  renderHandoff,
} from "../core/handoff";
import { MANIFEST_PATH, readManifest, writeManifest } from "../core/manifest";
import { defaultRoots, Registry } from "../core/registry/registry";

import { shownPath } from "../core/shown-path";
import { printable } from "../core/text";
import { PermissionDenied, Usage } from "../errors";
import { AddResult } from "../schemas/add";
import { AgentId } from "../schemas/entry";
import { Host } from "../services/host";
import { Invocation } from "../services/invocation";
import { Output } from "../services/output";
import { Processes } from "../services/processes";
import { root } from "./root";

/** Repeatable, comma-separated values: `--with a,b --with c` is `[a, b, c]`. */
const list = (values: ReadonlyArray<string>) =>
  values.flatMap((value) => value.split(",").map((part) => part.trim())).filter(Boolean);

const isAgent = Schema.is(AgentId);

/**
 * Rewrites the manifest's `handoff` record from `launch` to `print` (same `at`) after the agent
 * couldn't be started. Best effort: the spawn failure is what the caller reports, so a manifest
 * that can't be read or written back leaves the record as it was.
 */
const recordPrinted = (file: string) =>
  readManifest(file).pipe(
    Effect.flatMap((manifest) =>
      manifest.handoff
        ? writeManifest(file, { ...manifest, handoff: { kind: "print", at: manifest.handoff.at } })
        : Effect.void,
    ),
    Effect.ignore,
  );

export const addCommand = Command.make(
  "add",
  {
    fragments: Argument.String("fragment").pipe(
      Argument.withDescription("One or more fragments to apply (see list fragments)."),
      Argument.atLeast(1),
    ),
    dir: Flag.String("dir").pipe(
      Flag.withDescription("Existing project directory. Defaults to the current directory."),
      Flag.optional,
    ),
    sandbox: Flag.Boolean("sandbox").pipe(
      Flag.withDescription(
        "Use the sandbox preset when creating a manifest. Existing projects keep their preset. Implies --yes.",
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
      Flag.mapEffect((values) => {
        const named = list(values);
        const bad = named.find((value) => !isAgent(value));
        return bad === undefined
          ? Effect.succeed(named.filter(isAgent))
          : Effect.fail(
              new CliError.InvalidValue({
                option: "agents",
                value: bad,
                expected: "claude, codex, opencode or cursor",
                kind: "flag",
              }),
            );
      }),
    ),
    launch: Flag.String("launch").pipe(
      Flag.withDescription(
        "The agent to hand the project to: claude, codex, opencode or cursor. Default: the agents setting, then claude, codex, opencode, cursor, whichever is on PATH first. Never with --json or --no-launch.",
      ),
      Flag.mapEffect((value) =>
        isAgent(value)
          ? Effect.succeed(value)
          : Effect.fail(
              new CliError.InvalidValue({
                option: "launch",
                value,
                expected: "claude, codex, opencode or cursor",
                kind: "flag",
              }),
            ),
      ),
      Flag.optional,
    ),
    noLaunch: Flag.Boolean("no-launch").pipe(
      Flag.withDescription(
        "Don't start an agent; print the prompt to give one. --json, a detected agent session or a non-terminal never starts one either.",
      ),
      Flag.withDefault(false),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const host = yield* Host;
      const path = yield* Path.Path;
      const config = yield* AppConfig;
      const processes = yield* Processes;
      const invocation = yield* Invocation;
      const { json } = yield* root;
      const preferred = Option.getOrUndefined(flags.launch);
      // Flag contradictions, before anything is read or written.
      if (preferred && flags.noLaunch)
        return yield* new Usage({ details: { flags: ["--launch", "--no-launch"] } });
      if (preferred && json)
        return yield* new Usage({ details: { flags: ["--launch", "--json"] } });

      const detected = yield* config.agent;
      const configured = (yield* config.get).agents ?? [];
      const launch = !flags.noLaunch;
      // Binaries are looked up only when a launch is still possible.
      const found = new Map<AgentId, string>();
      if (detected === "none" && !json && launch)
        for (const agent of candidates(preferred, configured)) {
          const bin = yield* processes.which(LAUNCH_ARGS[agent].bin);
          if (Option.isSome(bin)) found.set(agent, bin.value);
        }
      const prompt = agentPrompt(host.invocation);
      const project = path.resolve(
        host.cwd,
        Option.getOrElse(flags.dir, () => "."),
      );
      const roots = (yield* defaultRoots).map((entry) =>
        entry.origin === "project" ? { ...entry, path: path.join(project, ".quickstacks") } : entry,
      );
      const { result, decision } = yield* add({
        root: project,
        fragments: flags.fragments,
        sandbox: flags.sandbox,
        yes: flags.yes,
        agents: flags.agents.length ? flags.agents : undefined,
        handoff: (untrusted) =>
          decideHandoff({
            detected,
            json,
            launch,
            stdinIsTTY: host.stdinIsTTY,
            stdoutIsTTY: host.stdoutIsTTY,
            untrusted,
            ...(preferred ? { preferred } : {}),
            configured,
            found,
            prompt,
          }),
      }).pipe(Effect.provide(Registry.layer(roots)));
      yield* invocation.annotate({
        handoff: decision.kind,
        ...(decision.kind === "print" ? {} : { agent: decision.agent }),
      });
      const output = yield* Output;
      const shown = yield* shownPath(host.cwd, result.project);
      // An agent gets every path short when it can be; a human also sees where the project is.
      const untrusted =
        output.audience === "agent"
          ? yield* Effect.forEach(result.untrusted, (entry) =>
              Effect.map(shownPath(host.cwd, entry.dir), (dir) => ({ ...entry, dir })),
            )
          : result.untrusted;
      const summary = [
        `Added ${result.added.map(printable).join(", ")} to ${printable(shown)}`,
        ...(result.written.length ? [`Written: ${result.written.map(printable).join(", ")}`] : []),
        ...(result.skipped.length ? [`Skipped: ${result.skipped.map(printable).join(", ")}`] : []),
        ...result.warnings.map(
          (warning) => `Warning: ${printable(warning.code)}: ${printable(warning.id)}`,
        ),
        ...(result.mergeNeeded.length
          ? [
              "",
              "Merge needed",
              ...result.mergeNeeded.flatMap((item) =>
                item.incoming.map(
                  (incoming) => `  ${printable(item.path)}: ${printable(incoming)}`,
                ),
              ),
            ]
          : []),
        ...result.missingRequired.map(
          (item) => `Missing required: ${printable(item.id)}. Next: ${item.command}`,
        ),
        ...untrusted.map(
          (entry) => `Untrusted: ${printable(entry.id)} (${entry.origin}): ${printable(entry.dir)}`,
        ),
        ...(!result.digestRecorded
          ? [
              `Stop: ask the user to review the new steps and run ${host.invocation} verify --accept-changes in their terminal.`,
            ]
          : []),
        `Brief: ${result.brief}`,
      ].join("\n");
      if (decision.kind !== "launch") {
        yield* output.result(
          Schema.encodeSync(AddResult)({
            ...result,
            handoff: { ...decision, untrusted: [...decision.untrusted], prompt },
          }),
          `${summary}\n\n${renderHandoff(decision, { shown, invocation: host.invocation, audience: output.audience })}`,
        );
        return;
      }
      // Human mode only (--json never launches): the summary reaches the terminal before the
      // agent takes it over, and stays on stdout whatever happens next.
      yield* output.result(
        null,
        `${summary}\n\nLaunching ${printable(decision.bin)} in ${printable(shown)}...`,
      );
      yield* output.flushNow;
      const status = yield* processes
        .interactive({
          bin: decision.bin,
          args: [...decision.args],
          cwd: result.project,
          // The user's own agent: their environment, nothing stripped.
          env: config.childEnv([]),
        })
        .pipe(
          Effect.catchTag("SpawnFailed", (failure) =>
            // Nothing was launched, so the manifest's record says the prompt was left to print.
            Effect.andThen(
              recordPrinted(path.join(result.project, MANIFEST_PATH)),
              failure.errno === "EACCES"
                ? Effect.fail(
                    new PermissionDenied({ details: { reason: "launch", path: decision.bin } }),
                  )
                : Effect.die(failure),
            ),
          ),
        );
      // The project was written; the agent's own status is the invocation's, with no envelope.
      yield* invocation.exitWith(status);
    }),
).pipe(
  Command.withDescription(
    "Apply fragments to an existing repository without overwriting live files. Conflicts are parked under .quickstacks/incoming/ for your agent to merge; verify checks the whole project.",
  ),
);
