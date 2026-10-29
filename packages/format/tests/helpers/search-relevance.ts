import {
  FragmentMeta,
  type RankInput,
  type RankRecord,
  StackMeta,
} from "@steamfield/stacks-format";
import { Schema } from "effect";

function record(
  id: string,
  summary: string,
  languages: string[],
  kind: "stack" | "fragment" = "stack",
): RankRecord {
  const meta = {
    schema_version: 1,
    kind,
    id,
    name: summary,
    description: summary,
    tags: [],
    category: "deploy",
  };
  const common = {
    schemaVersion: 1 as const,
    id,
    source: { digest: `sha256:${"0".repeat(64)}`, by: "author" as const, reviewedAt: null },
    summary,
    requests: [summary],
    useCases: [],
    synonyms: [],
    goodFor: [],
    notFor: [],
  };
  return {
    entry: {
      id,
      kind,
      origin: "bundled",
      trusted: true,
      body: summary,
      meta:
        kind === "stack"
          ? Schema.decodeUnknownSync(StackMeta)(meta)
          : Schema.decodeUnknownSync(FragmentMeta)(meta),
    },
    search:
      kind === "stack"
        ? {
            ...common,
            kind,
            languages,
            platforms: ["web", "server"],
            productKinds: ["api", "web-app"],
          }
        : { ...common, kind, capabilities: ["deploy"] },
  };
}

export function relevanceInput(request: string): RankInput {
  return {
    request,
    vocabulary: {
      schemaVersion: 1,
      languages: { typescript: ["ts", "typescript"], python: ["python"] },
      platforms: { web: ["browser"], server: ["api", "server"] },
      productKinds: { api: ["api"], "web-app": ["dashboard"] },
      capabilities: { deploy: ["deploy", "hosting"] },
    },
    entries: [
      record("typed-api", "TypeScript API with typed inputs", ["typescript"]),
      record(
        "mixed-web",
        "Python API with TypeScript React server rendered dashboard and browser tests",
        ["python", "typescript"],
      ),
      record("typed-web", "TypeScript server rendered React dashboard and browser tests", [
        "typescript",
      ]),
      record("pages", "Deploy to Cloudflare Pages hosting", [], "fragment"),
    ],
  };
}

export function hostingInput(request: string): RankInput {
  const input = relevanceInput(request);
  return {
    ...input,
    entries: [
      ...input.entries,
      ...Array.from({ length: 12 }, (_, i) => record(`unrelated-${i}`, "Unrelated utility", [])),
    ],
  };
}
