import { Result, Schema } from "effect";
import { parse as parseToml } from "smol-toml";
import { shellWords } from "./commands";

const record = Schema.Record(Schema.String, Schema.Unknown);
/** Reject misspellings of known keys without closing unrelated agent settings. */
function referenceStruct<const Fields extends Schema.Struct.Fields>(fields: Fields) {
  return record
    .check(
      Schema.makeFilter((value) => {
        const keys = Object.keys(fields);
        return (
          Object.keys(value).every(
            (key) =>
              !keys.some(
                (expected) => expected !== key && expected.toLowerCase() === key.toLowerCase(),
              ),
          ) || "wrong-case reference config key"
        );
      }),
    )
    .pipe(Schema.decodeTo(Schema.Struct(fields)));
}

const codexEvents = [
  "SessionStart",
  "SessionEnd",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "UserPromptSubmit",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "Interrupt",
  "PreCompact",
  "PostCompact",
];
const cursorEvents = [
  "sessionStart",
  "sessionEnd",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "subagentStart",
  "subagentStop",
  "beforeShellExecution",
  "afterShellExecution",
  "beforeMCPExecution",
  "afterMCPExecution",
  "beforeReadFile",
  "afterFileEdit",
  "beforeSubmitPrompt",
  "preCompact",
  "stop",
  "afterAgentResponse",
  "afterAgentThought",
  "beforeTabFileRead",
  "afterTabFileEdit",
  "workspaceOpen",
];

/** Reject a known event spelled in the wrong case; an event the CLI doesn't know yet passes. */
function eventRecord<Value extends Schema.Constraint>(events: readonly string[], value: Value) {
  return Schema.Record(Schema.String, value).check(
    Schema.makeFilter(
      (hooks) =>
        Object.keys(hooks).every(
          (event) =>
            events.includes(event) ||
            !events.some((known) => known.toLowerCase() === event.toLowerCase()),
        ) || "wrong-case hook event",
    ),
  );
}

const commandHook = referenceStruct({
  type: Schema.Literal("command"),
  command: Schema.String,
  timeout: Schema.optionalKey(Schema.Number),
  statusMessage: Schema.optionalKey(Schema.String),
  async: Schema.optionalKey(Schema.Boolean),
});
const hookGroup = referenceStruct({
  matcher: Schema.optionalKey(Schema.String),
  hooks: Schema.Array(commandHook),
});
const codexHooks = referenceStruct({
  hooks: eventRecord(codexEvents, Schema.Array(hookGroup)),
});
const cursorHook = referenceStruct({
  command: Schema.String,
  matcher: Schema.optionalKey(Schema.String),
  timeout: Schema.optionalKey(Schema.Number),
  loop_limit: Schema.optionalKey(Schema.NullOr(Schema.Number)),
});
const cursorHookMap = eventRecord(cursorEvents, Schema.Array(cursorHook));
const cursorHooks = referenceStruct({ version: Schema.Literal(1), hooks: cursorHookMap });
// Merge contributors may supply hooks while another owner supplies the version.
const cursorContribution = referenceStruct({ hooks: cursorHookMap });
const action = Schema.Literals(["allow", "ask", "deny"]);
const permissionRule = Schema.Union([action, Schema.Record(Schema.String, action)]);
const openCodeConfig = referenceStruct({
  formatter: Schema.optionalKey(
    Schema.Union([
      Schema.Literal(false),
      Schema.Record(
        Schema.String,
        referenceStruct({
          command: Schema.optionalKey(Schema.Array(Schema.String)),
          extensions: Schema.optionalKey(Schema.Array(Schema.String)),
          disabled: Schema.optionalKey(Schema.Boolean),
          environment: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
        }),
      ),
    ]),
  ),
  permission: Schema.optionalKey(
    Schema.Union([
      action,
      Schema.Record(Schema.String, permissionRule).check(
        Schema.makeFilter(
          (rules) =>
            !Object.keys(rules).some((key) => key !== "bash" && key.toLowerCase() === "bash") ||
            "wrong-case bash permission key",
        ),
      ),
    ]),
  ),
});

