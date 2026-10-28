import { Schema } from "effect";

export class EchoTooLong extends Schema.TaggedError<EchoTooLong>()("EchoTooLong", {
  message: Schema.String,
}) {}
