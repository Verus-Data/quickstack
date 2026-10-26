import { Schema } from "effect";
export const Settings = Schema.Struct({ dataDir: Schema.optional(Schema.String) }).annotate({
  title: "CLI configuration",
  description: "Optional local data directory",
});
export type Settings = typeof Settings.Type;
