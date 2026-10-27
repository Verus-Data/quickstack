import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPlans, readTags, TRACED_MARKER, traceProblems } from "../helpers/acceptance";
import { REPO } from "../helpers/hooks";

const PLAN = `# Phase 7.1a: fixture

Status: EXECUTED 2026-10-26
${TRACED_MARKER}

## Steps

1. Not an acceptance test.

## Acceptance tests

Some prose.

1. The first test.
2. A test whose text wraps onto a line that starts with a version,
   1.2a's files, which is not a new item.
2a. A suffixed test.

\`\`\`
3. Inside a fence, not a test.
\`\`\`

### Realistic edge cases

3. A symlinked root.

## Exit criteria

4. Not an acceptance test either.
`;

const UNTRACED = `# Phase 7.2: fixture

Status: EXECUTED 2026-10-26

## Acceptance tests

1. Only test.
`;

let root: string | undefined;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function fixture(tests: Record<string, string>) {
  root = mkdtempSync(join(tmpdir(), "acceptance-"));
  mkdirSync(join(root, "plans"));
  writeFileSync(join(root, "plans", "phase-7.1a-fixture.md"), PLAN);
  writeFileSync(join(root, "plans", "phase-7.2-other.md"), UNTRACED);
  writeFileSync(join(root, "plans", "README.md"), "1. not a plan\n");
  for (const [path, text] of Object.entries(tests)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const plans = readPlans(join(root, "plans"));
  const tags = readTags(root, [join(root, "tests"), join(root, "e2e")]);
  return { plans, problems: traceProblems(plans, tags) };
}

const ALL_TAGGED = {
  "tests/a.test.ts": `test("first [7.1a#1]", () => {}); test("second [7.1a#2]", () => {});`,
  "tests/nested/b.test.ts": `it.each([["[7.1a#2a]"]])("%s", () => {});`,
  "e2e/c.test.ts": `test("edge case [7.1a#3]", () => {});`,
};

describe("acceptance tracing", () => {
  it("reads only the numbered items of the acceptance section, suffixes included", () => {
    const { plans } = fixture({ "tests/a.test.ts": "", "e2e/b.test.ts": "" });
    expect(plans).toEqual([
      {
        subPhase: "7.1a",
        file: "phase-7.1a-fixture.md",
        traced: true,
        numbers: ["1", "2", "2a", "3"],
      },
      { subPhase: "7.2", file: "phase-7.2-other.md", traced: false, numbers: ["1"] },
    ]);
  });

  it("passes when every number of a traced plan has a tag under tests or e2e", () => {
    expect(fixture(ALL_TAGGED).problems).toEqual([]);
  });

  it("lists each number of a traced plan that has no tagged test", () => {
    const { problems } = fixture({
      ...ALL_TAGGED,
      "tests/nested/b.test.ts": "",
      "e2e/c.test.ts": "",
    });
    expect(problems).toEqual(["[7.1a#2a] has no tagged test", "[7.1a#3] has no tagged test"]);
  });

  it("lists tags naming a number or a sub-phase no plan has, traced or not", () => {
    const { problems } = fixture({
      ...ALL_TAGGED,
      "tests/extra.test.ts": `test("x [7.1a#4]"); test("y [7.2#2]"); test("z [9.9#1]"); test("ok [7.2#1]");`,
    });
    expect(problems).toEqual([
      "[7.1a#4] in tests/extra.test.ts: phase-7.1a-fixture.md has no acceptance test 4",
      "[7.2#2] in tests/extra.test.ts: phase-7.2-other.md has no acceptance test 2",
      "[9.9#1] in tests/extra.test.ts: no plan for 9.9",
    ]);
  });

  it("fails a traced plan whose acceptance section has no numbered tests", () => {
    root = mkdtempSync(join(tmpdir(), "acceptance-"));
    writeFileSync(
      join(root, "phase-7.3-bullets.md"),
      `${TRACED_MARKER}\n\n## Acceptance tests\n\n- A bullet.\n`,
    );
    expect(traceProblems(readPlans(root), [])).toEqual([
      "phase-7.3-bullets.md is traced but lists no numbered acceptance tests",
    ]);
  });

  it("holds for this repo's plans and every package's tests", () => {
    const packages = join(REPO, "packages");
    const dirs = readdirSync(packages).flatMap((name) =>
      ["tests", "e2e"].map((dir) => join(packages, name, dir)).filter((dir) => existsSync(dir)),
    );
    const plans = readPlans(join(REPO, "plans", "phases"));
    const tags = readTags(REPO, dirs);
    expect(traceProblems(plans, tags)).toEqual([]);
  });
});
