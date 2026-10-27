import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { adapterWorkspace, samples, scaffoldAdapters } from "./helpers/native-adapters";

const space = adapterWorkspace();
afterEach(() => space.cleanup());

test("OpenCode guards native apply_patch additions, updates and moves through the shared secret check", async () => {
  const result = await scaffoldAdapters({ home: space.temp(), agents: ["opencode"] });
  const tmp = join(result.project, "tmp");
  mkdirSync(tmp);
  const patches = [
    "*** Add File: .env\n+DEBUG=1",
    '*** Update File: src/config.ts\n@@\n-export const value = 1;\n+export const pem = "-----BEGIN PRIVATE KEY-----";',
    "*** Update File: config.txt\n*** Move to: .env.local\n@@\n-DEBUG=0\n+DEBUG=1",
    "*** Add File: src/harmless.ts\n+export const value = 1;",
    "*** Add File: .env.example\n+KEY=-----BEGIN PRIVATE KEY-----",
    "*** Add File: src/harmless.ts\n+export const value = 1;\n*** Update File: .env.local\n@@\n-DEBUG=0\n+DEBUG=1",
  ];
  const run = spawnSync("bun", [join(samples, "run-opencode.mjs"), result.project], {
    cwd: result.project,
    input: JSON.stringify(
      patches.map((patch) => ({
        input: { tool: "apply_patch", sessionID: "patch-regression", callID: "patch-call" },
        output: { args: { patchText: `*** Begin Patch\n${patch}\n*** End Patch` } },
      })),
    ),
    encoding: "utf8",
    timeout: 10_000,
    env: { HOME: result.project, PATH: process.env.PATH ?? "", TMPDIR: tmp },
  });
  expect(run.error).toBeUndefined();
  expect(run.status, run.stderr).toBe(0);
  expect(run.stderr).toBe("");
  const decisions = Schema.decodeUnknownSync(
    Schema.Array(Schema.Struct({ blocked: Schema.Boolean, reason: Schema.String })),
  )(JSON.parse(run.stdout));
  expect(decisions.map((decision) => decision.blocked)).toEqual([
    true,
    true,
    true,
    false,
    false,
    true,
  ]);
  for (const decision of decisions.filter((decision) => decision.blocked))
    expect(decision.reason).toMatch(/BLOCKED/);
});

test.each(["write", "apply_patch"])(
  "OpenCode %s lints each changed patch path and defers native formatter dispatch until idle",
  async (tool) => {
    const result = await scaffoldAdapters({ home: space.temp(), agents: ["opencode"] });
    const project = result.project;
    mkdirSync(join(project, ".venv/bin"), { recursive: true });
    mkdirSync(join(project, "tmp"));
    writeFileSync(join(project, "pyproject.toml"), "[tool.ruff]\n");
    for (const file of ["changed.py", "moved.py", "untouched.py"])
      writeFileSync(join(project, file), "x=1\n");
    const ruff = join(project, ".venv/bin/ruff");
    writeFileSync(
      ruff,
      `#!/bin/sh
case "$1" in
  check)
    case " $* " in *" --fix "*) exit 0 ;; esac
    printf '%s\\n' "$@" >> .lint-calls
    echo 'F401 fixture lint diagnostic'
    exit 1
    ;;
  format)
    shift
    for file in "$@"; do
      case "$file" in *.py) printf 'x = 1\\n' > "$file" ;; esac
    done
    ;;
esac
`,
    );
    chmodSync(ruff, 0o755);
    const fixture = join(import.meta.dirname, "fixtures/native-adapter-regressions/lifecycle.mjs");
    const run = spawnSync("bun", [fixture, project, tool], {
      cwd: project,
      encoding: "utf8",
      timeout: 10_000,
      env: {
        HOME: project,
        PATH: `${join(project, ".venv/bin")}:${process.env.PATH ?? ""}`,
        TMPDIR: join(project, "tmp"),
      },
    });
    expect(run.error).toBeUndefined();
    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).toBe("");
    const observed = Schema.decodeUnknownSync(
      Schema.Struct({ afterWrite: Schema.String, output: Schema.String }),
    )(JSON.parse(run.stdout));
    expect(observed.afterWrite).toBe("x=1\n");
    expect(observed.output).toContain("F401 fixture lint diagnostic");
    const calls = readFileSync(join(project, ".lint-calls"), "utf8");
    expect(calls).toContain("changed.py");
    expect(calls).not.toContain("untouched.py");
    expect(readFileSync(join(project, "changed.py"), "utf8")).toBe("x = 1\n");
    expect(readFileSync(join(project, "untouched.py"), "utf8")).toBe("x=1\n");
    if (tool === "apply_patch") {
      expect(calls).toContain("moved.py");
      expect(readFileSync(join(project, "moved.py"), "utf8")).toBe("x = 1\n");
    }
  },
  15_000, // Real plugin and installed-tool boundary processes; no live agent or network.
);
