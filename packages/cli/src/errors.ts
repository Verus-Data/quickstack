import { Effect, Schema } from "effect";
import { TEMPLATE_VARIABLES } from "./core/scaffold/template";
import { printable } from "./core/text";
import { Kind, Origin } from "./schemas/entry";
/**
 * An unknown subcommand: what was typed and up to three close known names (`core/suggest.ts`).
 * Or two flags that can't be used together, as typed (`new --launch` with `--no-launch`, 1.4).
 */
export const UsageDetails = Schema.Union([
  Schema.Struct({ command: Schema.String, suggestions: Schema.Array(Schema.String) }),
  Schema.Struct({ flags: Schema.Tuple([Schema.String, Schema.String]) }),
]);
export class Usage extends Schema.TaggedError<Usage>()("Usage", {
  details: Schema.optionalKey(UsageDetails),
}) {
  override readonly message = "Invalid command. Run --help for usage.";
}
/**
 * `id`: the argument the input was wrong about. `flag` says which input it is: `scope`, a
 * `--scope` value that isn't an npm scope; `with_without`, a fragment id given to both `--with`
 * and `--without`; `dir`, a project directory whose name has a control character; `brief`, a
 * flag (`--with`, `--without`, `--sandbox`, in `id`) that `validate` takes only with `--brief`.
 */
export const BadInputDetails = Schema.Struct({
  id: Schema.String,
  flag: Schema.Literals(["scope", "with_without", "dir", "brief"]),
});
export class BadInput extends Schema.TaggedError<BadInput>()("BadInput", {
  details: Schema.optionalKey(BadInputDetails),
}) {
  override readonly message = "Invalid input.";
}
/**
 * Up to three known ids close to the one given, from `core/suggest.ts::closest`; `looked` is the
 * path a lookup expected to find (validate's path argument, 1.5); `root` is the registry root an
 * id was looked up in when it isn't the usual set (`validate <root> --brief`).
 */
/**
 * `id` and `kind`: the stack or fragment id that wasn't found, so a caller can tell a wrong stack
 * from a wrong `--with`/`--without` id.
 */
export const NotFoundDetails = Schema.Struct({
  suggestions: Schema.Array(Schema.String),
  id: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Kind),
  looked: Schema.optionalKey(Schema.String),
  root: Schema.optionalKey(Schema.String),
});
export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  details: Schema.optionalKey(NotFoundDetails),
}) {
  override readonly message = "Not found.";
}
export class NotConfigured extends Schema.TaggedError<NotConfigured>()("NotConfigured", {}) {
  override readonly message = "Configuration is required.";
}
/**
 * `path`: the file that didn't decode, such as `.quickstacks/manifest.json` (1.2b).
 * `schemaVersion`: the version a newer quickstacks wrote, when that is why it didn't decode.
 */
export const InvalidConfigDetails = Schema.Struct({
  path: Schema.String,
  schemaVersion: Schema.optionalKey(Schema.Number),
});
export class InvalidConfig extends Schema.TaggedError<InvalidConfig>()("InvalidConfig", {
  details: Schema.optionalKey(InvalidConfigDetails),
}) {
  override readonly message = "Configuration is invalid.";
}
export class UpstreamUnavailable extends Schema.TaggedError<UpstreamUnavailable>()(
  "UpstreamUnavailable",
  {},
) {
  override readonly message = "Upstream service is unavailable.";
}
/** Details schemas are defined in 1.3a; until then the tag carries none. */
export class VerifyFailed extends Schema.TaggedError<VerifyFailed>()("VerifyFailed", {}) {
  override readonly message = "Verify failed.";
}
/** Details schemas are defined in 1.3b; until then the tag carries none. */
export class VerifyChanged extends Schema.TaggedError<VerifyChanged>()("VerifyChanged", {}) {
  override readonly message = "Verify steps changed since they were recorded.";
}
/**
 * `reason` is a closed set later sub-phases extend; `path` is the file or directory involved.
 * `escape`: a write would land outside the project (its real path isn't under the project's).
 * `unwritable`: the project directory or a file in it couldn't be created or written.
 * `launch`: the agent CLI `new` hands off to (`path`) was found but couldn't be executed (1.4).
 */
