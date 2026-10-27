import { Effect } from "effect";
import type { Finding } from "../../schemas/validate";
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
      if (char === quote) quote = undefined;
      else if (char === "\\" && quote === '"' && /["\\$`]/.test(command[index + 1] ?? ""))
        word += command[++index] ?? "";
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      active = true;
    } else if (char === "\\") {
      word += command[++index] ?? "";
      active = true;
    } else if (/\s/.test(char)) finish();
    else if (char === "#" && !active) {
      const newline = command.indexOf("\n", index);
      if (newline < 0) break;
      index = newline;
    } else if (/[;&|()<>]/.test(char)) {
      finish();
      words.push(char);
    } else {
      word += char;
      active = true;
    }
  }
  finish();
  return words;
}

/** A complete project-command token, with Claude's permission wildcard removed separately. */
export function runnerTarget(command: string): string | undefined {
  const words = shellWords(command);
  const [runner, second] = words;
  const target =
    runner === "make"
      ? second
      : (runner === "bun" || runner === "npm") && second === "run"
        ? words[2]
        : runner === "pnpm" || runner === "yarn"
          ? words[second === "run" ? 2 : 1]
          : undefined;
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
    for (const { composition } of (yield* view.composed).snapshots) {
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
      const ran = new Set(composition.verify.flatMap((step) => runnerTargets(step.run)));
      for (const fragment of composition.fragments) {
        if (!view.entries.some((entry) => entry.dir === fragment.dir)) continue;
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
      }
    }
    return { findings: uniqueFindings(findings) };
  });
