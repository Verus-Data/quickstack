import { StackMeta } from "@stacks/format";
import { Schema } from "effect";

/** Plain records preserve the existing rank input; no filesystem or CLI-owned entry fields. */
export function searchInput() {
  const entries = [
    { id: "go-cli", name: "Go CLI", language: "go" },
    { id: "typescript-cli", name: "TypeScript CLI", language: "typescript" },
  ].map(({ id, name, language }) => ({
    entry: {
      id,
      kind: "stack" as const,
      origin: "bundled" as const,
      trusted: true,
      meta: Schema.decodeUnknownSync(StackMeta)({
        schema_version: 1,
        kind: "stack",
        id,
        name,
        description: `A ${language} command line tool.`,
        tags: ["cli", language],
      }),
      body: `Build a ${language} command line tool.`,
    },
    search: {
      schemaVersion: 1,
      kind: "stack",
      id,
      source: { digest: `sha256:${"0".repeat(64)}`, by: "author", reviewedAt: "2026-10-27" },
      summary: `A ${language} command line tool.`,
      platforms: ["cli"],
      productKinds: ["cli-tool"],
      languages: [language],
      requests: [`a ${language} cli`],
      useCases: ["command line tool"],
      synonyms: [],
      goodFor: ["cli"],
      notFor: ["a TUI experience"],
    },
  }));
  return {
    request: "go cli",
    entries,
    vocabulary: {
      schemaVersion: 1,
      platforms: { cli: ["cli", "command line"] },
      productKinds: {},
      languages: { go: ["go", "golang"], typescript: ["typescript"] },
      capabilities: {},
    },
  };
}
