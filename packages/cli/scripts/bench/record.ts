import { Effect, FileSystem, Path, Schema } from "effect";
import { appendRecord } from "../../src/core/ledger";
import { LedgerRecord } from "../../src/schemas/ledger";
import { Output } from "../../src/services/output";
import type { Prepared } from "./prepare";
import type { AgentRun } from "./run";
import { classify, type Verified } from "./verify";

export const record = (prepared: Prepared, agent: AgentRun, verified: Verified) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const output = yield* Output;
    const date = prepared.date;
    const result = classify(agent, verified);
    let note: string | undefined;
    if (!prepared.options.noRecord) {
      const base = `plans/runs/${date}-${prepared.options.stack}`;
      note = `${base}.md`;
      for (let n = 2; yield* fs.exists(path.join(prepared.repo, note)); n++)
        note = `${base}-${n}.md`;
    }
    const row = yield* Schema.decodeUnknownEffect(LedgerRecord)({
      schemaVersion: 1,
      date,
      stack: prepared.options.stack,
      with: prepared.added,
      preset: prepared.options.preset,
      agent: prepared.adapter.id,
      agentVersion: prepared.agentVersion,
      mode: "headless",
      repoCommit: prepared.repoCommit,
      cli: prepared.cliVersion,
      fingerprint: prepared.fingerprint,
      briefWords: prepared.briefWords,
      result,
      agentEnded: agent.ended,
      run: verified.run,
      verifyRuns: verified.verifyRuns,
      minutesToGreen: verified.minutesToGreen,
      minutesToFirstTest: verified.minutesToFirstTest,
      agentMinutes: agent.minutes,
      interventions: verified.interventions,
      hooksFired: agent.hooks,
      ...(prepared.options.existing ? { continued: true } : {}),
      ...(note ? { note } : {}),
    });
    if (note) {
      const fragments = row.with.length
        ? `with ${row.with.map((id) => `\`${id}\``).join(", ")}`
        : "no added fragments";
      const outcome = result === "pass" ? "green" : result === "infra" ? "infra" : "failed";
      const markdown = `# Gate run: ${row.stack}, ${date}

| Field | Value |
|---|---|
| Stack and fragments | \`${row.stack}\`, ${fragments}, preset \`${row.preset}\` |
| Repo commit | \`${row.repoCommit}\` |
| CLI | Compiled dev binary quickstacks@${row.cli}, installed with the working registry |
| Agent | ${row.agent === "claude" ? "Claude Code" : row.agent} ${row.agentVersion}, headless; ${prepared.agentChoice} |
| Target agents | \`${row.agent}\` |
| Brief size | \`briefWords\` ${row.briefWords}, \`fixedWords\` ${prepared.fixedWords} |
| Times | first passing \`test\`-layer step ${row.minutesToFirstTest ?? "never"} min; first green \`verify\` ${row.minutesToGreen ?? "never"} min |
| Verify count | ${row.verifyRuns} agent runs; ${verified.wrapperCalls} wrapper calls${row.verifyRuns === verified.wrapperCalls ? "" : "; mismatch: agent may have called verify another way"} |
| Interventions | ${row.interventions ?? "unknown (NOTES.md missing)"} |
| Outcome | \`${outcome}\`, tamperCheck: "${row.run?.tamperCheck ?? "unknown"}"; ledger result ${result} |
| Agent ended | ${row.agentEnded}${agent.subtype ? ` (${agent.subtype})` : ""}; ${agent.turns ?? "unknown"} turns |
| Agent minutes | ${row.agentMinutes} |
| Hooks fired | ${row.hooksFired === null ? "unknown" : row.hooksFired?.join(", ") || "none"} |
${verified.minutesToBase === null ? "" : `| Time to green base | ${verified.minutesToBase} min |\n`}
This run has not been reviewed. Read the notes and relabel partial if a deliverable is missing.
${prepared.options.existing ? `\nContinued an earlier run${prepared.previousNote ? `: [previous note](${path.basename(prepared.previousNote)})` : " (no recorded note)"}. The continuation counts as one intervention.\n` : ""}
## Agent notes

${verified.notes ?? "NOTES.md missing."}

## Run record

\`\`\`json
${JSON.stringify(row.run)}
\`\`\`
`;
      yield* fs.makeDirectory(path.join(prepared.repo, "plans/runs"), { recursive: true });
      yield* fs.writeFileString(path.join(prepared.repo, note), markdown, { flag: "wx" });
      if (prepared.previousNote)
        yield* fs.writeFileString(
          path.join(prepared.repo, prepared.previousNote),
          `\nContinued in [${path.basename(note)}](${path.basename(note)}).\n`,
          { flag: "a" },
        );
      yield* fs.writeFileString(
        path.join(prepared.bench, "state.json"),
        JSON.stringify({
          with: prepared.added,
          ports: prepared.ports,
          fixedWords: prepared.fixedWords,
          note,
        }),
      );
      const appended = yield* Effect.result(appendRecord(prepared.registry, row));
      if (appended._tag === "Failure") {
        yield* output.note(
          `Could not append ledger; run note saved at ${note}. Recover this record:`,
        );
        yield* output.note(JSON.stringify(Schema.encodeSync(LedgerRecord)(row)));
        return 3;
      }
    }
    yield* output.result(
      row,
      `Bench ${row.stack}: ${result}, agent ended ${row.agentEnded}.\n${note ? `Note: ${note}\n` : ""}${prepared.options.keep ? `Kept: ${prepared.root}\n` : ""}Next: read the notes and verify record${note ? ", then commit the reviewed note and ledger" : ""}.`,
    );
    return 0;
  });
