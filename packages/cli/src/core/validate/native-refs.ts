import { Result } from "effect";
import { runnerTarget } from "./commands";
import {
  decodedNativeCommands,
  decodedNativeSourceCommands,
  type NativeCommand,
  parseNativeConfig,
} from "./native-config";
import type { ReferenceIssue } from "./reference-issue";

export function nativeReferences(
  path: string,
  text: string,
  context: { paths: ReadonlySet<string>; declared: (target: string) => boolean },
): ReferenceIssue[] {
  const parsed = Result.try(() => parseNativeConfig(path, text));
  if (Result.isFailure(parsed))
    return [invalid(path.endsWith(".toml") ? "ref-toml" : "ref-json", "syntax")];
  const decoded = decodedNativeCommands(path, parsed.success);
  if (Result.isFailure(decoded)) return [invalid("ref-config", "structure")];
  return decoded.success.flatMap((command) => commandReferences(path, command, context));
}

function invalid(check: string, kind: string): ReferenceIssue {
  return {
    check,
    severity: "error",
    needle: "",
    message: `invalid config ${kind}; references were skipped`,
  };
}

function commandReferences(
  path: string,
  command: NativeCommand,
  { paths, declared }: { paths: ReadonlySet<string>; declared: (target: string) => boolean },
): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  // Preserve argv boundaries, including literal paths with spaces, when reusing runnerTarget.
  const target = runnerTarget(
    command.words.map((word) => `'${word.replaceAll("'", `'\\''`)}'`).join(" "),
  );
  const matches = (value: unknown) => {
    const source = decodedNativeSourceCommands(path, value);
    return (
      Result.isSuccess(source) &&
      source.success.some(
        (item) =>
          item.permission === command.permission &&
          JSON.stringify(item.words) === JSON.stringify(command.words),
      )
    );
  };
  const script = scriptOperand(command.words);
  if (target && !script && !/[*?]/.test(target) && !declared(target))
    issues.push({
      check: "ref-command",
      severity: "error",
      needle: target,
      message: `config runs ${target}, which no composed entry declares in commands`,
      matches,
    });
  if (command.permission || !script) return issues;
  const file = script
    .replace(/^\$\{?(?:CODEX_PROJECT_DIR|CURSOR_PROJECT_DIR)\}?\//, "")
    .replace(/^\.\//, "");
  if (!/^[-/$~]/.test(file) && !/[:*?]/.test(file) && !paths.has(file))
    issues.push({
      check: "ref-hook",
      severity: "error",
      needle: script,
      message: `hook references ${file}, which no composed entry ships`,
      matches,
    });
  return issues;
}

/** Only the executable or its interpreter's script is a shipped-file operand. */
function scriptOperand(words: readonly string[]): string | undefined {
  const executable = words[0];
  if (!executable) return undefined;
  const runtime = executable.slice(executable.lastIndexOf("/") + 1);
  if (!["sh", "bash", "zsh", "node", "python", "python3", "bun"].includes(runtime))
    return executable.includes("/") ? executable : undefined;
  const script = words[runtime === "bun" && words[1] === "run" ? 2 : 1];
  if (!script || /^[-;&|()<>]/.test(script)) return undefined;
  // bun run <name> is a command-table reference unless its operand is a path.
  return runtime === "bun" && words[1] === "run" && !script.includes("/") ? undefined : script;
}