export const PermissionDeniedDetails = Schema.Struct({
  reason: Schema.Literals(["write", "read", "escape", "unwritable", "launch"]),
  path: Schema.optionalKey(Schema.String),
});
export class PermissionDenied extends Schema.TaggedError<PermissionDenied>()("PermissionDenied", {
  details: Schema.optionalKey(PermissionDeniedDetails),
}) {
  override readonly message = "Permission denied.";
}
/**
 * An entry that can't be used: its frontmatter didn't decode, it contains a symlink, its `id`
 * differs from its directory name, a file is missing, a conditional block is malformed, a merged
 * file isn't JSON, a template sits on a merge path, or a template names an unknown variable
 * (`template`). `path` is the file or link involved,
 * relative to the entry; `line` is a 1-based line in that file; `problem` says what is wrong with a
 * `conditional` marker.
 */
export const ConditionalProblem = Schema.Literals([
  "unclosed",
  "nested",
  "stray_end",
  "unknown_key",
  "bad_value",
  "empty",
  "repeated",
  "unknown_marker",
  "not_alone",
]);
export type ConditionalProblem = typeof ConditionalProblem.Type;
export const EntryInvalidDetails = Schema.Struct({
  id: Schema.String,
  origin: Origin,
  reason: Schema.Literals([
    "decode",
    "symlink",
    "id_mismatch",
    "missing",
    "conditional",
    "merge_json",
    "merge_template",
    "template",
  ]),
  path: Schema.optionalKey(Schema.String),
  line: Schema.optionalKey(Schema.Number),
  problem: Schema.optionalKey(ConditionalProblem),
});
export class EntryInvalid extends Schema.TaggedError<EntryInvalid>()("EntryInvalid", {
  details: Schema.optionalKey(EntryInvalidDetails),
}) {
  override readonly message = "Entry is invalid.";
}
/**
 * The selected entries can't be composed. `stack` is present when the stack is one of the parties
 * (it always reads first); `ids` names the fragments involved, in the order the reason reads (the
 * requirer before what it requires; a cycle in order). A stack and a fragment may share an id, so
 * the stack never appears in `ids`. `path`, `step` and `key` name the file, verify step or env key
 * two entries disagree on. For `needs_own_repo`, `path` is the enclosing repository's root and
 * `fix` lists the `--without` flags that would leave every such fragment out (empty when no
 * `--without` can). `file_owner` is also two planned paths that differ only in letter case, or a
 * file at a path another planned file needs as a directory. `reserved_path` is an entry file under
 * `.git` or `.quickstacks` (any segment, any case), which the CLI owns.
 */
export const ComposeConflictDetails = Schema.Struct({
  reason: Schema.Literals([
    "required",
    "requires",
    "cycle",
    "conflicts",
    "applies_to",
    "app_required",
    "app_count",
    "step_name",
    "file_owner",
    "env",
    "needs_own_repo",
    "reserved_path",
  ]),
  stack: Schema.optionalKey(Schema.String),
  ids: Schema.Array(Schema.String),
  path: Schema.optionalKey(Schema.String),
  step: Schema.optionalKey(Schema.String),
  key: Schema.optionalKey(Schema.String),
  fix: Schema.optionalKey(Schema.Array(Schema.String)),
});
export class ComposeConflict extends Schema.TaggedError<ComposeConflict>()("ComposeConflict", {
  details: Schema.optionalKey(ComposeConflictDetails),
}) {
  override readonly message = "These entries can't be composed.";
}
/**
 * `new` refuses a directory holding anything besides `.git` and OS litter. `path` is the target;
 * `entries` names up to ten of what is in it, sorted, litter excluded. `scaffold` is set when the
 * target already holds `.quickstacks/manifest.json`: `green` once its state record has
 * `firstGreenAt`, else `unfinished`.
 */
