import { NodeServices } from "@effect/platform-node";
import { Console, Duration, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { AppConfig, GIT_REPOSITORY_VARIABLES } from "../src/config";
import { targetAgents } from "../src/core/compose/agents";
import { type ComposeOptions, compose } from "../src/core/compose/compose";
import { fingerprint } from "../src/core/fingerprint";
import { appendRecord, readLedger } from "../src/core/ledger";
import { Registry } from "../src/core/registry/registry";
import { printable } from "../src/core/text";
import { AgentId } from "../src/schemas/entry";
import { LedgerRecord } from "../src/schemas/ledger";
import { RunRecord } from "../src/schemas/verify";
import { Foreground, Processes } from "../src/services/processes";

/** Required table fields are parsed explicitly; incomplete notes are reported, never inferred. */
function parseNote(markdown: string) {
  const { fields, required } = noteFields(markdown);
  const { stack, preset, withIds } = noteComposition(required("Stack and fragments"));
  const commit = capture(required("Repo commit"), /`([a-f\d]{7,40})`/i, "Repo commit");
  const agentText = required("Agent");
  const agentName = capture(
    agentText,
    /^(Claude Code|Codex|OpenCode|Cursor)\b/i,
    "Agent",
  ).toLowerCase();
  const agent = Schema.decodeUnknownSync(AgentId)(
    agentName === "claude code" ? "claude" : agentName,
  );
  const agentVersion = capture(agentText, /\b(\d+\.\d+[^\s,]*)/, "Agent version");
  const mode = capture(agentText, /\b(interactive|headless)\b/, "Agent mode");
  const times = required("Times");
  const measurement = (pattern: RegExp, name: string) => {
    const value = capture(times, pattern, name);
    return value === "never" ? null : Number(value);
  };
  const minutesToFirstTest = measurement(
    /first passing `test`-layer step (never|\d+(?:\.\d+)?)\b/,
    "Times first test",
  );
  const minutesToGreen = measurement(/first green `verify` (never|\d+(?:\.\d+)?)\b/, "Times green");
  const interventionsText = required("Interventions");
  const interventions = /^None\b/i.test(interventionsText)
    ? 0
    : Number(capture(interventionsText, /^(\d+)\b/, "Interventions"));
  const { outcome, tamperCheck, agentEnded, run } = noteOutcome({
    outcomeText: required("Outcome"),
    endedText: fields.get("Agent ended"),
    markdown,
  });
  const targetsText = fields.get("Target agents");
  const targets = targetAgents(
    targetsText === undefined
      ? undefined
      : Schema.decodeUnknownSync(Schema.Array(AgentId))(
          targetsText.split(",").map((id) => id.trim().replace(/^`|`$/g, "")),
        ),
    {},
  );
  const cliText = required("CLI");
  const cli = cliText.match(/quickstacks@([^`\s,]+)/)?.[1] ?? run?.cli;
  if (!cli)
    throw new Error("CLI version is missing (include quickstacks@<version> or a final Run record)");
  const agentMinutesText = fields.get("Agent minutes");
  const result = ledgerResult(outcome, tamperCheck, agentEnded);
  return {
    schemaVersion: 1,
    date: capture(markdown, /^# Gate run: .+, (\d{4}-\d{2}-\d{2})\s*$/m, "date"),
    stack,
    with: withIds.sort(),
    preset,
    agent,
    agentVersion,
    targets,
    mode,
    repoCommit: commit,
    cli,
    fingerprint: "",
    briefWords: Number(capture(required("Brief size"), /`briefWords` (\d+)\b/, "Brief size")),
    result,
    agentEnded,
    run,
    verifyRuns: Number(capture(required("Verify count"), /^(\d+)\b/, "Verify count")),
    minutesToGreen,
    minutesToFirstTest,
    agentMinutes:
      agentMinutesText === undefined
        ? null
        : Number(capture(agentMinutesText, /^(\d+(?:\.\d+)?)\b/, "Agent minutes")),
    interventions,
  };
}

const importArguments = (args: string[]) =>
  Effect.gen(function* () {
    let options = true;
    let dryRun = false;
    const notes: string[] = [];
    for (const arg of args) {
      if (!options) {
        notes.push(arg);
        continue;
      }
      if (arg === "--") options = false;
      else if (arg === "--dry-run") dryRun = true;
      else if (arg.startsWith("--")) return yield* Effect.fail(new Error(`Unknown option: ${arg}`));
      else notes.push(arg);
    }
    return { notes, dryRun };
  });

const program = Effect.scoped(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const processes = yield* Processes;
    const env = (yield* AppConfig).childEnv(GIT_REPOSITORY_VARIABLES, { LC_ALL: "C" });
    const cwd = process.cwd();
    const exec = (argv: readonly [string, ...string[]], directory = cwd) =>
      processes
        .exec({
          argv,
          cwd: directory,
          env,
          timeout: Duration.seconds(30),
        })
        .pipe(
          Effect.flatMap((result) =>
            result.exitCode === 0 && !result.timedOut && !result.truncated
              ? Effect.succeed(result.stdout.trim())
              : Effect.fail(new Error(`${argv[0]} failed`)),
          ),
        );
    const { notes, dryRun } = yield* importArguments(process.argv.slice(2));
    if (!notes.length)
      return yield* Effect.fail(new Error("Usage: ledger-import.ts <notes>... [--dry-run]"));
    const root = yield* exec(["git", "rev-parse", "--show-toplevel"]);
    const registry = path.join(root, "packages/cli/registry");
    const existing = yield* readLedger(registry);
    const records: LedgerRecord[] = [];
    let failed = false;
    for (const note of notes) {
      const imported = yield* Effect.result(
        Effect.scoped(
          Effect.gen(function* () {
            const text = yield* fs.readFileString(path.resolve(cwd, note));
            const parsed = yield* Effect.try({
              try: () => parseNote(text),
              catch: (error) => error,
            });
            const commit = yield* exec(
              ["git", "rev-parse", "--verify", `${parsed.repoCommit}^{commit}`],
              root,
            );
            if (
              [...existing.records, ...records].some(
                (record) =>
                  record.repoCommit === commit &&
                  record.stack === parsed.stack &&
                  record.date === parsed.date,
              )
            )
              return null;
            const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "quickstacks-ledger-" });
            const archive = path.join(temporary, "registry.tar");
            yield* exec(
              [
                "git",
                "archive",
                "--format=tar",
                `--output=${archive}`,
                commit,
                "packages/cli/registry",
              ],
              root,
            );
            yield* exec(["tar", "-xf", archive, "-C", temporary]);
            const oldRegistry = path.join(temporary, "packages/cli/registry");
            const record = yield* Effect.gen(function* () {
              const options: ComposeOptions = {
                stack: parsed.stack,
                with: parsed.with,
                without: [],
                preset: Schema.decodeUnknownSync(Schema.Literals(["default", "sandbox"]))(
                  parsed.preset,
                ),
                agents: parsed.targets,
                always: [],
                mode: "new",
              };
              const composition = yield* compose(options);
              const baseline = yield* compose({ ...options, with: [] });
              const defaults = new Set(baseline.fragments.map((entry) => entry.id));
              return yield* Schema.decodeUnknownEffect(LedgerRecord)({
                ...parsed,
                repoCommit: commit,
                with: parsed.with.filter((id) => !defaults.has(id)),
                fingerprint: yield* fingerprint(composition),
                note: path.relative(root, path.resolve(cwd, note)).split(path.sep).join("/"),
              });
            }).pipe(Effect.provide(Registry.layer([{ origin: "bundled", path: oldRegistry }])));
            if (!dryRun) yield* appendRecord(registry, record);
            return record;
          }),
        ),
      );
      if (imported._tag === "Failure") {
        failed = true;
        const error = imported.failure;
        const reason = error instanceof Error ? error.message : "Could not import note";
        yield* Console.error(`${printable(note)}: ${printable(reason)}`);
      } else if (imported.success !== null) records.push(imported.success);
    }
    if (dryRun) yield* Console.log(JSON.stringify(records, null, 2));
    else yield* Console.log(`Imported ${records.length} record(s).`);
    return failed ? 1 : 0;
  }),
);

const platform = Layer.merge(NodeServices.layer, Foreground.layer(Foreground.make()));
const layer = Processes.layer.pipe(
  Layer.provideMerge(AppConfig.layer()),
  Layer.provideMerge(platform),
);
process.exitCode = await Effect.runPromise(
  program.pipe(
    Effect.catch((error) =>
      Console.error(error instanceof Error ? error.message : "Import failed").pipe(Effect.as(1)),
    ),
    Effect.provide(layer),
  ),
);

function noteFields(markdown: string) {
  const fields = new Map<string, string>();
  for (const line of markdown.split(/\r?\n/)) {
    const row = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/.exec(line);
    if (row?.[1] && row[2]) fields.set(row[1], row[2]);
  }
  const required = (name: string) => {
    const value = fields.get(name);
    if (!value) throw new Error(`Missing ${name}`);
    return value;
  };
  return { fields, required };
}

function capture(value: string, pattern: RegExp, name: string) {
  const matched = pattern.exec(value)?.[1];
  if (matched === undefined) throw new Error(`Invalid ${name}`);
  return matched;
}

function noteComposition(composition: string) {
  const stack = capture(composition, /^`([^`]+)`/, "Stack and fragments");
  const preset = capture(composition, /preset `([^`]+)`/, "preset");
  if (preset !== "default" && preset !== "sandbox") throw new Error("Invalid preset");
  const fragments =
    composition.slice(composition.indexOf("`", 1) + 1).split(/,?\s*preset /)[0] ?? "";
  if (!/no added fragments|\bwith\b/.test(fragments))
    throw new Error("Invalid Stack and fragments");
  const withIds = [...fragments.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1])
    .filter((id) => id !== undefined);
  return { stack, preset, withIds };
}

type NoteOutcomeInput = { outcomeText: string; endedText: string | undefined; markdown: string };
function noteOutcome({ outcomeText, endedText, markdown }: NoteOutcomeInput) {
  const outcome = capture(outcomeText, /`(green|partial|failed|infra)`/, "Outcome");
  const tamperCheck = capture(
    outcomeText,
    /tamperCheck: "(full|manifest-only)"/,
    "Outcome tamperCheck",
  );
  const agentEnded =
    endedText === undefined
      ? "exit"
      : capture(endedText, /\b(exit|error|timeout)\b/, "Agent ended");
  const recordSection = markdown.match(/^## Run record\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1];
  const json = recordSection?.match(/```json\s*\n([\s\S]*?)\n```/)?.[1];
  if (recordSection && !json) throw new Error("Invalid final Run record");
  const run = json === undefined ? null : Schema.decodeUnknownSync(RunRecord)(JSON.parse(json));
  if (
    run &&
    (run.tamperCheck !== tamperCheck ||
      ((outcome === "green" || outcome === "partial") && run.outcome !== "green"))
  )
    throw new Error("Outcome contradicts the final Run record");
  return { outcome, tamperCheck, agentEnded, run };
}

function ledgerResult(outcome: string, tamperCheck: string, agentEnded: string) {
  if (outcome === "partial") return "partial";
  if (outcome === "infra") return "infra";
  return outcome === "green" && tamperCheck === "full" && agentEnded === "exit" ? "pass" : "fail";
}