export type NativeCommand = { words: readonly string[]; permission: boolean };

export function isNativeConfig(path: string): boolean {
  return [
    ".codex/hooks.json",
    ".codex/config.toml",
    ".cursor/hooks.json",
    "opencode.json",
    "opencode.jsonc",
  ].includes(path);
}

/** Strip only JSONC comments and trailing commas; JSON.parse still owns JSON syntax. */
function parseJsonc(text: string): unknown {
  const stringsOrComments = /"(?:[^"\\]|\\.)*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g;
  const uncommented = text.replace(stringsOrComments, (token) =>
    token.startsWith("/") ? token.replace(/[^\r\n]/g, " ") : token,
  );
  return JSON.parse(
    uncommented.replace(/"(?:[^"\\]|\\.)*"|,(?=\s*[}\]])/g, (token) =>
      token === "," ? " " : token,
    ),
  );
}

export function parseNativeConfig(path: string, text: string): unknown {
  if (path === ".codex/config.toml") return parseToml(text);
  return path.startsWith("opencode.") ? parseJsonc(text) : JSON.parse(text);
}

/** Decode the reference-bearing subset, permitting unrelated agent settings to evolve. */
function nativeCommands(path: string, value: unknown): NativeCommand[] {
  const root = Schema.decodeUnknownSync(record)(value);
  rejectWrongCase(root, ["hooks", "formatter", "permission", "version"]);
  if (path.startsWith("opencode.")) return openCodeCommands(value);
  // A policy-only Codex TOML file has no hooks to check.
  if (path === ".codex/config.toml" && !Object.hasOwn(root, "hooks")) return [];
  if (path === ".cursor/hooks.json") {
    const config = Schema.decodeUnknownSync(cursorHooks)(value);
    return cursorCommands(config.hooks);
  }
  const config = Schema.decodeUnknownSync(codexHooks)(value);
  return Object.values(config.hooks).flatMap((groups) =>
    groups.flatMap((group) => group.hooks.map((hook) => shellCommand(hook.command))),
  );
}

function rejectWrongCase(root: Record<string, unknown>, keys: readonly string[]) {
  for (const key of Object.keys(root))
    if (keys.some((expected) => expected !== key && expected === key.toLowerCase()))
      throw new Error("Wrong-case reference config key");
}

function cursorCommands(hooks: typeof cursorHookMap.Type): NativeCommand[] {
  return Object.values(hooks).flatMap((group) => group.map((hook) => shellCommand(hook.command)));
}

function shellCommand(command: string): NativeCommand {
  return formatterCommand(shellWords(command));
}

function openCodeCommands(value: unknown): NativeCommand[] {
  const config = Schema.decodeUnknownSync(openCodeConfig)(value);
  const commands: NativeCommand[] = [];
  if (config.formatter)
    for (const formatter of Object.values(config.formatter)) {
      if (!formatter.command) continue;
      const words = formatter.command;
      commands.push(formatterCommand(words));
    }
  const bash = typeof config.permission === "object" ? config.permission.bash : undefined;
  if (typeof bash === "object")
    for (const rule of Object.keys(bash))
      commands.push({ words: shellWords(rule), permission: true });
  return commands;
}

function formatterCommand(words: readonly string[]): NativeCommand {
  if ((words[0] === "sh" || words[0] === "bash") && words[1] === "-c")
    return shellCommand(words[2] ?? "");
  return { words, permission: false };
}

export function decodedNativeCommands(path: string, value: unknown) {
  return Result.try(() => nativeCommands(path, value));
}

/** Contributors need only supply their part of a valid composed config. */
export function decodedNativeSourceCommands(path: string, value: unknown) {
  if (path !== ".cursor/hooks.json") return decodedNativeCommands(path, value);
  return Result.try(() =>
    cursorCommands(Schema.decodeUnknownSync(cursorContribution)(value).hooks),
  );
}
