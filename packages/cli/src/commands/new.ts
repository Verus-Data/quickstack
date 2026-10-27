import { Effect, Option, Path, Schema } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";
import { AppConfig } from "../config";
import {
  agentPrompt,
  candidates,
  decideHandoff,
  LAUNCH_ARGS,
  renderHandoff,
} from "../core/handoff";
import { MANIFEST_PATH, readManifest, writeManifest } from "../core/manifest";
import { defaultRoots, Registry } from "../core/registry/registry";
import { scaffold } from "../core/scaffold/new";
import { renderNew } from "../core/scaffold/report";
import { shownPath } from "../core/shown-path";
import { printable } from "../core/text";
import { PermissionDenied, Usage } from "../errors";
import { AgentId } from "../schemas/entry";
import { NewResult } from "../schemas/new";
import { Host } from "../services/host";
import { Invocation } from "../services/invocation";
import { Output } from "../services/output";
import { Processes } from "../services/processes";
import { root } from "./root";

/** Repeatable, comma-separated values: `--with a,b --with c` is `[a, b, c]`. */
const list = (values: ReadonlyArray<string>) =>
  values.flatMap((value) => value.split(",").map((part) => part.trim())).filter(Boolean);

const ids = (name: string, description: string) =>
  Flag.String(name).pipe(
    Flag.withDescription(description),
    Flag.atLeast(0),
    Flag.map((values) => list(values)),
  );

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

export const newCommand = Command.make(
  "new",
  {
    stack: Argument.String("stack").pipe(
      Argument.withDescription("The stack to start from (see `list stacks`)."),
    ),
    dir: Argument.String("dir").pipe(
      Argument.withDescription(
        "The project directory: missing, empty, or holding only .git and OS files such as .DS_Store. Defaults to the slug of --name, else ./<stack>; `.` is the current directory.",
      ),
      Argument.optional,
    ),
    name: Flag.String("name").pipe(
      Flag.withDescription("Project name for templates. Default: the directory's base name."),
      Flag.optional,
    ),
    author: Flag.String("author").pipe(
      Flag.withDescription(
        "Author for templates. Default: the author setting, then git user.name, else empty. An empty value suppresses the fallback.",
      ),
      Flag.optional,
    ),
    dryRun: Flag.Boolean("dry-run").pipe(
      Flag.withDescription(
        "Compose and render the plan without writing anything or starting an agent.",
      ),
      Flag.withDefault(false),
    ),
    with: ids("with", "Add optional fragments, comma-separated or repeated."),
    without: ids("without", "Leave out default fragments, comma-separated or repeated."),
    sandbox: Flag.Boolean("sandbox").pipe(
      Flag.withDescription(
        "Local only: every default, no deploy, release or app fragments unless named with --with, steps tagged prod skipped. Implies --yes.",
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
    scope: Flag.String("scope").pipe(
      Flag.withDescription(
        "npm scope for the package_scope template variable, with or without @. Default: the package_scope setting, else none.",
      ),
      Flag.optional,
    ),
    launch: Flag.String("launch").pipe(
      Flag.withDescription(
        "The agent to hand the project to: claude, codex, opencode or cursor. Default: the agents setting, then claude, codex, opencode, cursor, whichever is on PATH first. Never with --json, --no-launch or --dry-run.",
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
      if (preferred && flags.dryRun)
        return yield* new Usage({ details: { flags: ["--dry-run", "--launch"] } });
      if (preferred && flags.noLaunch)
        return yield* new Usage({ details: { flags: ["--launch", "--no-launch"] } });
      if (preferred && json)
        return yield* new Usage({ details: { flags: ["--launch", "--json"] } });

      const detected = yield* config.agent;
      const configured = (yield* config.get).agents ?? [];
      const launch = !flags.noLaunch && !flags.dryRun;
      // Binaries are looked up only when a launch is still possible.
      const found = new Map<AgentId, string>();
      if (detected === "none" && !json && launch)
        for (const agent of candidates(preferred, configured)) {
          const bin = yield* processes.which(LAUNCH_ARGS[agent].bin);
          if (Option.isSome(bin)) found.set(agent, bin.value);
        }
      const prompt = agentPrompt(host.invocation);
      const { result, decision } = yield* scaffold({
        stack: flags.stack,
        dir: Option.getOrUndefined(flags.dir),
        name: Option.getOrUndefined(flags.name),
        author: Option.getOrUndefined(flags.author),
        dryRun: flags.dryRun,
        with: flags.with,
        without: flags.without,
        sandbox: flags.sandbox,
        yes: flags.yes,
        agents: flags.agents.length ? flags.agents : undefined,
        scope: Option.getOrUndefined(flags.scope),
        // A preview hands nothing off, even inside an agent: it only prints the plan.
        handoff: (untrusted) =>
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
                prompt,
              }),
      }).pipe(Effect.provide(Registry.layer(yield* defaultRoots)));
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
      const summary = renderNew({ ...result, untrusted }, { shown, audience: output.audience });
      if (decision.kind !== "launch") {
        yield* output.result(
          Schema.encodeSync(NewResult)({
            ...result,
            handoff: { ...decision, untrusted: [...decision.untrusted], prompt },
          }),
          result.dryRun
            ? summary
            : `${summary}\n\n${renderHandoff(decision, { shown, invocation: host.invocation, audience: output.audience })}`,
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
    "Start a project from a stack: write its starter files and .quickstacks/BRIEF.md, the task for your coding agent. Runs nothing from the stack; verify is the definition of done.",
  ),
);
