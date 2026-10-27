import { Effect, Result } from "effect";
import type { Finding } from "../../schemas/validate";
import { proseLines } from "../brief/headings";
import { runnerTarget, shellWords } from "./commands";
import { sourceOf, uniqueFindings } from "./composed";
import type { Source } from "./sources";
import { type Check, finding } from "./view";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function hookCommands(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(hookCommands);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === "command" && typeof item === "string" ? [item] : hookCommands(item),
  );
}
function launchTarget(value: unknown): string | undefined {
  const args = strings(value);
  const target = args[0] === "run" ? args[1] : args[0];
  return target && !/^[-/.$]/.test(target) && !/[/.$]/.test(target) ? target : undefined;
}

export const shippedReferenceChecks: Check = (view) =>
  Effect.gen(function* () {
    const findings: Finding[] = [];
    const sourceJson = new Map<Source, unknown>();
    const parsedSource = (source: Source): unknown => {
      if (!sourceJson.has(source)) {
        const parsed = Result.try(() => JSON.parse(source.text) as unknown);
        sourceJson.set(source, Result.isSuccess(parsed) ? parsed.success : undefined);
      }
      return sourceJson.get(source);
    };
    for (const snapshot of (yield* view.composed).snapshots) {
      const { composition, files } = snapshot;
      const paths = new Set(files.map((file) => file.path));
      const named = new Set(
        [composition.stack, ...composition.fragments].flatMap((entry) =>
          proseLines(entry.body).flatMap((line) =>
            [...line.text.matchAll(/`([A-Za-z][\w:-]*)(?=[`\s])/g)].flatMap((match) =>
              match[1] ? [match[1]] : [],
            ),
          ),
        ),
      );
      const declared = (target: string) =>
        Object.hasOwn(composition.commands, target) || named.has(target);
      for (const file of files) {
        if (file.path !== ".claude/settings.json" && !/^\.vscode\/[^/]+\.json$/.test(file.path))
          continue;
        const text = new TextDecoder().decode(file.bytes);
        const emit = (
          check: string,
          severity: Finding["severity"],
          needle: string,
          message: string,
          matches?: (json: unknown) => boolean,
        ) => {
          const source = sourceOf(
            view,
            snapshot,
            file,
            needle,
            matches ? (source) => matches(parsedSource(source)) : undefined,
          );
          if (!source || !view.entries.some((entry) => entry.dir === source.entry.dir)) return;
          findings.push(
            finding(source.entry, {
              check,
              severity,
              file: view.file(source.entry, source.source.source),
              ...(source.line === undefined ? {} : { line: source.line }),
              message: `${file.path}: ${message}`,
            }),
          );
        };
        const decoded = Result.try(() => JSON.parse(text) as unknown);
        if (Result.isFailure(decoded)) {
          emit("ref-json", "error", "", "invalid JSON; references were skipped");
          continue;
        }
        const json = decoded.success;
        if (file.path === ".claude/settings.json" && isRecord(json)) {
          const permissions = isRecord(json.permissions) ? json.permissions : {};
          for (const list of ["allow", "deny"])
            for (const rule of strings(permissions[list])) {
              const command = /^Bash\((.*)\)$/s.exec(rule)?.[1];
              const target = command === undefined ? undefined : runnerTarget(command);
              if (!target || declared(target)) continue;
              emit(
                "ref-command",
                "error",
                rule,
                `${list} rule runs ${target}, which no composed entry declares in commands or inline code`,
                (json) =>
                  isRecord(json) &&
                  isRecord(json.permissions) &&
                  strings(json.permissions[list]).includes(rule),
              );
            }
          for (const command of hookCommands(json.hooks)) {
            for (const word of shellWords(command)) {
              const target = /\$\{?CLAUDE_PROJECT_DIR\}?\/(\.claude\/hooks\/.+)$/.exec(word)?.[1];
              if (!target || paths.has(target)) continue;
              emit(
                "ref-hook",
                "error",
                command,
                `hook references ${target}, which no composed entry ships`,
                (json) => isRecord(json) && hookCommands(json.hooks).includes(command),
              );
            }
          }
        }
        if (file.path === ".vscode/launch.json" && isRecord(json)) {
          for (const config of Array.isArray(json.configurations) ? json.configurations : []) {
            if (!isRecord(config)) continue;
            for (const field of ["args", "runtimeArgs"]) {
              const target = launchTarget(config[field]);
              if (!target || declared(target)) continue;
              emit(
                "ref-command",
                "error",
                JSON.stringify(target),
                `${field} runs ${target}, which no composed entry declares in commands or inline code`,
                (json) =>
                  isRecord(json) &&
                  Array.isArray(json.configurations) &&
                  json.configurations.some(
                    (config) => isRecord(config) && launchTarget(config[field]) === target,
                  ),
              );
            }
          }
        }
        const portVars = Object.keys(composition.env).filter((name) =>
          /(?:^|_)PORT(?:_|$)/.test(name),
        );
        if (portVars.length)
          for (const literal of new Set(
            [...text.matchAll(/\b(?:localhost|127\.0\.0\.1):\d+/g)].map((match) => match[0]),
          )) {
            emit(
              "ref-port",
              "warning",
              literal,
              `literal ${literal} hardcodes a port declared by ${portVars.join(", ")}`,
            );
          }
      }
    }
    return { findings: uniqueFindings(findings) };
  });