export const TargetNotEmptyDetails = Schema.Struct({
  path: Schema.String,
  entries: Schema.Array(Schema.String),
  scaffold: Schema.optionalKey(Schema.Literals(["unfinished", "green"])),
});
export class TargetNotEmpty extends Schema.TaggedError<TargetNotEmpty>()("TargetNotEmpty", {
  details: Schema.optionalKey(TargetNotEmptyDetails),
}) {
  override readonly message = "The target directory is not empty.";
}
/** `validate` found at least one error finding; the report stays on stdout. Counts, not text. */
export const ValidationFailedDetails = Schema.Struct({
  errors: Schema.Number,
  warnings: Schema.Number,
});
export class ValidationFailed extends Schema.TaggedError<ValidationFailed>()("ValidationFailed", {
  details: Schema.optionalKey(ValidationFailedDetails),
}) {
  override readonly message = "Validation failed.";
}
export class Interrupted extends Schema.TaggedError<Interrupted>()("Interrupted", {}) {
  override readonly message = "Command interrupted.";
}
export class Defect extends Schema.TaggedError<Defect>()("Defect", {}) {
  override readonly message = "An unexpected error occurred.";
}
export class BrokenPipe extends Schema.TaggedError<BrokenPipe>()("BrokenPipe", {}) {
  override readonly message = "Output pipe closed.";
}
/**
 * No process could start: the cwd is missing or not a directory (`cwd`), `/bin/sh` is missing
 * (`shell`), a binary run without a shell is missing or not executable (`command`), or the system
 * refused a new process (`resources`). `errno` is the system's code, such as `ENOENT`. A command
 * that isn't installed under `/bin/sh -c` is not this: the shell runs and exits 127. Internal and
 * outside `AppError`, so it reaches `main` as a `Defect` unless the caller handles it.
 */
export class SpawnFailed extends Schema.TaggedError<SpawnFailed>()("SpawnFailed", {
  kind: Schema.Literals(["cwd", "shell", "command", "resources"]),
  errno: Schema.String,
}) {
  override readonly message = "A process could not be started.";
}
/** Every error class main reports; a unit test keeps it equal to `errorTable`'s keys. */
export const errorClasses = [
  Usage,
  BadInput,
  NotFound,
  NotConfigured,
  InvalidConfig,
  UpstreamUnavailable,
  VerifyFailed,
  VerifyChanged,
  PermissionDenied,
  EntryInvalid,
  ComposeConflict,
  TargetNotEmpty,
  ValidationFailed,
  Interrupted,
  Defect,
  BrokenPipe,
] as const;
export type AppError = InstanceType<(typeof errorClasses)[number]>;
type ErrorSpec = { exit: number; retryable: boolean; keepsResult: boolean };
/** Exit code, retryability and whether a failure keeps the command's result on stdout. */
export const errorTable = {
  Usage: { exit: 2, retryable: false, keepsResult: false },
  BadInput: { exit: 2, retryable: false, keepsResult: false },
  NotFound: { exit: 2, retryable: false, keepsResult: false },
  NotConfigured: { exit: 3, retryable: false, keepsResult: false },
  InvalidConfig: { exit: 3, retryable: false, keepsResult: false },
  UpstreamUnavailable: { exit: 4, retryable: true, keepsResult: false },
  VerifyFailed: { exit: 5, retryable: false, keepsResult: true },
  VerifyChanged: { exit: 5, retryable: false, keepsResult: true },
  PermissionDenied: { exit: 6, retryable: false, keepsResult: false },
  EntryInvalid: { exit: 2, retryable: false, keepsResult: false },
  ComposeConflict: { exit: 2, retryable: false, keepsResult: false },
  TargetNotEmpty: { exit: 2, retryable: false, keepsResult: false },
  ValidationFailed: { exit: 2, retryable: false, keepsResult: true },
  Interrupted: { exit: 130, retryable: false, keepsResult: false },
  Defect: { exit: 1, retryable: false, keepsResult: false },
  BrokenPipe: { exit: 0, retryable: false, keepsResult: false },
} as const satisfies Record<AppError["_tag"], ErrorSpec>;
export function exitCode(error: AppError): number {
  return errorTable[error._tag].exit;
}
export function retryable(error: AppError): boolean {
  return errorTable[error._tag].retryable;
}
export function keepsResult(error: AppError): boolean {
  return errorTable[error._tag].keepsResult;
}
export function knownError(value: unknown): AppError | undefined {
  return errorClasses.some((Class) => value instanceof Class) ? (value as AppError) : undefined;
}
/**
 * The human lines shown under a failure's message, one per detail field worth showing, ending
 * with a `Next:` line where the details say what to do. `invocation` is `Host.invocation`, for
 * commands quoted in those lines.
 */
