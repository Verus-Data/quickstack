import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { JsonSchema, Schema, SchemaRepresentation } from "effect";
import { expect, test } from "vitest";
import { bundled, samples } from "./helpers/native-adapters";

const recordedSchema = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
  JSON.parse(readFileSync(join(samples, "claude-plugin.schema.json"), "utf8")),
);
const marketplaceSchema = Schema.toType(
  SchemaRepresentation.fromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12(recordedSchema), {
    patterns: "apply",
  }),
);
const Manifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  skills: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
});
const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

function skillFiles(directory: string) {
  const direct = join(directory, "SKILL.md");
  if (existsSync(direct)) return [direct];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => join(directory, entry.name, "SKILL.md"))
    .filter(existsSync);
}

test("the recorded marketplace schema accepts skills directories and rejects malformed metadata [3.4b#4]", () => {
  const decode = Schema.decodeUnknownSync(marketplaceSchema);
  expect(() => decode({ name: "quickstacks", skills: ["./skills/quickstacks"] })).not.toThrow();
  expect(() => decode({ name: "Bad Name", skills: ["skill"] })).toThrow();
  expect(() => decode({ name: "quickstacks", skills: 1 })).toThrow();
});

test("the Claude marketplace manifest decodes and names a contained shipped copy of the CLI skill [3.4b#4]", () => {
  const cli = join(bundled, "..");
  const root = realpathSync(join(cli, "plugin"));
  const json: unknown = JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8"));
  Schema.decodeUnknownSync(marketplaceSchema)(json);
  const manifest = Schema.decodeUnknownSync(Manifest)(json);
  const pkg = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.String }))(
    JSON.parse(readFileSync(join(cli, "package.json"), "utf8")),
  );
  expect(manifest.name).toBe("quickstacks");
  expect(manifest.version).toBe(pkg.version);
  const paths = typeof manifest.skills === "string" ? [manifest.skills] : manifest.skills;
  expect(paths.length).toBeGreaterThan(0);
  const discovered: string[] = [];
  for (const path of paths) {
    expect(path.split(/[\\/]/)).not.toContain("..");
    const files = skillFiles(join(root, path));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const skill = realpathSync(file);
      const inside = relative(root, skill);
      expect(inside.startsWith(`..${sep}`) || inside === "..").toBe(false);
      discovered.push(skill);
    }
  }
  expect(discovered.some((file) => digest(file) === digest(join(cli, "skill/SKILL.md")))).toBe(
    true,
  );
});
