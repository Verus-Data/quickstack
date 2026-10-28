import { Schema } from "effect";

export const EchoParams = Schema.Struct({
  text: Schema.String,
});

export const EchoSuccess = Schema.Struct({
  text: Schema.String,
  length: Schema.Int,
});

export type EchoParams = typeof EchoParams.Type;
export type EchoSuccess = typeof EchoSuccess.Type;
