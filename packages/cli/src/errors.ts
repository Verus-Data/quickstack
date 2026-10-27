import { Effect, Schema } from "effect";
import { TEMPLATE_VARIABLES } from "./core/scaffold/template";
import { printable } from "./core/text";
import { BRIEF_PATH, MANIFEST_PATH } from "./project-layout";
import { Kind, Origin } from "./schemas/entry";
import { FailureKind, VerifyChange } from "./schemas/verify";
/**
 * An unknown subcommand: what was typed and up to three close known names (`core/suggest.ts`).
 * Or two flags that can't be used together, as typed (`new --launch` with `--no-launch`, 1.4).
 * Or a parser-rejected value, with its expected input and optional close known values.
 */
export const UsageDetails = Schema.Union([
  Schema.Struct({ command: Schema.String, suggestions: Schema.Array(Schema.String) }),
  Schema.Struct({ flags: Schema.Tuple([Schema.String, Schema.String]) }),
  Schema.Struct({
    flag: Schema.String,
    value: Schema.String,
    expected: Schema.String,
    suggestions: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
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
 * flag (`--with`, `--without`, `--sandbox`, in `id`) that `validate` takes only with `--brief`;
 * `only`, a `verify --only` name that is no check or serve step, with those steps' names in
 * `known` (1.3a); `name` or `author`, a naming flag with an unsupported control character.
 * `fragment` is an add request for a stack or an applied fragment (listed in `alreadyApplied`);
 * `agents` and `sandbox` are add flags that disagree with the manifest.
 */
export const BadInputDetails = Schema.Struct({
  id: Schema.String,
  flag: Schema.Literals([
    "scope",
    "with_without",
    "dir",
    "brief",
    "brief_stack",
    "kind",
    "only",
    "name",
    "author",
    "fragment",
    "agents",
    "sandbox",
    "create_id",
    "create_target",
    "from",
    "confirmation",
  ]),
  known: Schema.optionalKey(Schema.Array(Schema.String)),
  alreadyApplied: Schema.optionalKey(Schema.Array(Schema.String)),
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
 * from a wrong `--with`/`--without` id. `kind: "project"` (1.3a, with no `id`): `verify` found no
 * `.quickstacks/manifest.json` walking up from `looked`.
 */
export const NotFoundDetails = Schema.Struct({
  suggestions: Schema.Array(Schema.String),
  id: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.Literals([...Kind.literals, "project"])),
  looked: Schema.optionalKey(Schema.String),
  root: Schema.optionalKey(Schema.String),
  /** A missing bundled asset directory (skill install). */
  path: Schema.optionalKey(Schema.String),
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
/** The failed steps, in run order: names, kinds and exit codes only, never their output. */
export const VerifyFailedDetails = Schema.Struct({
  failed: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      failureKind: FailureKind,
      exitCode: Schema.optionalKey(Schema.Number),
    }),
  ),
});
export class VerifyFailed extends Schema.TaggedError<VerifyFailed>()("VerifyFailed", {
  details: Schema.optionalKey(VerifyFailedDetails),
}) {
  override readonly message = "Verify failed.";
}
/** What changed and against which copy: the same value as the verify result's `changed`. */
export const VerifyChangedDetails = VerifyChange;
export class VerifyChanged extends Schema.TaggedError<VerifyChanged>()("VerifyChanged", {
  details: Schema.optionalKey(VerifyChangedDetails),
}) {
  override readonly message = "Verify steps changed since they were recorded.";
}
/**
 * `reason` is a closed set later sub-phases extend; `path` is the file or directory involved.
 * `escape`: a write would land outside the project (its real path isn't under the project's).
 * `unwritable`: the project directory or a file in it couldn't be created or written.
 * `agent` and `no-tty`: a confirmation only a person at a terminal may give (Trust model, point 4)
 * was asked for under a detected agent, or without a terminal on stdin.
 * `state-unwritable`: the state record (`path`) couldn't be written, so nothing was confirmed.
 * `launch`: the agent CLI `new` hands off to (`path`) was found but couldn't be executed (1.4).
 */
export const PermissionDeniedDetails = Schema.Struct({
  reason: Schema.Literals([
    "write",
    "read",
    "escape",
    "unwritable",
    "agent",
    "no-tty",
    "state-unwritable",
    "launch",
  ]),
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
  /** skill install cannot replace a directory or other non-regular SKILL.md, even with --force. */
  blocker: Schema.optionalKey(Schema.Literal("non-file")),
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
    case "Usage":
      return usageLines(error);
    case "PermissionDenied":
      return permissionLines(error);
    case "TargetNotEmpty":
      return targetLines(error, invocation);
    case "BadInput":
      return error.details ? badInputLines(error.details) : [];
    case "NotFound":
      return notFoundLines(error, invocation);
    // The report on stdout ends with these counts already; `--json` keeps them in details.
    case "ValidationFailed":
      return [];
    case "EntryInvalid":
      return entryLines(error);
    case "ComposeConflict":
      return composeLines(error);
    case "InvalidConfig":
      return configLines(error);
    case "VerifyFailed":
      return error.details?.failed.length
        ? [
            `Failed: ${error.details.failed
              .map(
                (step) =>
                  `${printable(step.name)} (${step.failureKind}${step.exitCode === undefined ? "" : `, exit ${step.exitCode}`})`,
              )
              .join(", ")}`,
          ]
        : [];
    case "VerifyChanged":
      return error.details ? changeLines(error.details) : [];
    case "NotConfigured":
    case "UpstreamUnavailable":
    case "Interrupted":
    case "Defect":
    case "BrokenPipe":
      return [];
  }
}
function usageLines(error: Usage): string[] {
  const details = error.details;
  if (details && "flags" in details)
    return [
      `${details.flags[0]} and ${details.flags[1]} can't be used together.`,
      "Next: drop one of them.",
    ];
  if (details && "flag" in details)
    return [
      `Flag: ${printable(details.flag)}`,
      `Value: ${printable(details.value)}`,
      `Expected: ${printable(details.expected)}`,
      ...(details.suggestions?.length
        ? [`Did you mean: ${details.suggestions.map(printable).join(", ")}?`]
        : []),
      "Next: pass an expected value, or run --help for usage.",
    ];
  return details?.suggestions.length ? [`Did you mean: ${details.suggestions.join(", ")}?`] : [];
}

function permissionLines(error: PermissionDenied): string[] {
  const details = error.details;
  if (!details) return [];
  const why = permissionReason(details.reason);
  return [...(details.path ? [`Path: ${printable(details.path)}`] : []), ...why];
}

function targetLines(error: TargetNotEmpty, invocation: string): string[] {
  const details = error.details;
  if (!details) return [];
  return [
    `Path: ${printable(details.path)}`,
    ...(details.entries.length ? [`Contains: ${details.entries.map(printable).join(", ")}`] : []),
    ...targetNext(details, invocation),
  ];
}

function notFoundLines(error: NotFound, invocation: string): string[] {
  // `looked` means a path was missing (validate); `root`, an id missing from a registry root
  // `list` doesn't read; otherwise an id missing from the registries `list` shows.
  const details = error.details;
  if (!details) return [];
  if (details.path)
    return [
      `Path: ${printable(details.path)}`,
      "Next: restore the bundled skill directory or reinstall quickstacks, then run doctor.",
    ];
  if (details.kind === "project")
    return [
      `Looked for: ${MANIFEST_PATH} in ${printable(details.looked ?? ".")} and every directory above it`,
      `Next: run ${invocation} verify inside a project ${invocation} new created, or create one with ${invocation} new <stack> <dir>.`,
    ];
  return [
    ...(details.looked ? [`Looked for: ${printable(details.looked)}`] : []),
    ...(details.id !== undefined
      ? [`${entryKindLabel(details.kind)}: ${printable(details.id)}`]
      : []),
    ...(details.suggestions.length
      ? [`Did you mean: ${details.suggestions.map(printable).join(", ")}?`]
      : []),
    notFoundNext(details, invocation),
  ];
}

function entryLines(error: EntryInvalid): string[] {
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

function composeLines(error: ComposeConflict): string[] {
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
    ...composeNext(details),
  ];
}

function configLines(error: InvalidConfig): string[] {
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

/** The human lines naming what changed; `--accept-changes` prints the same lines. */
export function changeLines(change: typeof VerifyChange.Type): string[] {
  const names = (label: string, list: ReadonlyArray<string>) =>
    list.length ? [`${label}: ${list.map(printable).join(", ")}`] : [];
  const items = [
    ...names("Edited", change.edited),
    ...names("Added", change.added),
    ...names("Removed", change.removed),
    ...(change.settings ? ["Settings: the manifest's env or preset changed"] : []),
  ];
  return [
    changeBaseline(change),
    ...(items.length
      ? items
      : ["Which steps changed is not itemized: there are no per-step digests to compare with."]),
  ];
}
/** A value as a shell argument: plain when it is safe, else single-quoted. */
const shellArg = (text: string) =>
  /^[A-Za-z0-9._/+-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
function badInputLines(details: typeof BadInputDetails.Type): string[] {
  const id = printable(details.id);
  switch (details.flag) {
    case "create_id":
      return [
        `Id: ${id}`,
        "Next: use a lowercase kebab-case id, with only letters and digits between hyphens.",
      ];
    case "create_target":
      return [`Path: ${id}`, "Next: edit the existing entry, or choose an unused id."];
    case "from":
      return [`Origin: ${id}`, "Next: copy from bundled or project; user is the destination."];
    case "confirmation":
      return [
        "The copy was declined. Nothing was changed.",
        "Next: review the entry before copying it.",
      ];
    case "fragment":
      return details.alreadyApplied?.length
        ? [
            `Already applied: ${details.alreadyApplied.map(printable).join(", ")}`,
            "Next: choose unapplied fragments with quickstacks list.",
          ]
        : [`Id: ${id}`, "Next: add takes fragments; use quickstacks new for a stack."];
    case "agents":
    case "sandbox":
      return [
        `Flag: --${details.flag}`,
        "Next: use the preset and agents recorded in the manifest.",
      ];
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
    case "name":
    case "author":
      return [
        `Flag: --${details.flag} ${id}`,
        `Next: pass --${details.flag} without control characters.`,
      ];
    case "dir":
      return [
        `Directory name: ${id}`,
        "Next: pick a project directory whose name has no control characters.",
      ];
    case "kind":
      return [
        `Id: ${id}`,
        "Kinds: stack, fragment",
        "Next: select --kind stack or --kind fragment.",
      ];
    case "brief_stack":
      return [`Id: ${id}`, "Next: --brief takes a stack; choose one with quickstacks list stacks."];
    case "brief":
      return [
        `Flag: ${id}`,
        "Next: --with, --without and --sandbox need --brief <stack>; add it, or drop the flag.",
      ];
    case "only":
      return [
        `Flag: --only ${id}`,
        ...(details.known?.length
          ? [`Check and serve steps: ${details.known.map(printable).join(", ")}`]
          : ["This project has no check or serve steps."]),
        "Next: pass --only names from that list; setup and teardown steps always run.",
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
    case "VerifyFailed":
      return encodeClosed(VerifyFailedDetails, error.details);
    case "VerifyChanged":
      return encodeClosed(VerifyChangedDetails, error.details);
    case "NotConfigured":
    case "UpstreamUnavailable":
    case "Interrupted":
    case "Defect":
    case "BrokenPipe":
      return Effect.succeed(undefined);
  }
}

function permissionReason(reason: (typeof PermissionDeniedDetails.Type)["reason"]): string[] {
  switch (reason) {
    case "escape":
      return [
        "The path resolves outside the project directory, through a symlink or `..`.",
        "Next: remove that symlink from the project directory, or pick another directory.",
      ];
    case "unwritable":
      return [
        "The project directory or a file in it can't be written. Nothing was left behind.",
        "Next: pick a directory you can write to, or fix this one's permissions.",
      ];
    case "agent":
      return [
        "This needs a person's confirmation, and an agent was detected. Nothing was changed.",
        "Next: ask the user to run this command from their own terminal.",
      ];
    case "no-tty":
      return [
        "This needs a person's confirmation, and stdin is not a terminal. Nothing was changed.",
        "Next: run this command from a terminal.",
      ];
    case "state-unwritable":
      return [
        "The state record outside the project can't be written, so nothing was confirmed or changed.",
        "Next: make that directory writable (or set QUICKSTACKS_STATE_DIR to one that is), then run this command again.",
      ];
    case "launch":
      return [
        "The agent CLI was found on PATH but can't be run by you. The project was written.",
        "Next: fix the binary's permissions, or start your agent in the project yourself.",
      ];
    default:
      return [];
  }
}

function targetNext(details: typeof TargetNotEmptyDetails.Type, invocation: string): string[] {
  if (details.blocker === "non-file")
    return [
      `Next: move the item named SKILL.md out of the target directory, or run ${invocation} skill install --print to copy the skill elsewhere.`,
    ];
  // `skill install`'s differing target; its details are only path and entries.
  if (
    details.entries.length === 1 &&
    details.entries[0] === "SKILL.md" &&
    /[/\\]\.claude[/\\]skills[/\\]quickstacks$/.test(details.path)
  )
    return [
      `Next: rerun ${invocation} skill install with --force to replace it, or --print to copy it elsewhere.`,
    ];
  if (details.scaffold === "unfinished")
    return [
      "Scaffold: unfinished. An earlier `new` wrote this.",
      `Next: continue with ${BRIEF_PATH}, or remove the directory to start again.`,
    ];
  if (details.scaffold === "green")
    return [
      "Scaffold: green. This is a finished project.",
      "Next: pick another directory for a new project; `add` will extend this one once it ships.",
    ];
  return ["Next: pick a directory that doesn't exist yet or is empty."];
}

function entryKindLabel(kind: (typeof NotFoundDetails.Type)["kind"]): string {
  if (kind === "fragment") return "Fragment";
  if (kind === "stack") return "Stack";
  return "Id";
}
function notFoundNext(details: typeof NotFoundDetails.Type, invocation: string): string {
  if (details.looked)
    return "Next: pass a registry root (a directory holding stacks/ or fragments/) or an entry directory inside one.";
  if (details.root)
    return `Next: ${invocation} validate ${shellArg(printable(details.root))} lists the ids under that root.`;
  return `Next: ${invocation} list shows every stack and fragment.`;
}

function composeNext(details: typeof ComposeConflictDetails.Type): string[] {
  if (details.reason === "needs_own_repo")
    return [
      details.fix?.length
        ? `Next: run again with ${details.fix.map(printable).join(" ")}, or pick a directory outside that repository.`
        : "Next: pick a directory outside that repository.",
    ];
  if (details.reason === "reserved_path")
    return [
      "The CLI owns .git/ and .quickstacks/ in a project; no entry may write under them, in any letter case.",
      "Next: remove or rename that file in the entry.",
    ];
  return [];
}

function changeBaseline(change: typeof VerifyChange.Type): string {
  if (change.reason === "project-id")
    return "Against: the state record for this project directory, which is kept under another projectId";
  if (change.against === "manifest") return "Against: the manifest's own verifyDigest";
  return "Against: the state record kept outside the project";
}
