import { Schema } from "effect";
export const DoctorReport = Schema.Struct({
  version: Schema.String,
  platform: Schema.String,
  executable: Schema.String,
  compiled: Schema.Boolean,
  paths: Schema.Struct({
    config: Schema.String,
    data: Schema.String,
    cache: Schema.String,
    cwd: Schema.String,
    /** The user registry root (user stacks and fragments). */
    user: Schema.String,
  }),
  /** The bundled registry root, and whether it exists. */
  registry: Schema.Struct({ path: Schema.String, found: Schema.Boolean }),
  /** The bundled skill directory, and whether SKILL.md exists. */
  skill: Schema.Struct({ path: Schema.String, found: Schema.Boolean }),
  configErrors: Schema.Array(Schema.String),
}).annotate({
  title: "Doctor report",
  description: "Local CLI runtime and configuration diagnostics",
});
export type DoctorReport = typeof DoctorReport.Type;
