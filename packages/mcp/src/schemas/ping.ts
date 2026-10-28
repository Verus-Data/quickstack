import { Schema } from "effect";

export const PingSuccess = Schema.Struct({
  alive: Schema.Boolean,
});

export type PingSuccess = typeof PingSuccess.Type;
