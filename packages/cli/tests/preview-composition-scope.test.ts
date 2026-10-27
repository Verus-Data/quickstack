import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { BriefPreview } from "../src/schemas/validate";
import { quiet, runCli } from "./helpers/cli";
import { minimal, writeEntry } from "./helpers/registry";
import { fragment, previewResult, shipped, stack } from "./helpers/show-preview";
import { workspace } from "./helpers/verify";

const space = workspace();
afterEach(() => space.release());

test("a preview ignores an unrelated stack's adapter collision with a shared fragment", async () => {
  const home = space.dir();
  const registry = space.dir();
  stack(registry, "sample", "fragments:\n  default: [shared]");
  const shared = fragment(registry, "shared");
  shipped(shared, "adapters/codex/AGENTS.md", "Shared guidance.\n");
  const unrelated = stack(registry, "unrelated", "fragments:\n  default: [shared]");
  shipped(unrelated, "adapters/codex/AGENTS.md", "Unrelated guidance.\n");

  const result = await runCli(["validate", "--brief", "sample", "--json"], {
    home,
    env: quiet,
    host: { registry },
  });
  expect(previewResult(result)).toMatchObject({
    stack: "sample",
    fragments: ["shared"],
    findings: [],
  });
});

test("preview file checks honor --with and --without instead of the stack's other plans", async () => {
  const home = space.dir();
  const registry = space.dir();
  stack(registry, "sample", "fragments:\n  default: [excluded]\n  optional: [optional]");
  for (const id of ["excluded", "optional"]) {
    const entry = fragment(registry, id);
    shipped(entry, "adapters/codex/AGENTS.md.tmpl", "{{ unknown }}\n");
  }
  const included = fragment(registry, "included");
  shipped(included, "adapters/codex/AGENTS.md", "Selected guidance.\n");

  const result = await runCli(
    ["validate", "--brief", "sample", "--with", "included", "--without", "excluded", "--json"],
    { home, env: quiet, host: { registry } },
  );
  expect(previewResult(result)).toMatchObject({ fragments: ["included"], findings: [] });
});

test("preview file checks use only the selected preset", async () => {
  const home = space.dir();
  const registry = space.dir();
  stack(registry, "sample", "fragments:\n  default: [shared, deployment]");
  const shared = fragment(registry, "shared");
  shipped(shared, "adapters/codex/AGENTS.md", "Shared guidance.\n");
  const deployment = writeEntry({
    root: registry,
    kind: "fragment",
    dir: "deployment",
    frontmatter: minimal("fragment", "deployment").replace("category: tooling", "category: deploy"),
    body: "Deployment guidance.\n",
  });
  shipped(deployment, "adapters/codex/AGENTS.md", "Deployment guidance.\n");

  const result = await runCli(["validate", "--brief", "sample", "--sandbox", "--json"], {
    home,
    env: quiet,
    host: { registry },
  });
  expect(previewResult(result)).toMatchObject({ preset: "sandbox", findings: [] });
});

test("preview still reports a selected template error in a non-default adapter", async () => {
  const home = space.dir();
  const registry = space.dir();
  const entry = stack(registry);
  shipped(entry, "adapters/codex/AGENTS.md.tmpl", "{{ unknown }}\n");

  const result = await runCli(["validate", "--brief", "sample", "--json"], {
    home,
    env: quiet,
    host: { registry },
  });
  expect(result.status).toBe(2);
  const report = Schema.decodeUnknownSync(BriefPreview)(JSON.parse(result.stdout));
  expect(report.findings).toEqual([
    {
      check: "compose",
      severity: "error",
      kind: "stack",
      entry: "sample",
      file: "stacks/sample/adapters/codex/AGENTS.md.tmpl",
      line: 1,
      message: "sample: unknown template variable in adapters/codex/AGENTS.md.tmpl",
    },
  ]);
  expect(result.stderr.trim().split("\n")).toHaveLength(1);
  expect(JSON.parse(result.stderr)).toMatchObject({
    error: { tag: "ValidationFailed", details: { errors: 1, warnings: 0 } },
  });
});
