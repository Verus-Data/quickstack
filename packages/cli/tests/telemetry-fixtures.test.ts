import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { expect, test } from "vitest";
import { AddResult } from "../src/schemas/add";
import { NewResult } from "../src/schemas/new";
import { VerifyResult } from "../src/schemas/verify";
import { ndjson, runCli } from "./helpers/cli";
import { ok, registry, workspace } from "./helpers/telemetry";
import { readManifestAt } from "./helpers/verify";

// This fixture check intentionally stays green before telemetry exists: a red acceptance test
// must not conceal an invalid registry or an impossible setup behind its missing-module import.
test("telemetry's real registry and changed-step fixtures work without the future service", async () => {
  const space = workspace();
  try {
    const options = {
      home: space.home,
      env: { PATH: process.env.PATH, LOG_LEVEL: "none", XDG_STATE_HOME: join(space.home, "state") },
      host: { registry, cwd: space.home, stdinIsTTY: true },
    };
    ok(await runCli(["validate", registry, "--json"], options));
    const created = await runCli(["new", "go-cli", "project", "--json"], options);
    ok(created);
    Schema.decodeUnknownSync(NewResult)(JSON.parse(created.stdout));
    const root = join(space.home, "project");
    const project = { ...options, host: { ...options.host, cwd: root } };
    const added = await runCli(["add", "extra", "--json"], project);
    ok(added);
    Schema.decodeUnknownSync(AddResult)(JSON.parse(added.stdout));
    const manifest = readManifestAt(root);
    writeFileSync(
      join(root, ".stacks/manifest.json"),
      JSON.stringify({
        ...manifest,
        verify: [
          ...manifest.verify,
          {
            name: "private-app-test",
            phase: "check",
            layer: "test",
            run: "false",
            tags: ["app"],
            skipByDefault: false,
            owner: "go-cli",
          },
        ],
      }),
    );
    const verify = await runCli(["verify", "--accept-changes", "--json"], project);
    expect(verify.status).toBe(5);
    expect(Schema.decodeUnknownSync(VerifyResult)(JSON.parse(verify.stdout))).toMatchObject({
      outcome: "failed",
      stages: { base: "green", app: "failed" },
    });
    expect(ndjson(verify.stderr).at(-1)).toMatchObject({ error: { tag: "VerifyFailed" } });
    expect(readFileSync(join(root, ".stacks/manifest.json"), "utf8")).toContain("private-app-test");
  } finally {
    space.cleanup();
  }
});
