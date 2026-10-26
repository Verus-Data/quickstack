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
  }),
  configErrors: Schema.Array(Schema.String),
}).annotate({
  title: "Doctor report",
  description: "Local CLI runtime and configuration diagnostics",
});
export type DoctorReport = typeof DoctorReport.Type;