export function detailLines(error: AppError, invocation: string): string[] {
  switch (error._tag) {
    case "Usage": {
      const details = error.details;
      if (details && "flags" in details)
        return [
          `${details.flags[0]} and ${details.flags[1]} can't be used together.`,
          "Next: drop one of them.",
        ];
      return details?.suggestions.length
        ? [`Did you mean: ${details.suggestions.join(", ")}?`]
        : [];
    }
    case "PermissionDenied": {
      const details = error.details;
      if (!details) return [];
      const why =
        details.reason === "escape"
          ? [
              "The path resolves outside the project directory, through a symlink or `..`.",
              "Next: remove that symlink from the project directory, or pick another directory.",
            ]
          : details.reason === "unwritable"
            ? [
                "The project directory or a file in it can't be written. Nothing was left behind.",
                "Next: pick a directory you can write to, or fix this one's permissions.",
              ]
            : details.reason === "launch"
              ? [
                  "The agent CLI was found on PATH but can't be run by you. The project was written.",
                  "Next: fix the binary's permissions, or start your agent in the project yourself.",
                ]
              : [];
      return [...(details.path ? [`Path: ${printable(details.path)}`] : []), ...why];
    }
    case "TargetNotEmpty": {
      const details = error.details;
      if (!details) return [];
      return [
        `Path: ${printable(details.path)}`,
        ...(details.entries.length
          ? [`Contains: ${details.entries.map(printable).join(", ")}`]
          : []),
        ...(details.scaffold === "unfinished"
          ? [
              "Scaffold: unfinished. An earlier `new` wrote this.",
              "Next: continue with .quickstacks/BRIEF.md, or remove the directory to start again.",
            ]
          : details.scaffold === "green"
            ? [
                "Scaffold: green. This is a finished project.",
                "Next: pick another directory for a new project; `add` will extend this one once it ships.",
              ]
            : ["Next: pick a directory that doesn't exist yet or is empty."]),
      ];
    }
    case "BadInput":
      return error.details ? badInputLines(error.details) : [];
    case "NotFound": {
      // `looked` means a path was missing (validate); `root`, an id missing from a registry root
      // `list` doesn't read; otherwise an id missing from the registries `list` shows.
      const details = error.details;
      if (!details) return [];
      return [
        ...(details.looked ? [`Looked for: ${printable(details.looked)}`] : []),
        ...(details.id !== undefined
          ? [
              `${details.kind === "fragment" ? "Fragment" : details.kind === "stack" ? "Stack" : "Id"}: ${printable(details.id)}`,
            ]
          : []),
        ...(details.suggestions.length
          ? [`Did you mean: ${details.suggestions.map(printable).join(", ")}?`]
          : []),
        details.looked
          ? "Next: pass a registry root (a directory holding stacks/ or fragments/) or an entry directory inside one."
          : details.root
            ? `Next: ${invocation} validate ${shellArg(printable(details.root))} lists the ids under that root.`
            : `Next: ${invocation} list shows every stack and fragment.`,
      ];
    }
    case "ValidationFailed":
      return error.details
        ? [`Errors: ${error.details.errors}, warnings: ${error.details.warnings}`]
        : [];
    case "EntryInvalid": {
      const details = error.details;
      if (!details) return [];
      const line = details.line === undefined ? "" : `:${details.line}`;
      return [
        `Entry: ${printable(details.id)} (${details.origin}, ${details.reason})`,
        ...(details.path ? [`Path: ${printable(details.path)}${line}`] : []),
        ...(details.problem ? [`Problem: ${details.problem}`] : []),
        ...(details.reason === "template"
          ? [
              `Next: use only ${TEMPLATE_VARIABLES.join(", ")} in that file's {{ }} tokens, or drop its .tmpl suffix to copy it as is.`,
            ]
          : []),
      ];
    }
    case "ComposeConflict": {
      const details = error.details;
      if (!details) return [];
      return [
        `Reason: ${details.reason}`,
        ...(details.stack ? [`Stack: ${printable(details.stack)}`] : []),
        ...(details.ids.length ? [`Fragments: ${details.ids.map(printable).join(", ")}`] : []),
        ...(details.path
          ? [
              `${details.reason === "needs_own_repo" ? "Repository" : "Path"}: ${printable(details.path)}`,
            ]
          : []),
        ...(details.step ? [`Step: ${printable(details.step)}`] : []),
        ...(details.key ? [`Key: ${printable(details.key)}`] : []),
        ...(details.reason === "needs_own_repo"
          ? [
              details.fix?.length
                ? `Next: run again with ${details.fix.map(printable).join(" ")}, or pick a directory outside that repository.`
                : "Next: pick a directory outside that repository.",
            ]
          : details.reason === "reserved_path"
            ? [
                "The CLI owns .git/ and .quickstacks/ in a project; no entry may write under them, in any letter case.",
                "Next: remove or rename that file in the entry.",
              ]
            : []),
      ];
    }
    case "InvalidConfig": {
      const details = error.details;
      if (!details) return [];
      return [
        `Path: ${printable(details.path)}`,
        ...(details.schemaVersion === undefined
          ? []
          : [
              `Schema version: ${details.schemaVersion}, from a newer quickstacks. Upgrade quickstacks to read it.`,
            ]),
      ];
    }
    case "NotConfigured":
    case "UpstreamUnavailable":
    case "VerifyFailed":
    case "VerifyChanged":
    case "Interrupted":
    case "Defect":
    case "BrokenPipe":
      return [];
  }
}
/** A value as a shell argument: plain when it is safe, else single-quoted. */
const shellArg = (text: string) =>
  /^[A-Za-z0-9._/+-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
function badInputLines(details: typeof BadInputDetails.Type): string[] {
  const id = printable(details.id);
  switch (details.flag) {
    case "scope":
      return [
        `Flag: --scope ${id}`,
        "Next: pass an npm scope such as acme or @acme: lowercase, URL-safe, no /.",
      ];
    case "with_without":
      return [
        `Id: ${id}`,
        "Flags: --with and --without",
        `Next: name ${id} in only one of --with and --without.`,
      ];
    case "dir":
      return [
        `Directory name: ${id}`,
        "Next: pick a project directory whose name has no control characters.",
      ];
    case "brief":
      return [
        `Flag: ${id}`,
        "Next: --with, --without and --sandbox need --brief <stack>; add it, or drop the flag.",
      ];
  }
}
const encodeClosed = <S extends Schema.Top>(schema: S, value: S["Type"] | undefined) =>
  value === undefined
    ? Effect.succeed(undefined)
    : Schema.encodeUnknownEffect(schema)(value, { onExcessProperty: "error" });
/**
 * A failure's details, encoded with the tag's details schema. Construction already drops keys
 * the schema doesn't name; this catches a details object mutated afterwards.
 */
export function encodeDetails(error: AppError): Effect.Effect<unknown, Schema.SchemaError> {
  switch (error._tag) {
    case "Usage":
      return encodeClosed(UsageDetails, error.details);
    case "PermissionDenied":
      return encodeClosed(PermissionDeniedDetails, error.details);
    case "EntryInvalid":
      return encodeClosed(EntryInvalidDetails, error.details);
    case "BadInput":
      return encodeClosed(BadInputDetails, error.details);
    case "NotFound":
      return encodeClosed(NotFoundDetails, error.details);
    case "ComposeConflict":
      return encodeClosed(ComposeConflictDetails, error.details);
    case "TargetNotEmpty":
      return encodeClosed(TargetNotEmptyDetails, error.details);
    case "ValidationFailed":
      return encodeClosed(ValidationFailedDetails, error.details);
    case "InvalidConfig":
      return encodeClosed(InvalidConfigDetails, error.details);
    case "NotConfigured":
    case "UpstreamUnavailable":
    case "VerifyFailed":
    case "VerifyChanged":
    case "Interrupted":
    case "Defect":
    case "BrokenPipe":
      return Effect.succeed(undefined);
  }
}
