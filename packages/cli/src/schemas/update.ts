import { Schema } from "effect";

const Versions = { current: Schema.String, latest: Schema.String };
export const UpdateResult = Schema.Union([
  Schema.Struct({ status: Schema.Literals(["up-to-date", "ahead"]), ...Versions }),
  Schema.Struct({
    status: Schema.Literal("available"),
    ...Versions,
    install: Schema.Literals(["npm-global", "npx", "other"]),
    command: Schema.String,
  }),
  Schema.Struct({
    status: Schema.Literal("updated"),
    ...Versions,
    install: Schema.Literal("npm-global"),
  }),
]);
export type UpdateResult = typeof UpdateResult.Type;
