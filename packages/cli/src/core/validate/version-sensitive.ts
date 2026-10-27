import { Effect } from "effect";
import type { Finding } from "../../schemas/validate";
import { type Check, finding } from "./view";

/** Project-relative names whose formats belong to the agent's current tool versions. */
const VERSION_SENSITIVE = [
  /(?:^|\/)(?:tsconfig\.json|package\.json|pyproject\.toml|go\.mod|Cargo\.toml)$/,
  /(?:^|\/)(?:astro|vite|vitest|jest|playwright|openapi-ts|orval)\.config\.[^/]+$/,
  /(?:^|\/)(?:biome\.jsonc?|\.eslintrc[^/]*|eslint\.config\.[^/]+|\.golangci\.ya?ml|pytest\.ini)$/,
  /(?:^|\/)(?:Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/,
  /(?:^|\/)\.github\/workflows\/[^/]+$/,
  /(?:^|\/)(?:\.goreleaser\.ya?ml|release-please-config\.json|openapitools\.json)$/,
  /(?:^|\/)\.changeset\/config\.json$/,
];

export const versionSensitiveChecks: Check = (view) =>
  Effect.sync(() => {
    const findings: Finding[] = [];
    for (const entry of view.entries)
      for (const file of view.sources.get(entry.dir)?.files ?? []) {
        const output = file.path.replace(/\.tmpl$/, "");
        if (!VERSION_SENSITIVE.some((pattern) => pattern.test(output))) continue;
        findings.push(
          finding(entry, {
            check: "version-sensitive-file",
            severity: "warning",
            file: view.file(entry, file.source),
            message: `${output} has a version-sensitive format; describe it in prose for the agent to generate`,
          }),
        );
      }
    return { findings };
  });
