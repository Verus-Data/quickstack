import { Effect, Schema } from "effect";
import { Origin } from "./schemas/entry";
/** An unknown subcommand: what was typed and up to three close known names (`core/suggest.ts`). */
export const UsageDetails = Schema.Struct({
  command: Schema.String,
  suggestions: Schema.Array(Schema.String),
});
export class Usage extends Schema.TaggedError<Usage>()("Usage", {
  details: Schema.optionalKey(UsageDetails),
}) {
  override readonly message = "Invalid command. Run --help for usage.";
}
export class BadInput extends Schema.TaggedError<BadInput>()("BadInput", {}) {
  override readonly message = "Invalid input.";
}
export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {
  override readonly message = "Not found.";
}
export class NotConfigured extends Schema.TaggedError<NotConfigured>()("NotConfigured", {}) {
  override readonly message = "Configuration is required.";
}
export class InvalidConfig extends Schema.TaggedError<InvalidConfig>()("InvalidConfig", {}) {
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
/** `reason` is a closed set later sub-phases extend; `path` is the file or directory involved. */
export const PermissionDeniedDetails = Schema.Struct({
  reason: Schema.Literals(["write", "read"]),
  path: Schema.optionalKey(Schema.String),
});
export class PermissionDenied extends Schema.TaggedError<PermissionDenied>()("PermissionDenied", {
  details: Schema.optionalKey(PermissionDeniedDetails),
}) {
  override readonly message = "Permission denied.";
}
/**
 * An entry that can't be used: its frontmatter didn't decode, it contains a symlink, or its `id`
 * differs from its directory name. `path` is the file or link involved, relative to the entry.
 */
export const EntryInvalidDetails = Schema.Struct({
  id: Schema.String,
  origin: Origin,
  reason: Schema.Literals(["decode", "symlink", "id_mismatch", "missing"]),
  path: Schema.optionalKey(Schema.String),
});
export class EntryInvalid extends Schema.TaggedError<EntryInvalid>()("EntryInvalid", {
  details: Schema.optionalKey(EntryInvalidDetails),
}) {
  override readonly message = "Entry is invalid.";
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
/** The human lines shown under a failure's message, one per detail field worth showing. */
export function detailLines(error: AppError): string[] {
  switch (error._tag) {
    case "Usage":
      return error.details?.suggestions.length
        ? [`Did you mean: ${error.details.suggestions.join(", ")}?`]
        : [];
    case "PermissionDenied":
      return error.details?.path ? [`Path: ${error.details.path}`] : [];
    case "EntryInvalid":
      return error.details
        ? [
            `Entry: ${error.details.id} (${error.details.origin}, ${error.details.reason})`,
            ...(error.details.path ? [`Path: ${error.details.path}`] : []),
          ]
        : [];
    case "BadInput":
    case "NotFound":
    case "NotConfigured":
    case "InvalidConfig":
    case "UpstreamUnavailable":
    case "VerifyFailed":
    case "VerifyChanged":
    case "Interrupted":
    case "Defect":
    case "BrokenPipe":
      return [];
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
    case "NotFound":
    case "NotConfigured":
    case "InvalidConfig":
    case "UpstreamUnavailable":
    case "VerifyFailed":
    case "VerifyChanged":
    case "Interrupted":
    case "Defect":
    case "BrokenPipe":
      return Effect.succeed(undefined);
  }
}
