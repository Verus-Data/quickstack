import { Schema } from "effect";

export class CliFailure extends Schema.TaggedError<CliFailure>()("CliFailure", {
  message: Schema.String,
  tag: Schema.String,
  details: Schema.Unknown,
  exitCode: Schema.Int,
}) {}
