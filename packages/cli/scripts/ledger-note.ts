import { Schema } from "effect";
import { targetAgents } from "../src/core/compose/agents";
import { AgentId } from "../src/schemas/entry";
import { RunRecord } from "../src/schemas/verify";

/** Required table fields are parsed explicitly; incomplete notes are reported, never inferred. */
export function parseLedgerNote(markdown: string) {
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
  const cli = cliText.match(/stacks@([^`\s,]+)/)?.[1] ?? run?.cli;
  if (!cli)
    throw new Error("CLI version is missing (include stacks@<version> or a final Run record)");
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
