import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { afterEach, expect, test } from "vitest";
import { adapterWorkspace, samples, scaffoldAdapters } from "./helpers/native-adapters";

const space = adapterWorkspace();
afterEach(() => space.cleanup());

test("OpenCode lints a written file and formats it only at session idle, leaving untouched files alone [3.4b#1]", async () => {
  const result = await scaffoldAdapters({ home: space.temp(), agents: ["opencode"] });
  const project = result.project;
  mkdirSync(join(project, ".venv/bin"), { recursive: true });
  mkdirSync(join(project, "tmp"));
  writeFileSync(join(project, "pyproject.toml"), "[tool.ruff]\n");
  const original = "x=1\n";
  writeFileSync(join(project, "changed.py"), original);
  writeFileSync(join(project, "untouched.py"), original);
  const tool = join(project, ".venv/bin/ruff");
  // A real executable at the external tool boundary; no dependency install or machine ruff.
  writeFileSync(
    tool,
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
  chmodSync(tool, 0o755);
  const run = spawnSync("bun", [join(samples, "run-opencode.mjs"), project, "lifecycle"], {
    cwd: project,
    input: "[]",
    encoding: "utf8",
    timeout: 10_000,
    env: { HOME: project, PATH: process.env.PATH ?? "", TMPDIR: join(project, "tmp") },
  });
  expect(run.error).toBeUndefined();
  expect(run.status, run.stderr).toBe(0);
  expect(run.stderr).toBe("");
  const observed = Schema.decodeUnknownSync(Schema.Struct({ afterWrite: Schema.String }))(
    JSON.parse(run.stdout),
  );
  expect(observed.afterWrite).toBe(original);
  expect(readFileSync(join(project, ".lint-calls"), "utf8")).toContain("changed.py");
  expect(readFileSync(join(project, ".lint-calls"), "utf8")).not.toContain("untouched.py");
  expect(readFileSync(join(project, "changed.py"), "utf8")).toBe("x = 1\n");
  expect(readFileSync(join(project, "untouched.py"), "utf8")).toBe(original);
}, 15_000); // Real plugin and shell processes run; no live agent or network.
