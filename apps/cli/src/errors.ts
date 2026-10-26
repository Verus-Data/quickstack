import { Schema } from "effect";
export class Usage extends Schema.TaggedError<Usage>()("Usage", {}) {
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
export class PermissionDenied extends Schema.TaggedError<PermissionDenied>()(
  "PermissionDenied",
  {},
) {
  override readonly message = "Permission denied.";
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
export type AppError =
  | Usage
  | BadInput
  | NotFound
  | NotConfigured
  | InvalidConfig
  | UpstreamUnavailable
  | PermissionDenied
  | Interrupted
  | Defect
  | BrokenPipe;
export function exitCode(error: AppError): number {
  switch (error._tag) {
    case "Usage":
    case "BadInput":
    case "NotFound":
      return 2;
    case "NotConfigured":
    case "InvalidConfig":
      return 3;
    case "UpstreamUnavailable":
      return 4;
    case "PermissionDenied":
      return 6;
    case "Interrupted":
      return 130;
    case "Defect":
      return 1;
    case "BrokenPipe":
      return 0;
  }
}
export function retryable(error: AppError): boolean {
  switch (error._tag) {
    case "UpstreamUnavailable":
      return true;
    case "Defect":
    case "Usage":
    case "BadInput":
    case "NotFound":
    case "NotConfigured":
    case "InvalidConfig":
    case "PermissionDenied":
    case "Interrupted":
    case "BrokenPipe":
      return false;
  }
}
export function knownError(value: unknown): AppError | undefined {
  return value instanceof Usage ||
    value instanceof BadInput ||
    value instanceof NotFound ||
    value instanceof NotConfigured ||
    value instanceof InvalidConfig ||
    value instanceof UpstreamUnavailable ||
    value instanceof PermissionDenied ||
    value instanceof Interrupted ||
    value instanceof Defect ||
    value instanceof BrokenPipe
    ? value
    : undefined;
}
