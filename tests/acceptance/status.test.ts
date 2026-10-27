import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { REPO } from "../helpers/hooks";

const PREFIXES = {
  "PARTIALLY EXECUTED": "Partially executed",
  "IN PROGRESS": "In progress",
  EXECUTING: "In progress",
  EXECUTED: "Executed",
  DEFERRED: "Deferred",
  WITHDRAWN: "Withdrawn",
  AGREED: "Not started",
  DRAFT: "Not started",
};

const rows = readFileSync(join(REPO, "plans/roadmap.md"), "utf8")
  .split("\n")
  .flatMap((line) => {
    const file = /^\| \[[^\]]+\]\(phases\/(phase-[^)]+\.md)\) \|/.exec(line)?.[1];
    if (!file) return [];
    const cells = line
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim())
      .slice(1, -1);
    return [{ file, cell: cells.at(-1) ?? "" }];
  });

const plans = readdirSync(join(REPO, "plans/phases"))
  .filter((file) => /^phase-.*\.md$/.test(file))
  .map((file) => {
    const status =
      readFileSync(join(REPO, "plans/phases", file), "utf8")
        .split("\n")
        .find((line) => line.startsWith("Status:"))
        ?.slice("Status:".length)
        .trim() ?? "";
    const entry = Object.entries(PREFIXES).find(([keyword]) => status.startsWith(keyword));
    const keyword = entry?.[0] ?? "UNKNOWN";
    const prefix = entry?.[1] ?? "UNKNOWN";
    const date = new RegExp(`^${keyword} (\\d{4}-\\d{2}-\\d{2})`).exec(status)?.[1];
    const cell = rows.find((row) => row.file === file)?.cell ?? "MISSING";
    return { file, keyword, prefix, date, cell };
  });

function message(plan: (typeof plans)[number]) {
  return `${plan.file}: ${plan.keyword} ${plan.date ?? "(no date)"}; roadmap cell "${plan.cell}"; update whichever is stale: the plan's Status line or its row in plans/roadmap.md`;
}

it("every phase has exactly one roadmap row and every row names an existing phase", () => {
  for (const plan of plans) {
    expect(
      rows.filter((row) => row.file === plan.file),
      message(plan),
    ).toHaveLength(1);
  }
  for (const row of rows) {
    expect(
      plans.some((plan) => plan.file === row.file),
      message({ ...row, keyword: "MISSING", prefix: "UNKNOWN", date: undefined }),
    ).toBe(true);
  }
});

it.each(plans)("$file status keyword matches its roadmap prefix", (plan) => {
  expect(plan.keyword, message(plan)).not.toBe("UNKNOWN");
  expect(plan.cell.toLowerCase().startsWith(plan.prefix.toLowerCase()), message(plan)).toBe(true);
});

it.each(plans)("$file status date matches when the roadmap also starts with a date", (plan) => {
  const cellDate = new RegExp(`^${plan.prefix} (\\d{4}-\\d{2}-\\d{2})`, "i").exec(plan.cell)?.[1];
  if (plan.date && cellDate) expect(plan.date, message(plan)).toBe(cellDate);
});
