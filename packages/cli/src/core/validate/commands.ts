import { Effect } from "effect";
import type { Finding } from "../../schemas/validate";
import type { Composition } from "../compose/compose";
import { uniqueFindings } from "./composed";
import { type Check, entryFile, finding } from "./view";

/** Literal shell words for static references; expansions remain text and nothing is executed. */
export function shellWords(command: string): string[] {
  return shellTokens(command)
    .filter((token) => !token.operator || token.word !== "\n")
    .map((token) => token.word);
}

type Heredoc = { delimiter: string; stripTabs: boolean; quoted: boolean };

function heredocEnd(command: string, start: number, heredoc: Heredoc): number {
  let offset = start;
  let line = "";
  while (offset < command.length) {
    const newline = command.indexOf("\n", offset);
    const end = newline < 0 ? command.length : newline;
    line += command.slice(offset, end);
    const backslashes = /\\+$/.exec(line)?.[0].length ?? 0;
    if (!heredoc.quoted && newline >= 0 && backslashes % 2 === 1) line = line.slice(0, -1);
    else {
      if ((heredoc.stripTabs ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) return end;
      line = "";
    }
    offset = end + 1;
  }
  return command.length;
}

function shellTokens(command: string) {
  const words: { word: string; operator: boolean }[] = [];
  const heredocs: Heredoc[] = [];
  let delimiterTabs: boolean | undefined;
  let word = "";
  let quote: string | undefined;
  let wordQuoted = false;
  let active = false;
  const finish = () => {
    if (active) {
      words.push({ word, operator: false });
      if (delimiterTabs !== undefined) {
        heredocs.push({ delimiter: word, stripTabs: delimiterTabs, quoted: wordQuoted });
        delimiterTabs = undefined;
      }
    }
    word = "";
    wordQuoted = false;
    active = false;
  };
  for (let index = 0; index < command.length; index++) {
    const char = command[index] ?? "";
    if (quote) {
      index = quotedCharacter(index, char);
    } else index = unquotedCharacter(index, char);
  }
  finish();
  return words;

  function unquotedCharacter(index: number, char: string): number {
    if (/["']/.test(char)) {
      quote = char;
      wordQuoted = true;
      active = true;
      return index;
    }
    if (char === "\\") return escapedCharacter(index);
    if (/\s/.test(char)) return whitespace(index, char);
    if (char === "#" && !active) {
      const newline = command.indexOf("\n", index);
      return newline < 0 ? command.length : newline - 1;
    }
    if (/[;&|()<>]/.test(char)) return operator(index, char);
    word += char;
    active = true;
    return index;
  }

  function escapedCharacter(index: number): number {
    if (command[index + 1] === "\n") return index + 1;
    wordQuoted = true;
    word += command[index + 1] ?? "";
    active = true;
    return index + 1;
  }

  function whitespace(index: number, char: string): number {
    finish();
    if (char !== "\n") return index;
    words.push({ word: char, operator: true });
    for (const heredoc of heredocs.splice(0)) index = heredocEnd(command, index + 1, heredoc);
    return index;
  }

  function heredocRedirect(index: number): number {
    finish();
    if (command[index + 2] === "<") {
      words.push({ word: "<<<", operator: true });
      return index + 2;
    }
    delimiterTabs = command[index + 2] === "-";
    words.push({ word: delimiterTabs ? "<<-" : "<<", operator: true });
    return index + (delimiterTabs ? 2 : 1);
  }

  function operator(index: number, char: string): number {
    if (char === "<" && command[index + 1] === "<") return heredocRedirect(index);
    finish();
    words.push({ word: char, operator: true });
    return index;
  }

  function quotedCharacter(index: number, char: string): number {
    if (char === "\\" && quote === '"' && command[index + 1] === "\n") return index + 1;
    if (char === quote) quote = undefined;
    else if (char === "\\" && quote === '"' && /["\\$`]/.test(command[index + 1] ?? ""))
      word += command[++index] ?? "";
    else word += char;
    return index;
  }
}

/** A complete project-command token, with Claude's permission wildcard removed separately. */
export function runnerTarget(command: string): string | undefined {
  return runnerWordTarget(shellWords(command));
}

function runnerWordTarget(words: readonly string[]): string | undefined {
  const [runner, second] = words;
  let target: string | undefined;
  if (runner === "make") target = second;
  else if ((runner === "bun" || runner === "npm") && second === "run") target = words[2];
  else if (runner === "pnpm" || runner === "yarn") target = words[second === "run" ? 2 : 1];
  if (!target || /^[-$;&|()<>]/.test(target)) return undefined;
  return target.replace(/:\*$/, "");
}

function runnerTargets(command: string): string[] {
  const targets: string[] = [];
  let words: string[] = [];
  const finish = () => {
    const target = runnerWordTarget(words);
    if (target) targets.push(target);
    words = [];
  };
  for (const token of shellTokens(command)) {
    if (token.operator && /[;&|()\n]/.test(token.word)) finish();
    else words.push(token.word);
  }
  finish();
  return targets;
}

export const commandChecks: Check = (view) =>
  Effect.gen(function* () {
    const findings: Finding[] = [];
    const checkSteps = (composition: Composition) => {
      const entries = [composition.stack, ...composition.fragments];
      for (const step of composition.verify) {
        const target = runnerTarget(step.run);
        if (!target || Object.hasOwn(composition.commands, target)) continue;
        const owner = entries.find(
          (entry) => entry.kind === step.owner.kind && entry.id === step.owner.id,
        );
        if (!owner || !view.entries.some((entry) => entry.dir === owner.dir)) continue;
        findings.push(
          finding(owner, {
            check: "undeclared-command",
            severity: "warning",
            file: entryFile(view, owner),
            message: `${composition.stack.id}: verify step ${step.name} runs ${target}, which is missing from the composed commands table`,
          }),
        );
      }
    };
    const checkCoverage = (composition: Composition) => {
      const ran = new Set(composition.verify.flatMap((step) => runnerTargets(step.run)));
      const checkFragment = (fragment: Composition["fragments"][number]) => {
        if (!view.entries.some((entry) => entry.dir === fragment.dir)) return;
        for (const command of Object.keys(fragment.meta.commands)) {
          if (ran.has(command) || Object.hasOwn(composition.stack.meta.commands, command)) continue;
          findings.push(
            finding(fragment, {
              check: "ref-command-coverage",
              severity: "warning",
              file: entryFile(view, fragment),
              message: `command ${command} is a deliverable in the commands table, but no verify step runs it`,
            }),
          );
        }
      };
      for (const fragment of composition.fragments) checkFragment(fragment);
    };
    for (const { composition } of (yield* view.composed).snapshots) {
      checkSteps(composition);
      checkCoverage(composition);
    }
    return { findings: uniqueFindings(findings) };
  });
