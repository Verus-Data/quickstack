// Traces a plan's numbered acceptance tests to the tests that implement them. A test names the
// one it implements with a tag like `[1.2a#4]` (sub-phase, then the plan's number, which may carry
// a letter suffix such as 12a). plans/README.md "Plan conventions" describes the convention.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** The line that opts a plan into tracing. */
export const TRACED_MARKER = "Acceptance tests: traced";

export type Plan = { subPhase: string; file: string; traced: boolean; numbers: string[] };
export type Tag = { subPhase: string; number: string; file: string };

const PLAN_FILE = /^phase-(\d+\.\d+[a-z]?)-.*\.md$/;
const NUMBERED = /^(\d+[a-z]?)\.\s/;
const TAG = /\[(\d+\.\d+[a-z]?)#(\d+[a-z]?)\]/g;

/** Every plan in `dir`, with the numbers listed under its "## Acceptance tests" heading. */
export function readPlans(dir: string): Plan[] {
  return readdirSync(dir)
    .filter((name) => PLAN_FILE.test(name))
    .sort()
    .map((name) => {
      const text = readFileSync(join(dir, name), "utf8");
      const lines = text.split("\n");
      const numbers: string[] = [];
      let inSection = false;
      let inFence = false;
      for (const line of lines) {
        if (line.startsWith("```")) inFence = !inFence;
        if (inFence) continue;
        if (line.startsWith("## ")) inSection = line.trim() === "## Acceptance tests";
        const number = inSection ? NUMBERED.exec(line)?.[1] : undefined;
        if (number !== undefined) numbers.push(number);
      }
      return {
        subPhase: PLAN_FILE.exec(name)?.[1] as string,
        file: name,
        traced: lines.some((line) => line.trim() === TRACED_MARKER),
        numbers,
      };
    });
}

/** Every tag in the `.ts` files under `roots`, with its file relative to `base`. */
export function readTags(base: string, roots: string[]): Tag[] {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return files(path);
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    });
  return roots
    .flatMap((root) => files(root))
    .flatMap((path) =>
      [...readFileSync(path, "utf8").matchAll(TAG)].map((match) => ({
        subPhase: match[1] as string,
        number: match[2] as string,
        file: relative(base, path),
      })),
    );
}

/** What fails the trace: untagged numbers in opted-in plans, and tags no plan lists. Sorted. */
export function traceProblems(plans: Plan[], tags: Tag[]): string[] {
  const problems: string[] = [];
  const bySubPhase = new Map(plans.map((plan) => [plan.subPhase, plan]));
  for (const plan of plans.filter((p) => p.traced)) {
    if (plan.numbers.length === 0) {
      problems.push(`${plan.file} is traced but lists no numbered acceptance tests`);
    }
    for (const number of plan.numbers) {
      if (!tags.some((tag) => tag.subPhase === plan.subPhase && tag.number === number)) {
        problems.push(`[${plan.subPhase}#${number}] has no tagged test`);
      }
    }
  }
  for (const tag of tags) {
    const plan = bySubPhase.get(tag.subPhase);
    if (plan === undefined) {
      problems.push(`[${tag.subPhase}#${tag.number}] in ${tag.file}: no plan for ${tag.subPhase}`);
    } else if (!plan.numbers.includes(tag.number)) {
      problems.push(
        `[${tag.subPhase}#${tag.number}] in ${tag.file}: ${plan.file} has no acceptance test ${tag.number}`,
      );
    }
  }
  return [...new Set(problems)].sort();
}
