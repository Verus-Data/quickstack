import { Effect } from "effect";
import type { Finding } from "../../schemas/validate";
import type { Composition } from "../compose/compose";
import { uniqueFindings } from "./composed";
import { type Check, entryFile, finding } from "./view";

/** Literal shell words for static references; expansions remain text and nothing is executed. */
export function shellWords(command: string): string[] {
  const words: string[] = [];
  let word = "";
  let quote: string | undefined;
  let active = false;
  const finish = () => {
    if (active) words.push(word);
    word = "";
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
      active = true;
      return index;
    }
    if (char === "\\") {
      word += command[++index] ?? "";
      active = true;
      return index;
    }
    if (/\s/.test(char)) {
      finish();
      return index;
    }
    if (char === "#" && !active) {
      const newline = command.indexOf("\n", index);
      return newline < 0 ? command.length : newline;
    }
    if (/[;&|()<>]/.test(char)) {
      finish();
      words.push(char);
      return index;
    }
    word += char;
    active = true;
    return index;
  }

  function quotedCharacter(index: number, char: string): number {
    if (char === quote) quote = undefined;
    else if (char === "\\" && quote === '"' && /["\\$`]/.test(command[index + 1] ?? ""))
      word += command[++index] ?? "";
    else word += char;
    return index;
  }
}

/** A complete project-command token, with Claude's permission wildcard removed separately. */
export function runnerTarget(command: string): string | undefined {
  const words = shellWords(command);
  const [runner, second] = words;
  let target: string | undefined;
  if (runner === "make") target = second;
  else if ((runner === "bun" || runner === "npm") && second === "run") target = words[2];
  else if (runner === "pnpm" || runner === "yarn") target = words[second === "run" ? 2 : 1];
  if (!target || /^[-$;&|()<>]/.test(target)) return undefined;
  return target.replace(/:\*$/, "");
}

export function runnerTargets(command: string): string[] {
  return command.split(/&&|\|\||[;|]/).flatMap((part) => {
    const target = runnerTarget(part);
    return target ? [target] : [];
  });
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
